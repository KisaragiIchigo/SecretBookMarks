import { IPC_EVENT } from '@shared/ipc'
import { extractDomain } from '@shared/url'
import { hasFavicon, setFavicon } from '../vault/repository'
import { session } from '../vault/session'
import { emitToRenderer } from '../window'
import { fetchPageMeta } from './fetchPageMeta'

const CONCURRENCY = 3
const MAX_QUEUE = 300

const queue: string[] = []
const inFlight = new Set<string>()
let running = 0

/** 未取得ドメインのファビコンを控えめな並列度で埋めていく。取得済み・処理中は積まない。 */
export function enqueueFavicon(url: string): void {
  if (!session.isUnlocked) return
  const domain = extractDomain(url)
  if (!domain || inFlight.has(domain) || queue.includes(domain)) return
  if (hasFavicon(domain)) return
  if (queue.length >= MAX_QUEUE) return
  queue.push(url)
  pump()
}

export function enqueueMissingFavicons(urls: string[]): void {
  for (const url of urls) enqueueFavicon(url)
}

function pump(): void {
  while (running < CONCURRENCY && queue.length > 0) {
    const url = queue.shift()
    if (!url) return
    const domain = extractDomain(url)
    if (inFlight.has(domain)) continue
    inFlight.add(domain)
    running += 1
    void run(url, domain)
  }
}

async function run(url: string, domain: string): Promise<void> {
  try {
    const meta = await fetchPageMeta(url, { title: false, favicon: true })
    if (meta.favicon && session.isUnlocked) {
      setFavicon(meta.favicon.domain, meta.favicon.dataUrl)
      emitToRenderer(IPC_EVENT.faviconUpdated, meta.favicon)
    }
  } catch {
    // 取得失敗はそのまま握る。次回起動時に再挑戦する。
  } finally {
    inFlight.delete(domain)
    running -= 1
    pump()
  }
}
