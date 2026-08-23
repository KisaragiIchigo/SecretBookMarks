import { webContents } from 'electron'

/**
 * 保存名に使うページタイトルを決める。
 *
 * document.title はサイト名や煽り文が付くことが多い
 * （例: 「動画のタイトル エロ動画 - SpankBang」）。
 * 見出しや og:title の方が動画そのものの名前に近いため、そちらを優先する。
 */
const COLLECTOR = `(() => {
  const text = (value) => (typeof value === 'string' ? value.replace(/\\s+/g, ' ').trim() : '')
  const meta = (selector) => text(document.querySelector(selector)?.getAttribute('content'))
  const heading = document.querySelector('h1')
  return JSON.stringify({
    og: meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]'),
    h1: text(heading?.textContent),
    title: text(document.title),
  })
})()`

// 「タイトル - サイト名」「タイトル | サイト名」などの区切り
const SEPARATOR = /\s+[|｜\-–—:：·•«»]\s+|\s+::\s+/

/** ホスト名から見出し語（second level domain）を取り出す。jp.example.com なら example。 */
function brandOf(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.')
  if (parts.length < 2) return parts[0] ?? ''
  return parts[parts.length - 2] ?? ''
}

/** 末尾に付いたサイト名を落とす。区切りが無ければそのまま返す。 */
export function stripSiteSuffix(title: string, host: string): string {
  const brand = brandOf(host).replace(/[^a-z0-9]/g, '')
  if (!brand) return title
  const parts = title.split(SEPARATOR).filter((part) => part.trim())
  if (parts.length < 2) return title

  while (parts.length > 1) {
    const last = parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!last.includes(brand) && !brand.includes(last)) break
    parts.pop()
  }
  return parts.join(' - ').trim() || title
}

/**
 * 見出し・og:title・document.title の中から最も動画の名前らしいものを選ぶ。
 * 見出しが document.title の先頭に含まれていれば、それが本来のタイトルとみなせる。
 */
export function pickTitle(
  candidates: { og: string; h1: string; title: string },
  host: string,
): string {
  const cleanedTitle = stripSiteSuffix(candidates.title, host)
  const h1 = candidates.h1.trim()
  const og = stripSiteSuffix(candidates.og, host).trim()

  const isPrefixOfTitle =
    h1.length >= 4 && candidates.title.toLowerCase().startsWith(h1.toLowerCase())
  if (isPrefixOfTitle) return h1

  if (og.length >= 4) return og
  if (h1.length >= 4) return h1
  return cleanedTitle
}

/** 指定タブのタイトルを解決する。取得できなければ webContents のタイトルで代用する。 */
export async function resolvePageTitle(contentsId: number): Promise<string> {
  const contents = webContents.fromId(contentsId)
  if (!contents || contents.isDestroyed()) return ''

  let host = ''
  try {
    host = new URL(contents.getURL()).hostname
  } catch {
    host = ''
  }

  try {
    const raw = (await contents.executeJavaScript(COLLECTOR, false)) as string
    const parsed = JSON.parse(raw) as { og?: string; h1?: string; title?: string }
    return pickTitle(
      { og: parsed.og ?? '', h1: parsed.h1 ?? '', title: parsed.title ?? '' },
      host,
    )
  } catch {
    return stripSiteSuffix(contents.getTitle(), host)
  }
}
