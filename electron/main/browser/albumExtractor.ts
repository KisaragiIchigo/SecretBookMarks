import { webContents } from 'electron'
import { randomUUID } from 'node:crypto'
import type { AlbumBundle, AlbumMediaItem } from '@shared/types'
import { emitToRenderer } from '../window'
import { IPC_EVENT } from '@shared/ipc'
import { extractDomain, isAlbumUrl } from '@shared/url'

/**
 * メディアギャラリー・アルバムページ用の DOM 収集スクリプト。
 * 紹介用サムネイル（「さらに投稿」など）や背景ぼかし用重複画像（img-back）、
 * アバター・広告・アイコンを除外し、アルバム本来のメディアのみを抽出する。
 */
const ALBUM_COLLECTOR = `(() => {
  try {
    const result = {
      title: '',
      items: [],
    }

    if (typeof document === 'undefined') return result

    // アルバムタイトルの取得
    const h1 = document.querySelector('h1')
    if (h1 && h1.textContent) {
      result.title = h1.textContent.trim()
    } else {
      const docTitle = document.title || ''
      // 末尾のサイト名や一般的な付加テキスト（ - サイト名 等）を除去
      result.title = docTitle.replace(/\\s*[-|–—]\\s*[^ -|–—]+$/i, '').trim() || docTitle.trim()
    }

    // アルバム本体コンテンツ（div.media-group 等）のみを走査
    let groups = document.querySelectorAll('div.media-group, div[class*="media-group"]')
    if (groups.length === 0) {
      groups = document.querySelectorAll('#media_show .media-group, .media-group')
    }

    const seenUrls = new Set()

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]
      if (!group) continue

      // 1. 動画の探索（高画質 source または video タグ）
      const source = group.querySelector('video source[src]')
      const video = group.querySelector('video')
      const videoUrl = source ? (source.getAttribute('src') || source.src) : (video ? (video.getAttribute('src') || video.currentSrc) : null)

      if (videoUrl && typeof videoUrl === 'string' && /^https?:\\/\\//i.test(videoUrl)) {
        const cleanUrl = videoUrl.trim()
        if (!seenUrls.has(cleanUrl)) {
          seenUrls.add(cleanUrl)
          const poster = video ? (video.getAttribute('poster') || '') : ''
          result.items.push({
            url: cleanUrl,
            kind: 'video',
            previewUrl: poster || undefined,
          })
          continue
        }
      }

      // 2. 高画質画像の探索（div.img の data-src または img.img-front）
      // 背景用重複画像の img-back は除外する
      const imgDiv = group.querySelector('div.img[data-src]')
      let imgUrl = imgDiv ? imgDiv.getAttribute('data-src') : null

      if (!imgUrl) {
        const frontImg = group.querySelector('img.img-front')
        if (frontImg) {
          imgUrl = frontImg.getAttribute('src') || frontImg.getAttribute('data-src')
        }
      }

      if (!imgUrl) {
        const anyImg = group.querySelector('img:not(.img-back)')
        if (anyImg) {
          imgUrl = anyImg.getAttribute('src') || anyImg.getAttribute('data-src')
        }
      }

      if (imgUrl && typeof imgUrl === 'string' && /^https?:\\/\\//i.test(imgUrl)) {
        const cleanUrl = imgUrl.trim()
        if (!seenUrls.has(cleanUrl)) {
          seenUrls.add(cleanUrl)
          result.items.push({
            url: cleanUrl,
            kind: 'image',
            previewUrl: cleanUrl,
          })
        }
      }
    }

    return result
  } catch (err) {
    return {
      __error: true,
      message: (err && err.message) || String(err),
    }
  }
})()`

/**
 * 一般的なギャラリー・アルバムページ用のフォールバック収集スクリプト。
 * 小さなアイコン、アバター、広告などを除外する。
 */
const GENERIC_COLLECTOR = `(() => {
  try {
    const result = {
      title: document?.querySelector('h1')?.textContent?.trim() || document?.title?.trim() || '',
      items: [],
    }

    if (typeof document === 'undefined') return result

    const seenUrls = new Set()

    // 1. ページ内の全動画
    document.querySelectorAll('video').forEach((video) => {
      const src = video.currentSrc || video.src || video.querySelector('source')?.src
      if (src && typeof src === 'string' && /^https?:\\/\\//i.test(src) && !seenUrls.has(src)) {
        seenUrls.add(src)
        result.items.push({
          url: src,
          kind: 'video',
          previewUrl: video.poster || undefined,
        })
      }
    })

    // 2. ページ内の主要画像（アイコン・アバターなどを除外）
    document.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('data-src') || img.currentSrc || img.src
      if (!src || typeof src !== 'string' || !/^https?:\\/\\//i.test(src) || seenUrls.has(src)) return

      // 小さすぎる画像（アイコン等）を除外
      const width = img.naturalWidth || img.width || 0
      const height = img.naturalHeight || img.height || 0
      if ((width > 0 && width < 150) || (height > 0 && height < 150)) return

      // 明らかなアバター・トラッカー画像を除外
      if (/avatar|icon|logo|tracker|badge/i.test(src) || /avatar|icon|logo/i.test(img.className || '')) return

      seenUrls.add(src)
      result.items.push({
        url: src,
        kind: 'image',
        previewUrl: src,
      })
    })

    return result
  } catch (err) {
    return {
      __error: true,
      message: (err && err.message) || String(err),
    }
  }
})()`

/**
 * URL からクリーンなファイル名を生成する。
 */
function cleanFileNameFromUrl(url: string, defaultExt: string): { base: string; ext: string } {
  try {
    const path = new URL(url).pathname
    const lastPart = decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '')
    const dotIndex = lastPart.lastIndexOf('.')
    if (dotIndex > 0 && lastPart.length - dotIndex <= 6) {
      const ext = lastPart.slice(dotIndex)
      const base = lastPart.slice(0, dotIndex)
      return { base, ext }
    }
    if (lastPart) {
      return { base: lastPart, ext: defaultExt }
    }
  } catch {
    // URL パース失敗時はフォールバック
  }
  return { base: 'media', ext: defaultExt }
}

const albumCache = new Map<number, AlbumBundle>()
const inFlightScans = new Map<number, Promise<AlbumBundle | null>>()

export function getCachedAlbum(contentsId: number): AlbumBundle | null {
  return albumCache.get(contentsId) ?? null
}

export function clearCachedAlbum(contentsId: number): void {
  albumCache.delete(contentsId)
  inFlightScans.delete(contentsId)
}

/**
 * 指定されたタブ（WebContents）からアルバムメディアを一括抽出する。
 * 同一 contentsId の多重並行スキャンを排他制御で防ぎ、直近の処理を共有する。
 */
export function extractAlbumMedia(
  contentsId: number,
  options?: { retries?: number; delayMs?: number },
): Promise<AlbumBundle | null> {
  const ongoing = inFlightScans.get(contentsId)
  if (ongoing) return ongoing

  const task = (async () => {
    try {
      return await doExtractAlbumMedia(contentsId, options)
    } finally {
      inFlightScans.delete(contentsId)
    }
  })()

  inFlightScans.set(contentsId, task)
  return task
}

async function doExtractAlbumMedia(
  contentsId: number,
  options?: { retries?: number; delayMs?: number },
): Promise<AlbumBundle | null> {
  const contents = webContents.fromId(contentsId)
  if (!contents || contents.isDestroyed()) return null

  const pageUrl = contents.getURL()
  const isAlbum = isAlbumUrl(pageUrl)
  const maxRetries = options?.retries ?? (isAlbum ? 2 : 0)
  const delayMs = options?.delayMs ?? 600

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (contents.isDestroyed()) return null

    try {
      const script = isAlbum ? ALBUM_COLLECTOR : GENERIC_COLLECTOR
      const raw = (await contents.executeJavaScript(script, false)) as {
        __error?: boolean
        message?: string
        title?: string
        items?: { url: string; kind: 'image' | 'video'; previewUrl?: string }[]
      }

      if (raw && raw.__error) {
        console.warn(`[albumExtractor] attempt ${attempt} script error:`, raw.message)
      } else if (raw && Array.isArray(raw.items) && raw.items.length > 0) {
        const title = (raw.title && raw.title.trim()) || 'album'
        const total = raw.items.length
        const padLength = Math.max(3, String(total).length)

        const items: AlbumMediaItem[] = raw.items.map((item, index) => {
          const defaultExt = item.kind === 'video' ? '.mp4' : '.jpg'
          const { base, ext } = cleanFileNameFromUrl(item.url, defaultExt)
          const indexPrefix = String(index + 1).padStart(padLength, '0')
          const fileName = `${indexPrefix}_${base}${ext}`

          return {
            id: randomUUID(),
            url: item.url,
            kind: item.kind,
            fileName,
            previewUrl: item.previewUrl,
            sizeBytes: null,
          }
        })

        const domain = extractDomain(pageUrl)
        const siteLabel = domain ? domain.charAt(0).toUpperCase() + domain.slice(1) : 'Album'

        const bundle: AlbumBundle = {
          site: siteLabel,
          title,
          pageUrl,
          items,
          imageCount: items.filter((i) => i.kind === 'image').length,
          videoCount: items.filter((i) => i.kind === 'video').length,
        }

        albumCache.set(contentsId, bundle)
        emitToRenderer(IPC_EVENT.albumDetected, { contentsId, album: bundle })
        return bundle
      }
    } catch (error) {
      console.warn(`[albumExtractor] attempt ${attempt} error:`, (error as Error).message)
    }

    // まだ要素が取れず、リトライが残っている場合は待機
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  // 既存キャッシュがある場合は安易に破棄しない（ページ内リロード等で一時的に消えるのを防ぐ）
  const existing = albumCache.get(contentsId)
  if (!existing) {
    albumCache.delete(contentsId)
  }
  return existing ?? null
}
