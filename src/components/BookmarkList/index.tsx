import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Inbox } from 'lucide-react'
import type { Bookmark, FaviconMap } from '@shared/types'
import type { BookmarkGroup } from '@/lib/library'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'
import { Row } from './Row'

const PAGE_SIZE = 200

type RenderRow =
  | { kind: 'group'; key: string; label: string; count: number; collapsed: boolean }
  | { kind: 'item'; item: Bookmark }

export interface BookmarkListProps {
  groups: BookmarkGroup[]
  favicons: FaviconMap
  selectedSet: Set<string>
  emptyMessage: string
  onSelect: (id: string, modifiers: { ctrl: boolean; shift: boolean }) => void
  onOpen: (id: string) => void
  onToggleFavorite: (id: string, favorite: boolean) => void
  onClearSelection: () => void
  onToggleGroup: (key: string) => void
}

export function BookmarkList({
  groups,
  favicons,
  selectedSet,
  emptyMessage,
  onSelect,
  onOpen,
  onToggleFavorite,
  onClearSelection,
  onToggleGroup,
}: BookmarkListProps) {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const rows = useMemo<RenderRow[]>(() => {
    const output: RenderRow[] = []
    for (const group of groups) {
      if (group.key) {
        output.push({
          kind: 'group',
          key: group.key,
          label: group.key,
          count: group.items.length,
          collapsed: group.collapsed,
        })
      }
      // たたんでいるグループの中身は描画しない（件数が多いほど軽くなる）。
      if (group.collapsed) continue
      for (const item of group.items) output.push({ kind: 'item', item })
    }
    return output
  }, [groups])

  useEffect(() => setLimit(PAGE_SIZE), [groups])

  // 大量件数でも初期描画を軽く保つため、末尾に到達したぶんだけ描画数を伸ばす。
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || limit >= rows.length) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setLimit((current) => current + PAGE_SIZE)
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [limit, rows.length])

  if (rows.length === 0) {
    return (
      <div className="grid flex-1 place-items-center px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Inbox className="h-6 w-6 text-slate-500" />
          <p className="max-w-sm text-sm text-slate-400">{emptyMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      role="listbox"
      aria-label="ブックマーク一覧"
      aria-multiselectable
      className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClearSelection()
      }}
    >
      {rows.slice(0, limit).map((row) =>
        row.kind === 'group' ? (
          <button
            key={`group:${row.key}`}
            type="button"
            onClick={() => onToggleGroup(row.key)}
            aria-expanded={!row.collapsed}
            className={cn(
              'sticky top-0 z-10 -mx-2 flex h-7 w-[calc(100%+1rem)] items-center gap-2 px-3 backdrop-blur-sm transition-colors',
              row.collapsed ? 'bg-ink-900/95 hover:bg-white/[0.04]' : 'bg-ink-900/85 hover:bg-white/[0.03]',
            )}
          >
            {row.collapsed ? (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-teal-300" />
            )}
            <span
              className={cn(
                'truncate font-display text-xs font-semibold uppercase tracking-[0.16em]',
                row.collapsed ? 'text-slate-400' : 'text-slate-300',
              )}
            >
              {row.label}
            </span>
            <span className="h-px flex-1 bg-white/[0.06]" />
            <span className="font-mono text-xs text-slate-400">{formatCount(row.count)}</span>
          </button>
        ) : (
          <Row
            key={row.item.id}
            bookmark={row.item}
            favicon={favicons[row.item.domain]}
            selected={selectedSet.has(row.item.id)}
            onSelect={onSelect}
            onOpen={onOpen}
            onToggleFavorite={onToggleFavorite}
          />
        ),
      )}
      {limit < rows.length ? <div ref={sentinelRef} className="h-8" /> : null}
    </div>
  )
}
