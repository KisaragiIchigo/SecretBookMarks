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

const AUTO_TAG_LIMIT = 5
const AUTO_TAG_MIN_LENGTH = 2
const AUTO_TAG_MAX_LENGTH = 16

/** タグとして使い物にならない語を落とす。数字だけ・URL 断片・長い文章を弾く。 */
function isUsableAsTag(value: string): boolean {
  if (value.length < AUTO_TAG_MIN_LENGTH || value.length > AUTO_TAG_MAX_LENGTH) return false
  if (/^\d+$/.test(value)) return false
  if (/[/:?#@<>"'|]/.test(value)) return false
  // 単語が3つ以上並ぶものは見出し文の切れ端であることが多い。
  if (value.split(/\s+/).length > 2) return false
  return true
}

/** ドメイン名そのもの（example.com / example）はグループで表現済みなので自動付与しない。 */
function matchesDomain(value: string, domain: string): boolean {
  if (!domain) return false
  const needle = value.toLowerCase()
  const labels = domain.toLowerCase().split('.')
  return needle === domain.toLowerCase() || labels.includes(needle)
}

/**
 * ページ由来のキーワードから、確認なしで付けてよいタグだけを選ぶ。
 * 「すでに自分が使っているタグ」を最優先にするのは、ユーザーの語彙に無い語を勝手に増やさないため。
 * 汎用的な人気タグ（library 由来）はここでは扱わない——そのページとの関係が無く、
 * 自動付与すると全ブックマークが同じタグで埋まってしまう。
 */
export function autoTagsFromPage(params: {
  keywords: string[]
  current: string[]
  bookmarks: Bookmark[]
  domain: string
  limit?: number
}): string[] {
  const known = new Set<string>()
  for (const bookmark of params.bookmarks) {
    if (bookmark.deletedAt !== null) continue
    for (const tag of bookmark.tags) known.add(tag.toLowerCase())
  }

  const used = new Set(params.current.map((t) => t.toLowerCase()))
  const picked: { tag: string; score: number }[] = []

  for (const raw of params.keywords) {
    const tag = raw.trim()
    const key = tag.toLowerCase()
    if (!tag || used.has(key) || picked.some((p) => p.tag.toLowerCase() === key)) continue
    if (!isUsableAsTag(tag) || matchesDomain(tag, params.domain)) continue
    picked.push({ tag, score: known.has(key) ? 2 : 1 })
  }

  return picked
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limit ?? AUTO_TAG_LIMIT)
    .map((entry) => entry.tag)
}
