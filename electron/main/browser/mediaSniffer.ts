import { randomUUID } from 'node:crypto'
import { IPC_EVENT } from '@shared/ipc'
import type { MediaCandidate } from '@shared/types'
import { emitToRenderer } from '../window'
import { browserSession } from './session'

const MAX_PER_PAGE = 160
const DIRECT_FILE = /\.(mp4|m4v|webm|mov|mkv|ts|m4s|mp3|m4a|aac|flac|ogg|wav)(\?|#|$)/i
// ffmpeg で結合が必要なストリーミング形式（HLS と DASH）
const STREAM_MANIFEST = /\.(m3u8|mpd)(\?|#|$)/i
const IGNORE_HOST = /(^|\.)(google-analytics\.com|doubleclick\.net|googletagmanager\.com)$/i
// 断片配信の1つ1つを並べても選べないので、明らかなセグメントは除外する
const SEGMENT_LIKE = /[/-]seg(ment)?[-_]?\d+|\/\d{3,}\.(ts|m4s)(\?|#|$)|chunk[-_]?\d+/i

/** webContents.id ごとの検出結果。ページ遷移で捨てる。 */
const byContents = new Map<number, MediaCandidate[]>()

interface Classified {
  kind: MediaCandidate['kind']
  /** 確度。高いものを一覧の上に出す */
  score: number
}

function classify(url: string, contentType: string, resourceType: string): Classified | null {
  if (STREAM_MANIFEST.test(url)) return { kind: 'hls', score: 3 }
  if (contentType.includes('mpegurl') || contentType.includes('dash+xml')) return { kind: 'hls', score: 3 }
  if (DIRECT_FILE.test(url)) return { kind: 'file', score: 2 }
  if (contentType.startsWith('video/')) return { kind: 'file', score: 2 }
  if (contentType.startsWith('audio/')) return { kind: 'file', score: 1 }
  // 拡張子も content-type も当てにならないサイトがあるため、
  // Chromium が「メディア」として要求した事実そのものを手がかりにする。
  if (resourceType === 'media') return { kind: 'file', score: 1 }
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

/** 外部（ページ内 DOM の走査など）で見つけた候補を混ぜる。 */
export function addMediaCandidates(contentsId: number, found: { url: string; kind: MediaCandidate['kind'] }[]): MediaCandidate[] {
  const list = byContents.get(contentsId) ?? []
  const added: MediaCandidate[] = []
  for (const item of found) {
    if (list.some((entry) => entry.url === item.url)) continue
    added.push({
      id: randomUUID(),
      url: item.url,
      kind: item.kind,
      mimeType: null,
      sizeBytes: null,
      pageUrl: '',
      pageTitle: '',
      detectedAt: Date.now(),
    })
  }
  if (added.length === 0) return list
  // DOM から拾ったものは実際に再生中の URL なので先頭へ置く。
  const next = [...added, ...list].slice(0, MAX_PER_PAGE)
  byContents.set(contentsId, next)
  emitToRenderer(IPC_EVENT.mediaDetected, { contentsId, candidates: next })
  return next
}

function record(details: {
  url: string
  statusCode: number
  resourceType: string
  responseHeaders?: Record<string, string[]>
  webContentsId?: number
}): void {
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
  const classified = classify(details.url, contentType, details.resourceType)
  if (!classified) return
  // HLS の断片は個別に保存しても意味がないので捨てる（マニフェスト側を使う）。
  if (classified.kind === 'file' && SEGMENT_LIKE.test(details.url)) return

  const list = byContents.get(contentsId) ?? []
  const lengthHeader = headerValue(details.responseHeaders, 'content-length')
  const size = lengthHeader ? Number(lengthHeader) || null : null

  const existing = list.find((item) => item.url === details.url)
  if (existing) {
    // 同じ URL を後から見つけた場合はサイズだけ埋め直す。
    if (existing.sizeBytes === null && size !== null) {
      existing.sizeBytes = size
      emitToRenderer(IPC_EVENT.mediaDetected, { contentsId, candidates: list })
    }
    return
  }

  const candidate: MediaCandidate = {
    id: randomUUID(),
    url: details.url,
    kind: classified.kind,
    mimeType: contentType.split(';')[0] || null,
    sizeBytes: size,
    pageUrl: '',
    pageTitle: '',
    detectedAt: Date.now(),
  }

  const next = classified.score >= 2 ? [candidate, ...list] : [...list, candidate]
  byContents.set(contentsId, next.slice(0, MAX_PER_PAGE))
  emitToRenderer(IPC_EVENT.mediaDetected, { contentsId, candidates: byContents.get(contentsId) ?? [] })
}

/**
 * ブラウザセッションの応答を監視して、保存できそうなメディアを拾う。
 *
 * onResponseStarted を使うのが要点。動画は本文が長く、視聴を止めると onCompleted が
 * 発火しないまま終わることがあるため、完了を待つと一覧に出てこない。
 * ヘッダーが返った時点で拾えば、再生を始めた直後に候補が並ぶ。
 *
 * onBeforeRequest と onHeadersReceived は広告ブロッカーが使っている。
 * Electron は同一イベントにリスナーを1つしか持てないため、ここでは触らない。
 */
export function startMediaSniffer(): void {
  const filter = { urls: ['<all_urls>'] }
  const request = browserSession().webRequest

  request.onResponseStarted(filter, (details) => record(details))
  request.onCompleted(filter, (details) => record(details))
}
