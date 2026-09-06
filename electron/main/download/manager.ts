import { app, dialog, shell } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { IPC_EVENT } from '@shared/ipc'
import type { AlbumDownloadProgress, AlbumDownloadTask, DownloadTask } from '@shared/types'
import { loadSettings, saveSettings } from '../settings'
import { session as vault } from '../vault/session'
import { browserSession } from '../browser/session'
import { emitToRenderer, getMainWindow } from '../window'
import {
  STREAM_USER_AGENT,
  buildStreamArgs,
  concatVideos,
  createImageSlideshow,
  resolveFfmpeg,
  streamDurationSeconds,
} from './ffmpeg'

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

export interface StartAlbumDownloadInput {
  albumTitle: string
  pageUrl: string
  items: {
    url: string
    kind: 'image' | 'video'
    fileName: string
  }[]
  saveAs?: boolean
  withIndexPrefix?: boolean
  concatVideos?: boolean
  createSlideshow?: boolean
  slideshowDuration?: number
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

function uniqueDir(parentDir: string, folderName: string): string {
  let candidate = join(parentDir, folderName)
  let counter = 2
  while (existsSync(candidate)) {
    candidate = join(parentDir, `${folderName} (${counter})`)
    counter += 1
  }
  return candidate
}

// マニフェストの拡張子。保存されるのは結合後の mp4 なので、名前には使わない。
const MANIFEST_EXT = /^\.(m3u8|mpd)$/i

/** URL の末尾から拡張子だけを取り出す。 */
function extensionFromUrl(url: string, fallbackExt: string): string {
  try {
    const path = new URL(url).pathname
    const last = decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '')
    const ext = extname(last)
    if (ext && ext.length <= 5 && !MANIFEST_EXT.test(ext)) return ext
  } catch {
    // URL として壊れていても、下の既定へ落ちる。
  }
  return fallbackExt || '.mp4'
}

// /video/ や /watch/ のような、ID ではない区切りの語
const PATH_NOISE = /^(video|videos|watch|embed|player|play|movie|movies|media|file|files|get_file|stream|v|e|w)$/i
// index.m3u8 のように、どの動画でも同じ名前になるもの
const GENERIC_BASENAME = /^(index|master|playlist|manifest|chunklist|out|output|video|media|stream|file|default)([-_.]?\d+)?$/i

/** URL の末尾（クエリを除いた部分）から拡張子を落とした名前を取り出す。 */
function basenameOf(url: string): string {
  try {
    const path = new URL(url).pathname
    const last = decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '')
    return last.slice(0, last.length - extname(last).length)
  } catch {
    return ''
  }
}

/** ページ URL からサイト内の ID らしき区画を探す。 */
function idFromPageUrl(pageUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(pageUrl)
  } catch {
    return ''
  }

  for (const key of ['v', 'id', 'vid', 'video_id']) {
    const value = parsed.searchParams.get(key)
    if (value && /^[\w-]{3,32}$/.test(value)) return value
  }

  const segments = parsed.pathname
    .split('/')
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part)
      } catch {
        return part
      }
    })

  const numeric = segments.find((part) => /^\d{2,}$/.test(part))
  if (numeric) return numeric

  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const bare = segments[i].slice(0, segments[i].length - extname(segments[i]).length)
    if (!bare || PATH_NOISE.test(bare)) continue
    if (/^[\w-]{3,32}$/.test(bare)) return bare
  }
  return ''
}

/**
 * 動画を特定する ID。
 * 実ファイルの名前（例: 12523473-1080p）が最も内容に近いのでそれを優先し、
 * index.m3u8 のように意味を持たない場合だけページ URL 側の ID を使う。
 */
function extractId(pageUrl: string, mediaUrl: string): string {
  const base = basenameOf(mediaUrl)
  if (base && base.length <= 64 && !GENERIC_BASENAME.test(base) && !PATH_NOISE.test(base)) return base
  return idFromPageUrl(pageUrl)
}

/**
 * 保存時の既定のファイル名。「タイトル ID.拡張子」の順で組み立てる。
 * 動画サイトの URL は内容を表さないことが多いためタイトルを主に据えつつ、
 * 同じタイトルの動画を区別できるよう ID を添える。
 */
function guessFileName(url: string, fallbackExt: string, pageTitle?: string, pageUrl?: string): string {
  const ext = extensionFromUrl(url, fallbackExt)
  const title = sanitizeFileName(pageTitle ?? '')
  const id = sanitizeFileName(extractId(pageUrl ?? '', url))

  const hasTitle = Boolean(title) && title !== 'download'
  // タイトルに既に ID が含まれている場合は重ねない
  const needsId = Boolean(id) && !(hasTitle && title.toLowerCase().includes(id.toLowerCase()))

  if (hasTitle) return `${title}${needsId ? ` ${id}` : ''}${ext}`
  if (id) return `${id}${ext}`

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

  private albumTasks = new Map<string, AlbumDownloadTask>()
  private albumControllers = new Map<string, AbortController>()
  private albumLastEmit = new Map<string, number>()

  init(): void {
    // 直リンクは fetch で自前に取得する（Referer を確実に送るため）。
    // ページ側が始めたダウンロードは Electron の既定動作に任せる。
  }

  /**
   * 終了時の後始末。
   * ffmpeg は別プロセスなので、明示的に止めないとアプリを閉じたあとも残る。
   */
  shutdown(): void {
    for (const controller of this.controllers.values()) controller.abort()
    this.controllers.clear()
    for (const proc of this.processes.values()) {
      try {
        proc.kill()
      } catch {
        // 既に終了している場合は何もしなくてよい。
      }
    }
    this.processes.clear()

    // 実行中だったものは中断として履歴へ残す。
    for (const task of [...this.live.values()]) {
      this.finish(task.id, 'canceled', 'アプリの終了により中断しました。')
    }

    // アルバムダウンロードも中断
    for (const controller of this.albumControllers.values()) controller.abort()
    this.albumControllers.clear()
    for (const task of this.albumTasks.values()) {
      if (task.status === 'running') {
        task.status = 'canceled'
        task.error = 'アプリの終了により中断しました。'
        task.finishedAt = Date.now()
        this.emitAlbumProgress(task, true)
      }
    }
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
    if (!task || !existsSync(task.savePath)) return
    try {
      if (statSync(task.savePath).isDirectory()) {
        void shell.openPath(task.savePath)
        return
      }
    } catch {
      // stat 失敗時はフォールバック
    }
    shell.showItemInFolder(task.savePath)
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
    let fileName = sanitizeFileName(input.fileName ?? guessFileName(input.url, fallbackExt, input.pageTitle, input.pageUrl))
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

  /** アルバム全体のダウンロードを開始する。 */
  async startAlbum(input: StartAlbumDownloadInput): Promise<AlbumDownloadTask | null> {
    const baseDir = this.downloadDir()
    const safeFolder = sanitizeFileName(input.albumTitle) || 'album'
    let folderPath: string

    if (input.saveAs) {
      const window = getMainWindow()
      const lastDir = loadSettings().lastSaveDir ?? baseDir
      const result = window
        ? await dialog.showOpenDialog(window, {
            title: 'アルバムの保存先フォルダーを選ぶ',
            defaultPath: lastDir,
            properties: ['openDirectory', 'createDirectory'],
          })
        : await dialog.showOpenDialog({
            title: 'アルバムの保存先フォルダーを選ぶ',
            defaultPath: lastDir,
            properties: ['openDirectory', 'createDirectory'],
          })
      if (result.canceled || result.filePaths.length === 0) return null
      const chosenParent = result.filePaths[0]
      saveSettings({ lastSaveDir: chosenParent })
      folderPath = uniqueDir(chosenParent, safeFolder)
    } else {
      folderPath = uniqueDir(baseDir, safeFolder)
    }

    mkdirSync(folderPath, { recursive: true })

    const taskId = randomUUID()
    const controller = new AbortController()
    this.albumControllers.set(taskId, controller)

    const task: AlbumDownloadTask = {
      id: taskId,
      albumTitle: input.albumTitle,
      pageUrl: input.pageUrl,
      folderPath,
      totalCount: input.items.length,
      completedCount: 0,
      failedCount: 0,
      receivedBytes: 0,
      status: 'running',
      currentFileName: null,
      error: null,
      startedAt: Date.now(),
      finishedAt: null,
    }
    this.albumTasks.set(taskId, task)
    this.emitAlbumProgress(task, true)

    void this.runAlbumQueue(task, input.items, controller, input)
    return task
  }

  cancelAlbum(id: string): void {
    const controller = this.albumControllers.get(id)
    if (controller) {
      this.albumControllers.delete(id)
      controller.abort()
    }
    const task = this.albumTasks.get(id)
    if (task && task.status === 'running') {
      task.status = 'canceled'
      task.error = 'キャンセルしました。'
      task.finishedAt = Date.now()
      this.emitAlbumProgress(task, true)
    }
  }

  revealAlbum(id: string): void {
    const task = this.albumTasks.get(id)
    if (task && existsSync(task.folderPath)) {
      void shell.openPath(task.folderPath)
    }
  }

  albumList(): AlbumDownloadTask[] {
    return [...this.albumTasks.values()].sort((a, b) => b.startedAt - a.startedAt)
  }

  private async runAlbumQueue(
    task: AlbumDownloadTask,
    items: StartAlbumDownloadInput['items'],
    controller: AbortController,
    options: StartAlbumDownloadInput,
  ): Promise<void> {
    const CONCURRENCY = 3
    let index = 0

    const referer = task.pageUrl
    const cookies = await browserSession()
      .cookies.get({ url: task.pageUrl })
      .catch(() => [])
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const downloadItem = async (item: StartAlbumDownloadInput['items'][number]): Promise<void> => {
      if (controller.signal.aborted) return

      const safeName = sanitizeFileName(item.fileName)
      const savePath = join(task.folderPath, safeName)
      task.currentFileName = item.fileName
      this.emitAlbumProgress(task)

      try {
        const response = await fetch(item.url, {
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
          task.failedCount += 1
          this.emitAlbumProgress(task)
          return
        }

        const file = createWriteStream(savePath)
        const reader = response.body.getReader()

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            task.receivedBytes += value.byteLength
            this.emitAlbumProgress(task)
            if (!file.write(Buffer.from(value))) {
              await new Promise<void>((resolve) => file.once('drain', () => resolve()))
            }
          }
        }

        await new Promise<void>((resolve, reject) => {
          file.end(() => resolve())
          file.on('error', reject)
        })

        task.completedCount += 1
        this.emitAlbumProgress(task)
      } catch {
        if (controller.signal.aborted) return
        task.failedCount += 1
        this.emitAlbumProgress(task)
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (index < items.length && !controller.signal.aborted) {
        const currentItem = items[index++]
        await downloadItem(currentItem)
      }
    })

    await Promise.all(workers)

    // メディアダウンロード完了後の動画結合 / スライドショー生成処理
    if (!controller.signal.aborted && task.completedCount > 0) {
      const settings = loadSettings()
      const shouldConcatVideos = options.concatVideos ?? settings.albumConcatVideos ?? false
      const shouldCreateSlideshow = options.createSlideshow ?? settings.albumCreateSlideshow ?? false
      const slideshowDuration = options.slideshowDuration ?? settings.albumSlideshowDuration ?? 3

      const savedVideoPaths = items
        .filter((i) => i.kind === 'video')
        .map((i) => join(task.folderPath, sanitizeFileName(i.fileName)))
        .filter((p) => existsSync(p) && statSync(p).size > 0)

      const savedImagePaths = items
        .filter((i) => i.kind === 'image')
        .map((i) => join(task.folderPath, sanitizeFileName(i.fileName)))
        .filter((p) => existsSync(p) && statSync(p).size > 0)

      if (shouldConcatVideos && savedVideoPaths.length > 0) {
        task.currentFileName = '動画を結合中...'
        this.emitAlbumProgress(task, true)
        const concatOut = uniquePath(task.folderPath, `${sanitizeFileName(task.albumTitle)}_動画結合.mp4`)
        const concatRes = await concatVideos(savedVideoPaths, concatOut, controller.signal)
        if (concatRes.ok && existsSync(concatOut)) {
          task.receivedBytes += statSync(concatOut).size
        }
      }

      if (!controller.signal.aborted && shouldCreateSlideshow && savedImagePaths.length > 0) {
        task.currentFileName = '画像スライドショー動画を生成中...'
        this.emitAlbumProgress(task, true)
        const slideshowOut = uniquePath(task.folderPath, `${sanitizeFileName(task.albumTitle)}_スライドショー.mp4`)
        const slideshowRes = await createImageSlideshow(
          savedImagePaths,
          slideshowOut,
          slideshowDuration,
          controller.signal,
        )
        if (slideshowRes.ok && existsSync(slideshowOut)) {
          task.receivedBytes += statSync(slideshowOut).size
        }
      }
    }

    if (controller.signal.aborted) {
      task.status = 'canceled'
      task.error = 'キャンセルしました。'
    } else if (task.completedCount === 0 && task.failedCount > 0) {
      task.status = 'failed'
      task.error = 'すべてのメディアの保存に失敗しました。'
    } else {
      task.status = 'completed'
    }

    task.finishedAt = Date.now()
    task.currentFileName = null
    this.albumControllers.delete(task.id)
    this.emitAlbumProgress(task, true)

    if (vault.isUnlocked) {
      const summaryTask: DownloadTask = {
        id: task.id,
        url: task.pageUrl,
        kind: 'file',
        fileName: `[アルバム] ${task.albumTitle} (${task.completedCount}/${task.totalCount}件)`,
        savePath: task.folderPath,
        status: task.status,
        receivedBytes: task.receivedBytes,
        totalBytes: task.receivedBytes,
        progress: 1,
        error: task.error,
        startedAt: task.startedAt,
        finishedAt: task.finishedAt,
        pageUrl: task.pageUrl,
      }
      const model = vault.getModel()
      model.downloads = [summaryTask, ...model.downloads].slice(0, HISTORY_LIMIT)
      vault.markDirty()
      this.emit('changed', summaryTask)
    }
  }

  private emitAlbumProgress(task: AlbumDownloadTask, force = false): void {
    const now = Date.now()
    if (!force && now - (this.albumLastEmit.get(task.id) ?? 0) < PROGRESS_THROTTLE_MS) return
    this.albumLastEmit.set(task.id, now)

    const progress: AlbumDownloadProgress = {
      taskId: task.id,
      completedCount: task.completedCount,
      failedCount: task.failedCount,
      totalCount: task.totalCount,
      receivedBytes: task.receivedBytes,
      currentFileName: task.currentFileName,
      status: task.status,
      error: task.error,
    }
    emitToRenderer(IPC_EVENT.albumDownloadProgress, progress)
  }
}

export const downloads = new DownloadManager()
