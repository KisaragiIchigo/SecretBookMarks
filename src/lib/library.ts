import type { Bookmark, SortMode, ViewMode } from '@shared/types'
import { isBrokenLink, matchesQuery, parseQuery } from './searchQuery'

export type SmartView = 'all' | 'favorites' | 'recent' | 'untagged' | 'broken' | 'trash'

export interface LibraryFilter {
  view: SmartView
  tags: string[]
  query: string
}

export interface BookmarkGroup {
  key: string
  items: Bookmark[]
  collapsed: boolean
}

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

// 日本語のタイトルと数字混じりの見出しを人間の感覚に近い順で並べる。
const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' })

function matchesView(bookmark: Bookmark, view: SmartView): boolean {
  if (view === 'trash') return bookmark.deletedAt !== null
  if (bookmark.deletedAt !== null) return false
  switch (view) {
    case 'favorites':
      return bookmark.favorite
    case 'recent':
      return Date.now() - bookmark.createdAt <= RECENT_WINDOW_MS
    case 'untagged':
      return bookmark.tags.length === 0
    case 'broken':
      return isBrokenLink(bookmark)
    case 'all':
      return true
  }
}

export function filterBookmarks(bookmarks: Bookmark[], filter: LibraryFilter): Bookmark[] {
  const query = parseQuery(filter.query)
  const requiredTags = filter.tags.map((t) => t.toLowerCase())

  return bookmarks.filter((bookmark) => {
    if (!matchesView(bookmark, filter.view)) return false
    if (requiredTags.length > 0) {
      const tags = bookmark.tags.map((t) => t.toLowerCase())
      if (!requiredTags.every((needle) => tags.includes(needle))) return false
    }
    return matchesQuery(bookmark, query)
  })
}

export function sortBookmarks(bookmarks: Bookmark[], mode: SortMode): Bookmark[] {
  const sorted = [...bookmarks]
  switch (mode) {
    case 'added-desc':
      return sorted.sort((a, b) => b.createdAt - a.createdAt)
    case 'added-asc':
      return sorted.sort((a, b) => a.createdAt - b.createdAt)
    case 'title-asc':
      return sorted.sort((a, b) => collator.compare(a.title, b.title))
    case 'title-desc':
      return sorted.sort((a, b) => collator.compare(b.title, a.title))
    case 'opened-desc':
      return sorted.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
    case 'opencount-desc':
      return sorted.sort((a, b) => b.openCount - a.openCount || b.createdAt - a.createdAt)
    case 'updated-desc':
      return sorted.sort((a, b) => b.updatedAt - a.updatedAt)
  }
}

export function groupBookmarks(
  bookmarks: Bookmark[],
  mode: ViewMode,
  collapsedKeys: readonly string[] = [],
): BookmarkGroup[] {
  if (mode === 'flat') return [{ key: '', items: bookmarks, collapsed: false }]

  const collapsed = new Set(collapsedKeys)
  const groups = new Map<string, Bookmark[]>()
  for (const bookmark of bookmarks) {
    const list = groups.get(bookmark.group) ?? []
    list.push(bookmark)
    groups.set(bookmark.group, list)
  }
  return [...groups.entries()]
    .map(([key, items]) => ({ key, items, collapsed: collapsed.has(key) }))
    .sort((a, b) => collator.compare(a.key, b.key))
}

export interface TagCount {
  tag: string
  count: number
}

export function collectTagCounts(bookmarks: Bookmark[]): TagCount[] {
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
  return [...counts.values()]
    .map(({ label, count }) => ({ tag: label, count }))
    .sort((a, b) => collator.compare(a.tag, b.tag))
}

export interface LibraryCounts {
  all: number
  favorites: number
  recent: number
  untagged: number
  broken: number
  trash: number
}

export function countViews(bookmarks: Bookmark[]): LibraryCounts {
  const counts: LibraryCounts = { all: 0, favorites: 0, recent: 0, untagged: 0, broken: 0, trash: 0 }
  for (const bookmark of bookmarks) {
    if (bookmark.deletedAt !== null) {
      counts.trash += 1
      continue
    }
    counts.all += 1
    if (bookmark.favorite) counts.favorites += 1
    if (Date.now() - bookmark.createdAt <= RECENT_WINDOW_MS) counts.recent += 1
    if (bookmark.tags.length === 0) counts.untagged += 1
    if (isBrokenLink(bookmark)) counts.broken += 1
  }
  return counts
}
