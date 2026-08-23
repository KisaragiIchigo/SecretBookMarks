import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
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
    if (!response.ok) return null
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
