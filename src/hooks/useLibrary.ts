import { useMemo } from 'react'
import type { Bookmark, SortMode, ViewMode } from '@shared/types'
import {
  collectTagCounts,
  countViews,
  filterBookmarks,
  groupBookmarks,
  sortBookmarks,
  type BookmarkGroup,
  type LibraryCounts,
  type LibraryFilter,
  type TagCount,
} from '@/lib/library'

export interface Library {
  visible: Bookmark[]
  groups: BookmarkGroup[]
  /** 表示順に並んだ id（たたんだグループは含まない）。範囲選択の基準に使う */
  orderedIds: string[]
  tagCounts: TagCount[]
  counts: LibraryCounts
}

/** 絞り込み → 並び替え → グループ化 の派生を1か所にまとめる。 */
export function useLibrary(
  bookmarks: Bookmark[],
  filter: LibraryFilter,
  sortMode: SortMode,
  viewMode: ViewMode,
  collapsedGroups: readonly string[] = [],
): Library {
  const visible = useMemo(
    () => sortBookmarks(filterBookmarks(bookmarks, filter), sortMode),
    [bookmarks, filter, sortMode],
  )
  const groups = useMemo(
    () => groupBookmarks(visible, viewMode, collapsedGroups),
    [visible, viewMode, collapsedGroups],
  )
  // たたんでいるグループの項目は画面に出ないので、範囲選択の対象にもしない。
  const orderedIds = useMemo(
    () => groups.filter((group) => !group.collapsed).flatMap((group) => group.items.map((item) => item.id)),
    [groups],
  )
  const tagCounts = useMemo(() => collectTagCounts(bookmarks), [bookmarks])
  const counts = useMemo(() => countViews(bookmarks), [bookmarks])

  return { visible, groups, orderedIds, tagCounts, counts }
}
