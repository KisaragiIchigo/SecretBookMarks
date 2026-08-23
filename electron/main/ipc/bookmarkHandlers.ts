import { shell } from 'electron'
import { IPC, IPC_EVENT } from '@shared/ipc'
import type { Bookmark } from '@shared/types'
import { enqueueFavicon } from '../metadata/faviconQueue'
import { checkLink, fetchPageMeta } from '../metadata/fetchPageMeta'
import { loadSettings } from '../settings'
import {
  applyBulkTags,
  createBookmark,
  findById,
  listBookmarks,
  purgeBookmarks,
  registerOpen,
  renameTag,
  restoreBookmarks,
  setFavicon,
  setFavorite,
  setGroup,
  setLinkStatus,
  trashBookmarks,
  updateBookmark,
} from '../vault/repository'
import { session } from '../vault/session'
import { emitToRenderer } from '../window'
import { register, registerVoid } from './register'
import {
  bulkTagsSchema,
  checkLinksSchema,
  createBookmarkSchema,
  fetchPageMetaSchema,
  idListSchema,
  openBookmarkSchema,
  purgeSchema,
  renameTagSchema,
  setFavoriteSchema,
  setGroupSchema,
  updateBookmarkSchema,
} from './schemas'

const LINK_CHECK_CONCURRENCY = 5

/** 配列を指定並列度で流す。順序は保証しない（結果は id で突き合わせる）。 */
async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await task(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

export function registerBookmarkHandlers(): void {
  registerVoid<Bookmark[]>(IPC.bookmarksList, () => listBookmarks())

  register(IPC.bookmarksCreate, createBookmarkSchema, ({ input, resolution }) => {
    const result = createBookmark(input, resolution)
    if (result.status !== 'duplicate' && result.status !== 'skipped' && loadSettings().fetchFavicons) {
      enqueueFavicon(result.bookmark.url)
    }
    return result
  })

  register(IPC.bookmarksUpdate, updateBookmarkSchema, ({ id, patch }) => {
    const updated = updateBookmark(id, patch)
    if (!updated) throw new Error('対象のブックマークが見つかりません。')
    if (patch.url && loadSettings().fetchFavicons) enqueueFavicon(updated.url)
    return updated
  })

  register(IPC.bookmarksTrash, idListSchema, (ids) => trashBookmarks(ids))
  register(IPC.bookmarksRestore, idListSchema, (ids) => restoreBookmarks(ids))
  register(IPC.bookmarksPurge, purgeSchema, ({ ids }) => purgeBookmarks(ids))
  register(IPC.bookmarksBulkTags, bulkTagsSchema, ({ ids, mode, tags }) => applyBulkTags(ids, mode, tags))
  register(IPC.bookmarksSetFavorite, setFavoriteSchema, ({ ids, favorite }) => setFavorite(ids, favorite))
  register(IPC.bookmarksSetGroup, setGroupSchema, ({ ids, group }) => setGroup(ids, group))
  register(IPC.bookmarksRenameTag, renameTagSchema, ({ from, to }) => renameTag(from, to))

  register(IPC.bookmarksOpen, openBookmarkSchema, async ({ id, external }) => {
    const bookmark = findById(id)
    if (!bookmark) throw new Error('対象のブックマークが見つかりません。')
    if (!/^https?:\/\//i.test(bookmark.url)) throw new Error('http(s) 以外の URL は開けません。')
    // 既定では内蔵ブラウザで開く。Renderer 側がタブを用意するので、ここでは記録だけ行う。
    if (external) await shell.openExternal(bookmark.url)
    return registerOpen(id)
  })

  register(IPC.bookmarksCheckLinks, checkLinksSchema, async ({ ids }) => {
    const targets = ids.map((id) => findById(id)).filter((b): b is Bookmark => Boolean(b))
    await mapWithConcurrency(targets, LINK_CHECK_CONCURRENCY, async (bookmark) => {
      const code = await checkLink(bookmark.url)
      setLinkStatus(bookmark.id, { code, checkedAt: Date.now() })
    })
    return targets.map((b) => ({ id: b.id, linkStatus: findById(b.id)?.linkStatus ?? null }))
  })

  register(IPC.metaFetchPage, fetchPageMetaSchema, async ({ url }) => {
    const settings = loadSettings()
    const meta = await fetchPageMeta(url, { title: settings.fetchTitles, favicon: settings.fetchFavicons })
    // 取り込みダイアログの時点でファビコンを確保しておくと、保存直後の一覧が最初から埋まる。
    if (meta.favicon && session.isUnlocked) {
      setFavicon(meta.favicon.domain, meta.favicon.dataUrl)
      emitToRenderer(IPC_EVENT.faviconUpdated, meta.favicon)
    }
    return meta
  })
}
