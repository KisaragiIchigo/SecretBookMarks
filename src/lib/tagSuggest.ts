import type { Bookmark } from '@shared/types'

export type SuggestionSource = 'domain' | 'page' | 'library'

export interface TagSuggestion {
  tag: string
  source: SuggestionSource
  /** domain / library の場合の使用回数 */
  count: number
}

const DOMAIN_SUGGESTION_LIMIT = 6
const LIBRARY_SUGGESTION_LIMIT = 6
const COMPLETION_LIMIT = 8

function countTags(bookmarks: Bookmark[]): Map<string, { label: string; count: number }> {
  const counts = new Map<string, { label: string; count: number }>()
  for (const bookmark of bookmarks) {
    if (bookmark.deletedAt !== null) continue
    for (const tag of bookmark.tags) {
      const key = tag.toLowerCase()
      const entry = counts.get(key)
      if (entry) entry.count += 1
      else counts.set(key, { label: tag, count: 1 })
    }
  }
  return counts
}

function toSorted(counts: Map<string, { label: string; count: number }>, source: SuggestionSource): TagSuggestion[] {
  return [...counts.values()]
    .map(({ label, count }) => ({ tag: label, source, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ja'))
}

/** 同じドメインのブックマークで実際に使われているタグを、使用回数の多い順に返す。 */
export function domainTagRanking(bookmarks: Bookmark[], domain: string): TagSuggestion[] {
  if (!domain) return []
  const sameDomain = bookmarks.filter((b) => b.domain === domain)
  return toSorted(countTags(sameDomain), 'domain')
}

/**
 * 新規追加時に自動で引き継ぐタグ。
 * 同じドメインのブックマークの半数以上に付いているタグだけを採用する。
 * 1件しか無いドメインならそのタグをそのまま引き継ぐ（同じサイトは同じ用途で貯めることが多いため）。
 */
export function inheritedDomainTags(bookmarks: Bookmark[], domain: string, limit = 5): string[] {
  if (!domain) return []
  const sameDomain = bookmarks.filter((b) => b.domain === domain && b.deletedAt === null)
  if (sameDomain.length === 0) return []
  const threshold = Math.ceil(sameDomain.length / 2)
  return toSorted(countTags(sameDomain), 'domain')
    .filter((entry) => entry.count >= threshold)
    .slice(0, limit)
    .map((entry) => entry.tag)
}

/**
 * タグ候補を3段構えで組み立てる。
 * 1. 同ドメインの実績（いちばん当たる） 2. ページ由来のキーワード 3. よく使うタグ
 * 既に付いているタグは除外し、同じ語が重複して並ばないようにする。
 */
export function buildSuggestions(params: {
  bookmarks: Bookmark[]
  domain: string
  keywords: string[]
  current: string[]
}): TagSuggestion[] {
  const used = new Set(params.current.map((t) => t.toLowerCase()))
  const seen = new Set<string>()
  const out: TagSuggestion[] = []

  const push = (suggestion: TagSuggestion) => {
    const key = suggestion.tag.toLowerCase()
    if (used.has(key) || seen.has(key)) return
    seen.add(key)
    out.push(suggestion)
  }

  for (const suggestion of domainTagRanking(params.bookmarks, params.domain).slice(0, DOMAIN_SUGGESTION_LIMIT)) {
    push(suggestion)
  }
  for (const keyword of params.keywords) {
    push({ tag: keyword, source: 'page', count: 0 })
  }
  for (const suggestion of toSorted(countTags(params.bookmarks), 'library').slice(0, LIBRARY_SUGGESTION_LIMIT)) {
    push(suggestion)
  }
  return out
}

/** 入力途中の文字列に対する補完候補。前方一致を部分一致より優先する。 */
export function completeTag(input: string, bookmarks: Bookmark[], current: string[]): string[] {
  const needle = input.trim().toLowerCase()
  if (!needle) return []
  const used = new Set(current.map((t) => t.toLowerCase()))

  const ranked = toSorted(countTags(bookmarks), 'library').filter(
    (entry) => !used.has(entry.tag.toLowerCase()) && entry.tag.toLowerCase().includes(needle),
  )
  return ranked
    .sort((a, b) => {
      const aStarts = a.tag.toLowerCase().startsWith(needle) ? 0 : 1
      const bStarts = b.tag.toLowerCase().startsWith(needle) ? 0 : 1
      return aStarts - bStarts || b.count - a.count
    })
    .slice(0, COMPLETION_LIMIT)
    .map((entry) => entry.tag)
}
