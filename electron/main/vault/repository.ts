import { randomUUID } from 'node:crypto'
import type {
  Bookmark,
  BookmarkInput,
  BulkTagMode,
  CreateResult,
  DuplicateResolution,
  LinkStatus,
} from '@shared/types'
import { dedupeTags, mergeTags, removeTags } from '@shared/tags'
import { extractDomain, normalizeUrl } from '@shared/url'
import { session } from './session'

function bookmarks(): Bookmark[] {
  return session.getModel().bookmarks
}

export function listBookmarks(): Bookmark[] {
  return bookmarks()
}

export function findByNormalizedUrl(normalized: string): Bookmark | undefined {
  return bookmarks().find((b) => b.normalizedUrl === normalized && b.deletedAt === null)
}

export function findById(id: string): Bookmark | undefined {
  return bookmarks().find((b) => b.id === id)
}

function buildBookmark(input: BookmarkInput): Bookmark {
  const url = input.url.trim()
  const domain = extractDomain(url)
  const now = Date.now()
  return {
    id: randomUUID(),
    url,
    normalizedUrl: normalizeUrl(url),
    title: input.title.trim() || url,
    domain,
    group: (input.group ?? '').trim() || domain,
    tags: dedupeTags(input.tags),
    note: input.note ?? '',
    favorite: input.favorite,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: null,
    openCount: 0,
    deletedAt: null,
    linkStatus: null,
  }
}

export function createBookmark(input: BookmarkInput, resolution: DuplicateResolution): CreateResult {
  const normalized = normalizeUrl(input.url.trim())
  const existing = findByNormalizedUrl(normalized)

  if (existing) {
    if (resolution === 'ask') return { status: 'duplicate', existing }
    if (resolution === 'skip') return { status: 'skipped', existing }

    if (resolution === 'merge') {
      // 情報量の多い方（長いタイトル・非空のメモ）を残しつつタグを合流させる。
      existing.tags = mergeTags(existing.tags, dedupeTags(input.tags))
      if (input.title.trim().length > existing.title.length) existing.title = input.title.trim()
      if (input.note.trim() && !existing.note.trim()) existing.note = input.note
      existing.favorite = existing.favorite || input.favorite
      existing.updatedAt = Date.now()
      session.markDirty()
      return { status: 'merged', bookmark: existing }
    }

    const domain = extractDomain(input.url.trim())
    existing.url = input.url.trim()
    existing.normalizedUrl = normalized
    existing.title = input.title.trim() || existing.title
    existing.domain = domain
    existing.group = (input.group ?? '').trim() || domain
    existing.tags = dedupeTags(input.tags)
    existing.note = input.note
    existing.favorite = input.favorite
    existing.updatedAt = Date.now()
    session.markDirty()
    return { status: 'overwritten', bookmark: existing }
  }

  const created = buildBookmark(input)
  bookmarks().unshift(created)
  session.markDirty()
  return { status: 'created', bookmark: created }
}

export type BookmarkPatch = Partial<Pick<Bookmark, 'title' | 'url' | 'tags' | 'note' | 'group' | 'favorite'>>

export function updateBookmark(id: string, patch: BookmarkPatch): Bookmark | null {
  const target = findById(id)
  if (!target) return null

  if (patch.url !== undefined) {
    const url = patch.url.trim()
    target.url = url
    target.normalizedUrl = normalizeUrl(url)
    const domain = extractDomain(url)
    if (target.group === target.domain) target.group = domain
    target.domain = domain
  }
  if (patch.title !== undefined) target.title = patch.title.trim() || target.url
  if (patch.tags !== undefined) target.tags = dedupeTags(patch.tags)
  if (patch.note !== undefined) target.note = patch.note
  if (patch.group !== undefined) target.group = patch.group.trim() || target.domain
  if (patch.favorite !== undefined) target.favorite = patch.favorite

  target.updatedAt = Date.now()
  session.markDirty()
  return target
}

export function trashBookmarks(ids: string[]): number {
  const set = new Set(ids)
  let count = 0
  for (const bookmark of bookmarks()) {
    if (!set.has(bookmark.id) || bookmark.deletedAt !== null) continue
    bookmark.deletedAt = Date.now()
    bookmark.updatedAt = bookmark.deletedAt
    count += 1
  }
  if (count > 0) session.markDirty()
  return count
}

export function restoreBookmarks(ids: string[]): number {
  const set = new Set(ids)
  let count = 0
  for (const bookmark of bookmarks()) {
    if (!set.has(bookmark.id) || bookmark.deletedAt === null) continue
    bookmark.deletedAt = null
    bookmark.updatedAt = Date.now()
    count += 1
  }
  if (count > 0) session.markDirty()
  return count
}

export function purgeBookmarks(ids: string[] | 'trash'): number {
  const model = session.getModel()
  const before = model.bookmarks.length
  model.bookmarks =
    ids === 'trash'
      ? model.bookmarks.filter((b) => b.deletedAt === null)
      : model.bookmarks.filter((b) => !ids.includes(b.id))
  const removed = before - model.bookmarks.length
  if (removed > 0) {
    pruneFavicons()
    session.markDirty()
  }
  return removed
}

/** 保持期間を過ぎたゴミ箱項目を完全に削除する。0 日指定なら何もしない。 */
export function pruneTrash(retentionDays: number): number {
  if (retentionDays <= 0) return 0
  const limit = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const expired = bookmarks().filter((b) => b.deletedAt !== null && b.deletedAt < limit).map((b) => b.id)
  return expired.length > 0 ? purgeBookmarks(expired) : 0
}

export function applyBulkTags(ids: string[], mode: BulkTagMode, tags: string[]): number {
  const set = new Set(ids)
  const input = dedupeTags(tags)
  let count = 0
  for (const bookmark of bookmarks()) {
    if (!set.has(bookmark.id)) continue
    if (mode === 'add') bookmark.tags = mergeTags(bookmark.tags, input)
    else if (mode === 'remove') bookmark.tags = removeTags(bookmark.tags, input)
    else bookmark.tags = input
    bookmark.updatedAt = Date.now()
    count += 1
  }
  if (count > 0) session.markDirty()
  return count
}

export function setFavorite(ids: string[], favorite: boolean): number {
  const set = new Set(ids)
  let count = 0
  for (const bookmark of bookmarks()) {
    if (!set.has(bookmark.id) || bookmark.favorite === favorite) continue
    bookmark.favorite = favorite
    bookmark.updatedAt = Date.now()
    count += 1
  }
  if (count > 0) session.markDirty()
  return count
}

export function setGroup(ids: string[], group: string): number {
  const set = new Set(ids)
  const next = group.trim()
  let count = 0
  for (const bookmark of bookmarks()) {
    if (!set.has(bookmark.id)) continue
    bookmark.group = next || bookmark.domain
    bookmark.updatedAt = Date.now()
    count += 1
  }
  if (count > 0) session.markDirty()
  return count
}

export function renameTag(from: string, to: string): number {
  const source = from.toLowerCase()
  const next = to.trim()
  let count = 0
  for (const bookmark of bookmarks()) {
    if (!bookmark.tags.some((t) => t.toLowerCase() === source)) continue
    const replaced = bookmark.tags.map((t) => (t.toLowerCase() === source ? next : t)).filter(Boolean)
    bookmark.tags = dedupeTags(replaced)
    bookmark.updatedAt = Date.now()
    count += 1
  }
  if (count > 0) session.markDirty()
  return count
}

export function registerOpen(id: string): Bookmark | null {
  const target = findById(id)
  if (!target) return null
  target.lastOpenedAt = Date.now()
  target.openCount += 1
  session.markDirty()
  return target
}

export function setLinkStatus(id: string, status: LinkStatus): void {
  const target = findById(id)
  if (!target) return
  target.linkStatus = status
  session.markDirty()
}

export function setFavicon(domain: string, dataUrl: string): void {
  const model = session.getModel()
  if (model.favicons[domain] === dataUrl) return
  model.favicons[domain] = dataUrl
  session.markDirty()
}

export function hasFavicon(domain: string): boolean {
  return Boolean(session.getModel().favicons[domain])
}

/** どのブックマークからも参照されなくなったファビコンを捨てる。 */
function pruneFavicons(): void {
  const model = session.getModel()
  const alive = new Set(model.bookmarks.map((b) => b.domain))
  for (const domain of Object.keys(model.favicons)) {
    if (!alive.has(domain)) delete model.favicons[domain]
  }
}

/** たたんでいるグループの一覧。ドメイン名を含むためヴォールト内に持つ。 */
export function collapsedGroups(): string[] {
  return session.getModel().collapsedGroups ?? []
}

export function setCollapsedGroups(keys: string[]): string[] {
  const model = session.getModel()
  model.collapsedGroups = [...new Set(keys)]
  session.markDirty()
  return model.collapsedGroups
}
