import { app, dialog, shell } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { DownloadTask } from '@shared/types'
import { loadSettings, saveSettings } from '../settings'
import { session as vault } from '../vault/session'
import { browserSession } from '../browser/session'
import { getMainWindow } from '../window'
import { STREAM_USER_AGENT, buildStreamArgs, resolveFfmpeg, streamDurationSeconds } from './ffmpeg'

const PROGRESS_THROTTLE_MS = 250
const HISTORY_LIMIT = 300

export interface StartDownloadInput {
  url: string
  kind: 'file' | 'hls'
  pageUrl: string
  fileName?: string
  /** ファイル名の元にするページタイトル */
  pageTitle?: string
  /** true なら保存先をダイアログで確認する */
  saveAs?: boolean
}

// Windows のファイル名に使えない文字と制御文字を潰す。
const ILLEGAL_FILENAME_CHARS = new RegExp('[<>:"/\\\\|?*\\u0000-\\u001f]', 'g')

function sanitizeFileName(name: string): string {
  return (
    name
      .replace(ILLEGAL_FILENAME_CHARS, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'download'
  )
}

function uniquePath(dir: string, fileName: string): string {
  const ext = extname(fileName)
  const base = fileName.slice(0, fileName.length - ext.length)
  let candidate = join(dir, fileName)
  let counter = 2
  while (existsSync(candidate)) {
    candidate = join(dir, `${base} (${counter})${ext}`)
    counter += 1
  }
  return candidate
}

/** URL の末尾から拡張子だけを取り出す。 */
function extensionFromUrl(url: string, fallbackExt: string): string {
  try {
    const path = new URL(url).pathname
    const last = decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '')
    const ext = extname(last)
    if (ext && ext.length <= 5) return ext
  } catch {
    // URL として壊れていても、下の既定へ落ちる。
  }
  return fallbackExt || '.mp4'
}

/**
 * 保存時の既定のファイル名。
 * 動画サイトの URL は /get_file/abc123 のように内容を表さないことが多いため、
 * ページタイトルを優先する。右クリックからでも一覧からでも同じ名前になる。
 */
function guessFileName(url: string, fallbackExt: string, pageTitle?: string): string {
  const ext = extensionFromUrl(url, fallbackExt)
  const fromTitle = sanitizeFileName(pageTitle ?? '')
  if (fromTitle && fromTitle !== 'download') return `${fromTitle}${ext}`

  try {
    const path = new URL(url).pathname
    const last = decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '')
    if (last) return sanitizeFileName(extname(last) ? last : `${last}${ext}`)
  } catch {
    // 下の既定名へ落ちる。
  }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '')
  return sanitizeFileName(`video-${stamp}${ext}`)
}

/**
 * ダウンロードの実行と履歴を持つ。
 * 直リンクは fetch で自前に取得し、HLS / DASH は ffmpeg の子プロセスで処理する。
 * 実行中の進捗は主記憶だけで扱い、確定した結果のみヴォールトへ書く（保存の連打を避けるため）。
 */
class DownloadManager extends EventEmitter {
  private live = new Map<string, DownloadTask>()
  private processes = new Map<string, ChildProcess>()
  private controllers = new Map<string, AbortController>()
  private lastEmit = new Map<string, number>()

  init(): void {
    // 直リンクは fetch で自前に取得する（Referer を確実に送るため）。
    // ページ側が始めたダウンロードは Electron の既定動作に任せる。
  }

  downloadDir(): string {
    const dir = loadSettings().downloadDir ?? app.getPath('downloads')
    mkdirSync(dir, { recursive: true })
    return dir
  }

  list(): DownloadTask[] {
    const history = vault.isUnlocked ? (vault.getModel().downloads ?? []) : []
    return [...this.live.values(), ...history].sort((a, b) => b.startedAt - a.startedAt)
  }

  clearHistory(): number {
    if (!vault.isUnlocked) return 0
    const count = vault.getModel().downloads.length
    vault.getModel().downloads = []
    vault.markDirty()
    return count
  }

  reveal(id: string): void {
    const task = this.list().find((entry) => entry.id === id)
    if (task && existsSync(task.savePath)) shell.showItemInFolder(task.savePath)
  }

  cancel(id: string): void {
    const controller = this.controllers.get(id)
    if (controller) {
      this.controllers.delete(id)
      controller.abort()
    }
    const proc = this.processes.get(id)
    if (proc) {
      this.processes.delete(id)
      proc.kill()
      this.finish(id, 'canceled', 'キャンセルしました。')
    }
  }

  async start(input: StartDownloadInput): Promise<DownloadTask | null> {
    const dir = this.downloadDir()
    const fallbackExt = input.kind === 'hls' ? '.mp4' : ''
    let fileName = sanitizeFileName(input.fileName ?? guessFileName(input.url, fallbackExt, input.pageTitle))
    if (input.kind === 'hls' && !/\.(mp4|mkv|ts)$/i.test(fileName)) fileName = `${fileName}.mp4`

    let savePath: string
    if (input.saveAs) {
      const chosen = await this.askSavePath(dir, fileName, input.kind)
      if (!chosen) return null
      savePath = chosen
    } else {
      savePath = uniquePath(dir, fileName)
    }

    const task: DownloadTask = {
      id: randomUUID(),
      url: input.url,
      kind: input.kind,
      fileName: basename(savePath),
      savePath,
      status: 'running',
      receivedBytes: 0,
      totalBytes: 0,
      progress: null,
      error: null,
      startedAt: Date.now(),
      finishedAt: null,
      pageUrl: input.pageUrl,
    }
    this.live.set(task.id, task)
    this.emitChange(task, true)

    if (input.kind === 'file') void this.startFile(task)
    else await this.startStream(task)
    return task
  }

  /** 保存先を尋ねる。既定位置は前回「名前を付けて保存」で使ったフォルダー。 */
  private async askSavePath(dir: string, fileName: string, kind: 'file' | 'hls'): Promise<string | null> {
    const baseDir = loadSettings().lastSaveDir ?? dir
    const ext = extname(fileName).replace('.', '') || (kind === 'hls' ? 'mp4' : '')
    const window = getMainWindow()
    const options: Electron.SaveDialogOptions = {
      title: '名前を付けて保存',
      defaultPath: join(baseDir, fileName),
      filters: ext
        ? [
            { name: ext.toUpperCase(), extensions: [ext] },
            { name: 'すべてのファイル', extensions: ['*'] },
          ]
        : [{ name: 'すべてのファイル', extensions: ['*'] }],
    }
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    // 次回の既定位置として覚えておく。
    saveSettings({ lastSaveDir: dirname(result.filePath) })
    return result.filePath
  }

  /**
   * 直リンクの取得。
   * Chromium の downloadURL は Referer の指定を受け付けない（発信元から自動で決まるため、
   * headers に入れても onBeforeSendHeaders で差し込んでも落とされる）。
   * ホットリンク防止のあるサイトでは、ページ内で再生できるのに保存だけ 403 になる。
   * そのため自前で取得し、ヘッダーを完全に制御する。
   */
  private async startFile(task: DownloadTask): Promise<void> {
    const controller = new AbortController()
    this.controllers.set(task.id, controller)

    try {
      const referer = task.pageUrl || task.url
      const cookies = await browserSession()
        .cookies.get({ url: task.url })
        .catch(() => [])
      const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')

      const response = await fetch(task.url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': STREAM_USER_AGENT,
          Referer: referer,
          Accept: '*/*',
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
      })

      if (!response.ok || !response.body) {
        this.finish(task.id, 'failed', `サーバーが ${response.status} を返しました。`)
        return
      }

      const total = Number(response.headers.get('content-length') ?? '0')
      task.totalBytes = Number.isFinite(total) ? total : 0

      const file = createWriteStream(task.savePath)
      const reader = response.body.getReader()
      let received = 0

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          received += value.byteLength
          task.receivedBytes = received
          task.progress = task.totalBytes > 0 ? received / task.totalBytes : null
          this.emitChange(task)
          if (!file.write(Buffer.from(value))) {
            await new Promise<void>((resolve) => file.once('drain', () => resolve()))
          }
        }
      }
      await new Promise<void>((resolve, reject) => {
        file.end(() => resolve())
        file.on('error', reject)
      })

      this.finish(task.id, 'completed', null)
    } catch (error) {
      if (controller.signal.aborted) this.finish(task.id, 'canceled', 'キャンセルしました。')
      else this.finish(task.id, 'failed', error instanceof Error ? error.message : String(error))
    } finally {
      this.controllers.delete(task.id)
    }
  }

  private async startStream(task: DownloadTask): Promise<void> {
    const ffmpeg = resolveFfmpeg()
    if (!ffmpeg) {
      this.finish(task.id, 'failed', 'ffmpeg が見つかりません。設定から実行ファイルを指定してください。')
      return
    }

    const referer = task.pageUrl || task.url
    const cookies = await browserSession()
      .cookies.get({ url: task.url })
      .catch(() => [])
    const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')

    const headers: Record<string, string> = {
      'User-Agent': STREAM_USER_AGENT,
      Referer: referer,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    }

    const duration = await streamDurationSeconds(task.url, headers)

    const args = buildStreamArgs({
      url: task.url,
      savePath: task.savePath,
      referer,
      cookieHeader,
    })

    const proc = spawn(ffmpeg, args, { windowsHide: true })
    this.processes.set(task.id, proc)

    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      const micros = /out_time_us=(\d+)/.exec(text)?.[1]
      if (micros && duration) task.progress = Math.min(1, Number(micros) / 1_000_000 / duration)
      const size = /total_size=(\d+)/.exec(text)?.[1]
      if (size) task.receivedBytes = Number(size)
      this.emitChange(task)
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-2000)
    })
    proc.on('error', (error) => {
      this.processes.delete(task.id)
      this.finish(task.id, 'failed', error.message)
    })
    proc.on('close', (code) => {
      // cancel() が先に片付けている場合はここで二重に確定させない。
      if (!this.processes.has(task.id)) return
      this.processes.delete(task.id)
      if (code === 0) this.finish(task.id, 'completed', null)
      else {
        const detail = stderr.split('\n').filter(Boolean).pop()
        this.finish(task.id, 'failed', detail ?? `ffmpeg が終了コード ${code} で終了しました。`)
      }
    })
  }

  private finish(id: string, status: DownloadTask['status'], error: string | null): void {
    const task = this.live.get(id)
    if (!task) return
    task.status = status
    task.error = error
    task.finishedAt = Date.now()
    if (status === 'completed') task.progress = 1
    this.live.delete(id)
    this.lastEmit.delete(id)

    if (vault.isUnlocked) {
      const model = vault.getModel()
      model.downloads = [task, ...model.downloads].slice(0, HISTORY_LIMIT)
      vault.markDirty()
    }
    this.emit('changed', task)
  }

  /** 進捗イベントは秒間数回に間引く。開始と完了は必ず流す。 */
  private emitChange(task: DownloadTask, force = false): void {
    const now = Date.now()
    if (!force && now - (this.lastEmit.get(task.id) ?? 0) < PROGRESS_THROTTLE_MS) return
    this.lastEmit.set(task.id, now)
    this.emit('changed', task)
  }
}

export const downloads = new DownloadManager()
