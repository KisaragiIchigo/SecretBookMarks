import { randomUUID } from 'node:crypto'
import { IPC_EVENT } from '@shared/ipc'
import type { MediaCandidate } from '@shared/types'
import { emitToRenderer } from '../window'
import { browserSession } from './session'

const MAX_PER_PAGE = 120
const DIRECT_FILE = /\.(mp4|m4v|webm|mov|mkv|ts|mp3|m4a|aac|flac|ogg|wav)(\?|#|$)/i
// ffmpeg で結合が必要なストリーミング形式（HLS と DASH）
const STREAM_MANIFEST = /\.(m3u8|mpd)(\?|#|$)/i
const IGNORE_HOST = /(^|\.)(google-analytics\.com|doubleclick\.net|googletagmanager\.com)$/i

/** webContents.id ごとの検出結果。ページ遷移で捨てる。 */
const byContents = new Map<number, MediaCandidate[]>()

function classify(url: string, contentType: string): MediaCandidate['kind'] | null {
  if (STREAM_MANIFEST.test(url)) return 'hls'
  if (contentType.includes('mpegurl') || contentType.includes('dash+xml')) return 'hls'
  if (DIRECT_FILE.test(url)) return 'file'
  if (contentType.startsWith('video/') || contentType.startsWith('audio/')) return 'file'
  return null
}

function headerValue(headers: Record<string, string[]> | undefined, key: string): string {
  if (!headers) return ''
  const found = Object.entries(headers).find(([name]) => name.toLowerCase() === key)
  return found?.[1]?.[0] ?? ''
}

export function mediaCandidates(contentsId: number): MediaCandidate[] {
  return byContents.get(contentsId) ?? []
}

export function clearMediaFor(contentsId: number): void {
  if (byContents.delete(contentsId)) emitToRenderer(IPC_EVENT.mediaDetected, { contentsId, candidates: [] })
}

/**
 * ブラウザセッションの応答を監視して、保存できそうなメディアを拾う。
 * 右クリックだけでは <video src> が直リンクの場合しか取れないため、
 * 実際にページが読み込んだ URL を見張るこちらが主力になる。
 */
export function startMediaSniffer(): void {
  browserSession().webRequest.onCompleted({ urls: ['<all_urls>'] }, (details) => {
    const contentsId = details.webContentsId
    if (contentsId === undefined) return
    if (details.statusCode >= 400) return
    if (details.resourceType === 'image' || details.resourceType === 'stylesheet') return

    let host = ''
    try {
      host = new URL(details.url).hostname
    } catch {
      return
    }
    if (IGNORE_HOST.test(host)) return

    const contentType = headerValue(details.responseHeaders, 'content-type').toLowerCase()
    const kind = classify(details.url, contentType)
    if (!kind) return

    const list = byContents.get(contentsId) ?? []
    if (list.some((item) => item.url === details.url)) return

    const lengthHeader = headerValue(details.responseHeaders, 'content-length')
    const candidate: MediaCandidate = {
      id: randomUUID(),
      url: details.url,
      kind,
      mimeType: contentType.split(';')[0] || null,
      sizeBytes: lengthHeader ? Number(lengthHeader) || null : null,
      pageUrl: '',
      pageTitle: '',
      detectedAt: Date.now(),
    }

    const next = [candidate, ...list].slice(0, MAX_PER_PAGE)
    byContents.set(contentsId, next)
    emitToRenderer(IPC_EVENT.mediaDetected, { contentsId, candidates: next })
  })
}
