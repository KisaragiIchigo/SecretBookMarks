import { app } from 'electron'
import { type ChildProcess, spawn } from 'node:child_process'
import { copyFileSync, existsSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadSettings } from '../settings'

/**
 * ffmpeg の実行ファイルを探す。
 * ffmpeg-static を require すると、esbuild でバンドルした後に __dirname がずれて
 * 誤った場所を指すため、パスは自前で組み立てる。
 */
export function resolveFfmpeg(): string | null {
  const custom = loadSettings().ffmpegPath
  if (custom && existsSync(custom)) return custom

  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'ffmpeg.exe')]
    : [join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')]

  return candidates.find((path) => existsSync(path)) ?? null
}

export const STREAM_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const CRLF = '\r\n'

/**
 * HLS / DASH を mp4 へ結合するための引数。
 * Referer と Cookie を渡さないと弾くサイトが多いため、ヘッダーを明示的に載せる。
 */
export function buildStreamArgs(input: {
  url: string
  savePath: string
  referer: string
  cookieHeader?: string
}): string[] {
  const headerLines = [`Referer: ${input.referer}`]
  if (input.cookieHeader) headerLines.push(`Cookie: ${input.cookieHeader}`)

  return [
    '-y',
    '-loglevel',
    'error',
    '-user_agent',
    STREAM_USER_AGENT,
    '-headers',
    headerLines.join(CRLF) + CRLF,
    '-i',
    input.url,
    '-c',
    'copy',
    // MPEG-TS 由来の AAC を MP4 に収めるために必要。
    '-bsf:a',
    'aac_adtstoasc',
    '-progress',
    'pipe:1',
    '-nostats',
    input.savePath,
  ]
}

export function ffmpegStatus(): { available: boolean; path: string | null } {
  const path = resolveFfmpeg()
  return { available: path !== null, path }
}

/** HLS / DASH のマニフェストから総再生時間を求める。進捗表示にだけ使う。 */
export async function streamDurationSeconds(
  url: string,
  headers: Record<string, string>,
  depth = 0,
): Promise<number | null> {
  if (depth > 1) return null
  let text: string
  try {
    const response = await fetch(url, { headers, redirect: 'follow' })
    if (!response.ok) {
      // 読まない本体は捨てる。放置すると undici が停止状態のまま接続終了して落ちる。
      await response.body?.cancel().catch(() => undefined)
      return null
    }
    text = await response.text()
  } catch {
    return null
  }

  if (url.includes('.mpd') || text.includes('<MPD')) {
    const iso = /mediaPresentationDuration="([^"]+)"/.exec(text)?.[1]
    return iso ? parseIsoDuration(iso) : null
  }

  // マスタープレイリストなら最初のバリアントを1段だけ辿る。
  if (text.includes('#EXT-X-STREAM-INF')) {
    const lines = text.split(/\r?\n/)
    const index = lines.findIndex((line) => line.startsWith('#EXT-X-STREAM-INF'))
    const variant = lines.slice(index + 1).find((line) => line.trim() && !line.startsWith('#'))
    if (!variant) return null
    try {
      return await streamDurationSeconds(new URL(variant.trim(), url).href, headers, depth + 1)
    } catch {
      return null
    }
  }

  const segments = [...text.matchAll(/#EXTINF:\s*([\d.]+)/g)].map((match) => Number(match[1]))
  if (segments.length === 0) return null
  return segments.reduce((sum, value) => sum + value, 0)
}

function parseIsoDuration(value: string): number | null {
  const match = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value)
  if (!match) return null
  const [, h, m, s] = match
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0)
}

function escapeConcatPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/'/g, "'\\''")
}

function runFfmpegCommand(
  args: string[],
  abortSignal?: AbortSignal,
): Promise<{ ok: boolean; code: number | null; error?: string; stderr: string }> {
  const binary = resolveFfmpeg()
  if (!binary) {
    return Promise.resolve({ ok: false, code: -1, error: 'ffmpeg が見つかりません。', stderr: '' })
  }

  return new Promise((resolve) => {
    let child: ChildProcess | null = null
    let stderr = ''

    try {
      child = spawn(binary, args, {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      })
    } catch (err) {
      return resolve({
        ok: false,
        code: -1,
        error: err instanceof Error ? err.message : String(err),
        stderr: '',
      })
    }

    const onAbort = () => {
      if (child && !child.killed) {
        try {
          child.kill('SIGTERM')
        } catch {
          // すでに終了している場合は無視
        }
      }
    }

    if (abortSignal) {
      if (abortSignal.aborted) {
        onAbort()
        return resolve({ ok: false, code: -1, error: '処理が中断されました。', stderr: '' })
      }
      abortSignal.addEventListener('abort', onAbort, { once: true })
    }

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000)
    })

    child.on('error', (err) => {
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort)
      resolve({ ok: false, code: -1, error: err.message, stderr })
    })

    child.on('close', (code) => {
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort)
      if (code === 0) {
        resolve({ ok: true, code, stderr })
      } else {
        resolve({ ok: false, code, error: stderr || `ffmpeg が終了コード ${code} で終了しました。`, stderr })
      }
    })
  })
}

/** 入力動画に音声トラックが存在するかを高速に判定する */
async function hasAudioStream(filePath: string): Promise<boolean> {
  const res = await runFfmpegCommand(['-i', filePath])
  return res.stderr.includes('Audio:')
}

/**
 * 1本の動画を統一された 1080p 30fps yuv420p + 48kHz stereo AAC の MP4 に正規化する。
 * 音声トラックのない動画には自動で無音音声を付加し、異なる解像度やアスペクト比には黒帯を付与する。
 */
async function normalizeVideoToMp4(
  inputPath: string,
  outputPath: string,
  abortSignal?: AbortSignal,
): Promise<{ ok: boolean; error?: string }> {
  const hasAudio = await hasAudioStream(inputPath)
  const args = ['-y', '-i', inputPath]

  if (!hasAudio) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000')
  }

  args.push(
    '-vf',
    'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p,fps=30,setpts=PTS-STARTPTS',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '30',
  )

  if (hasAudio) {
    args.push(
      '-af',
      'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
    )
  } else {
    args.push('-c:a', 'aac', '-b:a', '192k', '-shortest')
  }

  args.push('-f', 'mp4', outputPath)

  const res = await runFfmpegCommand(args, abortSignal)
  return res.ok && existsSync(outputPath) && statSync(outputPath).size > 0
    ? { ok: true }
    : { ok: false, error: res.error || '動画の正規化に失敗しました。' }
}

/**
 * 複数の動画を1つの MP4 に結合する。
 * 解像度・フレームレート・音声の有無・タイムスタンプの違いによる黒画面化（ブラックアウト）を
 * 根絶するため、各動画を同一仕様の MP4 に正規化してからストリームコピー結合する。
 */
export async function concatVideos(
  videoPaths: string[],
  outputPath: string,
  abortSignal?: AbortSignal,
): Promise<{ ok: boolean; error?: string }> {
  if (videoPaths.length === 0) return { ok: true }
  if (videoPaths.length === 1) {
    try {
      copyFileSync(videoPaths[0], outputPath)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  const workDir = dirname(outputPath)
  const mp4Files: string[] = []
  const listFile = join(workDir, `.concat_${randomUUID()}.txt`)

  try {
    // 1. 各動画を同一の仕様（1080p 30fps / 48kHz stereo）の MP4 に順次正規化
    for (let i = 0; i < videoPaths.length; i++) {
      if (abortSignal?.aborted) {
        return { ok: false, error: '処理が中断されました。' }
      }
      const normPath = join(workDir, `.temp_norm_${randomUUID()}.mp4`)
      mp4Files.push(normPath)

      const normRes = await normalizeVideoToMp4(videoPaths[i], normPath, abortSignal)
      if (!normRes.ok) {
        return { ok: false, error: normRes.error || `動画（${i + 1}本目）の正規化に失敗しました。` }
      }
    }

    if (abortSignal?.aborted) {
      return { ok: false, error: '処理が中断されました。' }
    }

    // 2. 正規化された同一規格の MP4 をストリームコピーで最終 MP4 へ結合
    const content = mp4Files.map((p) => `file '${escapeConcatPath(p)}'`).join('\n')
    writeFileSync(listFile, content, 'utf8')

    const concatRes = await runFfmpegCommand(
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listFile,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        outputPath,
      ],
      abortSignal,
    )

    if (concatRes.ok && existsSync(outputPath) && statSync(outputPath).size > 0) {
      return { ok: true }
    }

    return { ok: false, error: concatRes.error || '動画の結合に失敗しました。' }
  } finally {
    // 一時ファイル（中間 MP4 およびリストファイル）を確実に削除
    for (const p of mp4Files) {
      try {
        if (existsSync(p)) unlinkSync(p)
      } catch {
        // 削除失敗は無視
      }
    }
    try {
      if (existsSync(listFile)) unlinkSync(listFile)
    } catch {
      // 削除失敗は無視
    }
  }
}

/**
 * 複数の静止画からスライドショー動画（MP4）を生成する。
 * 各画像のアスペクト比を保ち、黒帯レターボックスを付与して 1080p 30fps で出力する。
 */
export async function createImageSlideshow(
  imagePaths: string[],
  outputPath: string,
  secondsPerFrame = 3,
  abortSignal?: AbortSignal,
): Promise<{ ok: boolean; error?: string }> {
  if (imagePaths.length === 0) return { ok: true }

  const listFile = join(dirname(outputPath), `.slideshow_${randomUUID()}.txt`)
  const lines: string[] = []
  const duration = Math.max(1, Math.min(30, secondsPerFrame))

  for (const img of imagePaths) {
    lines.push(`file '${escapeConcatPath(img)}'`)
    lines.push(`duration ${duration}`)
  }
  // concat demuxer の仕様で、末尾の画像にも duration を適用するために再度配置する
  lines.push(`file '${escapeConcatPath(imagePaths[imagePaths.length - 1])}'`)

  try {
    writeFileSync(listFile, lines.join('\n'), 'utf8')
  } catch {
    return { ok: false, error: 'スライドショーリストの作成に失敗しました。' }
  }

  try {
    const res = await runFfmpegCommand(
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listFile,
        '-vf',
        'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
        '-r',
        '30',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        outputPath,
      ],
      abortSignal,
    )

    if (res.ok && existsSync(outputPath) && statSync(outputPath).size > 0) {
      return { ok: true }
    }

    return { ok: false, error: res.error || 'スライドショー動画の生成に失敗しました。' }
  } finally {
    try {
      if (existsSync(listFile)) unlinkSync(listFile)
    } catch {
      // 一時ファイル削除失敗は無視
    }
  }
}

