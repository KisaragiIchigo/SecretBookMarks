import { extractDomain } from '@shared/url'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const HTML_LIMIT_BYTES = 1_500_000
const FAVICON_LIMIT_BYTES = 64 * 1024
const TIMEOUT_MS = 8000

export interface PageMeta {
  title: string | null
  favicon: { domain: string; dataUrl: string } | null
  /** タグ候補として提示する語（keywords / article:tag / og:site_name 由来） */
  keywords: string[]
}

const KEYWORD_MAX_LENGTH = 24
const KEYWORD_LIMIT = 8

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      ...init,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        ...(init.headers ?? {}),
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

function decodeHtml(buffer: ArrayBuffer, contentType: string): string {
  const headerCharset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]
  const bytes = new Uint8Array(buffer)
  const ascii = new TextDecoder('latin1').decode(bytes.subarray(0, 4096))
  const metaCharset =
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(ascii)?.[1] ??
    /<meta[^>]+content=["'][^"']*charset=([\w-]+)/i.exec(ascii)?.[1]
  const label = (headerCharset ?? metaCharset ?? 'utf-8').toLowerCase()
  try {
    return new TextDecoder(label).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  }
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => named[name.toLowerCase()] ?? whole)
}

function cleanTitle(raw: string): string {
  return decodeEntities(raw).replace(/\s+/g, ' ').trim()
}

function extractTitle(html: string): string | null {
  const ogTitle =
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ??
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(html)?.[1]
  const twitterTitle = /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]

  for (const candidate of [titleTag, ogTitle, twitterTitle]) {
    if (!candidate) continue
    const cleaned = cleanTitle(candidate)
    if (cleaned) return cleaned
  }
  return null
}

/** meta keywords と article:tag からタグ候補を拾う。長すぎる語や文章はタグに向かないので落とす。 */
function extractKeywords(html: string): string[] {
  const raw: string[] = []

  const keywords = /<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
  if (keywords) raw.push(...keywords.split(/[,、|]/))

  for (const match of html.matchAll(/<meta[^>]+property=["']article:tag["'][^>]+content=["']([^"']+)["']/gi)) {
    raw.push(match[1])
  }

  const siteName = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
  if (siteName) raw.push(siteName)

  const seen = new Set<string>()
  const out: string[] = []
  for (const candidate of raw) {
    const value = decodeEntities(candidate).replace(/\s+/g, ' ').trim()
    if (!value || value.length > KEYWORD_MAX_LENGTH) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
    if (out.length >= KEYWORD_LIMIT) break
  }
  return out
}

function extractIconHref(html: string, baseUrl: string): string | null {
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? []
  const candidates: { href: string; score: number }[] = []
  for (const tag of linkTags) {
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase()
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1]
    if (!rel || !href || !rel.includes('icon')) continue
    const score = rel.includes('apple-touch') ? 1 : rel.includes('shortcut') ? 3 : 2
    candidates.push({ href, score })
  }
  candidates.sort((a, b) => b.score - a.score)
  const picked = candidates[0]?.href
  if (!picked) return null
  try {
    return new URL(picked, baseUrl).href
  } catch {
    return null
  }
}

async function fetchFavicon(pageUrl: string, html: string | null): Promise<string | null> {
  const origin = new URL(pageUrl).origin
  const targets = [html ? extractIconHref(html, pageUrl) : null, `${origin}/favicon.ico`].filter(
    (v): v is string => Boolean(v),
  )

  for (const target of targets) {
    try {
      const response = await fetchWithTimeout(target)
      if (!response.ok) continue
      const type = (response.headers.get('content-type') ?? '').toLowerCase()
      if (type && !type.startsWith('image/')) continue
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.byteLength === 0 || buffer.byteLength > FAVICON_LIMIT_BYTES) continue
      const mime = type.split(';')[0] || 'image/x-icon'
      return `data:${mime};base64,${buffer.toString('base64')}`
    } catch {
      continue
    }
  }
  return null
}

/** ページのタイトルとファビコンをまとめて取得する。失敗しても例外を投げず null を返す。 */
export async function fetchPageMeta(
  url: string,
  options: { title: boolean; favicon: boolean },
): Promise<PageMeta> {
  const domain = extractDomain(url)
  let html: string | null = null
  let title: string | null = null

  if (options.title || options.favicon) {
    try {
      const response = await fetchWithTimeout(url)
      const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
      const length = Number(response.headers.get('content-length') ?? '0')
      if (response.ok && contentType.includes('html') && length <= HTML_LIMIT_BYTES) {
        const buffer = await response.arrayBuffer()
        if (buffer.byteLength <= HTML_LIMIT_BYTES) html = decodeHtml(buffer, contentType)
      }
    } catch {
      html = null
    }
  }

  if (options.title && html) title = extractTitle(html)

  let favicon: PageMeta['favicon'] = null
  if (options.favicon) {
    const dataUrl = await fetchFavicon(url, html)
    if (dataUrl) favicon = { domain, dataUrl }
  }

  return { title, favicon, keywords: html ? extractKeywords(html) : [] }
}

/** リンク切れ検査。HEAD が拒否されるサイトが多いので GET へフォールバックする。 */
export async function checkLink(url: string): Promise<number | null> {
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const response = await fetchWithTimeout(url, { method })
      if (method === 'HEAD' && (response.status === 405 || response.status === 501)) continue
      return response.status
    } catch {
      if (method === 'GET') return null
    }
  }
  return null
}
