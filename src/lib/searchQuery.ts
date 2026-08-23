import type { Bookmark } from '@shared/types'

export interface ParsedQuery {
  terms: string[]
  tags: string[]
  sites: string[]
  favorite: boolean
  untagged: boolean
  broken: boolean
  after: number | null
  before: number | null
}

const EMPTY: ParsedQuery = {
  terms: [],
  tags: [],
  sites: [],
  favorite: false,
  untagged: false,
  broken: false,
  after: null,
  before: null,
}

/** 引用符で囲まれた語をひとかたまりとして切り出す。 */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g
  for (const match of input.matchAll(pattern)) {
    const value = match[1] ?? match[2] ?? match[3] ?? ''
    if (value.trim()) tokens.push(value.trim())
  }
  return tokens
}

function parseDate(value: string): number | null {
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

/**
 * 検索構文をパースする。
 *   tag:python #python   … タグ一致（AND）
 *   site:example.com     … ドメイン部分一致
 *   is:favorite / is:untagged / is:broken
 *   after:2026-01-01 / before:2026-06-30
 *   それ以外の語はタイトル・URL・タグ・メモへの AND 部分一致
 */
export function parseQuery(input: string): ParsedQuery {
  const text = (input ?? '').trim()
  if (!text) return EMPTY

  const parsed: ParsedQuery = { ...EMPTY, terms: [], tags: [], sites: [] }
  for (const token of tokenize(text)) {
    const lower = token.toLowerCase()
    if (lower.startsWith('tag:')) {
      const value = token.slice(4).trim()
      if (value) parsed.tags.push(value.toLowerCase())
    } else if (token.startsWith('#') && token.length > 1) {
      parsed.tags.push(token.slice(1).toLowerCase())
    } else if (lower.startsWith('site:')) {
      const value = token.slice(5).trim()
      if (value) parsed.sites.push(value.toLowerCase())
    } else if (lower.startsWith('is:')) {
      const value = lower.slice(3)
      if (value === 'favorite' || value === 'fav') parsed.favorite = true
      else if (value === 'untagged') parsed.untagged = true
      else if (value === 'broken') parsed.broken = true
    } else if (lower.startsWith('after:')) {
      parsed.after = parseDate(token.slice(6))
    } else if (lower.startsWith('before:')) {
      parsed.before = parseDate(token.slice(7))
    } else {
      parsed.terms.push(lower)
    }
  }
  return parsed
}

export function isEmptyQuery(query: ParsedQuery): boolean {
  return (
    query.terms.length === 0 &&
    query.tags.length === 0 &&
    query.sites.length === 0 &&
    !query.favorite &&
    !query.untagged &&
    !query.broken &&
    query.after === null &&
    query.before === null
  )
}

export function matchesQuery(bookmark: Bookmark, query: ParsedQuery): boolean {
  if (query.favorite && !bookmark.favorite) return false
  if (query.untagged && bookmark.tags.length > 0) return false
  if (query.broken && !isBrokenLink(bookmark)) return false
  if (query.after !== null && bookmark.createdAt < query.after) return false
  if (query.before !== null && bookmark.createdAt > query.before) return false

  if (query.sites.length > 0) {
    const domain = bookmark.domain.toLowerCase()
    if (!query.sites.every((site) => domain.includes(site))) return false
  }

  if (query.tags.length > 0) {
    const tags = bookmark.tags.map((t) => t.toLowerCase())
    if (!query.tags.every((needle) => tags.some((tag) => tag === needle || tag.includes(needle)))) return false
  }

  if (query.terms.length > 0) {
    const haystack = [bookmark.title, bookmark.url, bookmark.domain, bookmark.group, bookmark.note, ...bookmark.tags]
      .join(' ')
      .toLowerCase()
    if (!query.terms.every((term) => haystack.includes(term))) return false
  }

  return true
}

export function isBrokenLink(bookmark: Bookmark): boolean {
  const status = bookmark.linkStatus
  if (!status) return false
  return status.code === null || status.code >= 400
}
