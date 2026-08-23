import { m } from 'framer-motion'
import { Clock, Library, Star, Tag, Trash2, Unlink } from 'lucide-react'
import type { LibraryCounts, LibraryFilter, SmartView, TagCount } from '@/lib/library'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'
import { TagRow } from './TagRow'

export interface SidebarProps {
  filter: LibraryFilter
  counts: LibraryCounts
  tagCounts: TagCount[]
  onChangeView: (view: SmartView) => void
  onToggleTag: (tag: string) => void
  onClearTags: () => void
  onRenameTag: (from: string, to: string) => void
  onRemoveTag: (tag: string) => void
}

const VIEWS: { id: SmartView; label: string; icon: typeof Library; countKey: keyof LibraryCounts }[] = [
  { id: 'all', label: 'すべて', icon: Library, countKey: 'all' },
  { id: 'favorites', label: 'お気に入り', icon: Star, countKey: 'favorites' },
  { id: 'recent', label: '最近追加', icon: Clock, countKey: 'recent' },
  { id: 'untagged', label: 'タグなし', icon: Tag, countKey: 'untagged' },
  { id: 'broken', label: 'リンク切れ', icon: Unlink, countKey: 'broken' },
  { id: 'trash', label: 'ゴミ箱', icon: Trash2, countKey: 'trash' },
]

export function Sidebar({
  filter,
  counts,
  tagCounts,
  onChangeView,
  onToggleTag,
  onClearTags,
  onRenameTag,
  onRemoveTag,
}: SidebarProps) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-white/[0.06] bg-white/[0.02]">
      <nav className="p-2">
        {VIEWS.map((view) => {
          const Icon = view.icon
          const active = filter.view === view.id
          return (
            <button
              key={view.id}
              type="button"
              onClick={() => onChangeView(view.id)}
              className={cn(
                'relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                active ? 'text-teal-200' : 'text-slate-300 hover:bg-white/[0.04]',
              )}
            >
              {active ? (
                <m.span
                  layoutId="sidebar-active"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-md bg-teal-500/10 shadow-glow"
                />
              ) : null}
              <Icon className={cn('relative h-4 w-4', active ? 'text-teal-300' : 'text-slate-400')} />
              <span className="relative flex-1 text-left">{view.label}</span>
              <span className="relative font-mono text-xs text-slate-400">{formatCount(counts[view.countKey])}</span>
            </button>
          )
        })}
      </nav>

      <div className="flex items-center justify-between border-y border-white/[0.06] px-3 py-2">
        <span className="label-caps">tags</span>
        {filter.tags.length > 0 ? (
          <button
            type="button"
            onClick={onClearTags}
            className="text-xs text-teal-300 transition-colors hover:text-teal-200"
          >
            解除 ({filter.tags.length})
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {tagCounts.length === 0 ? (
          <p className="px-2 py-3 text-xs text-slate-400">
            タグはまだありません。ブックマークにタグを付けるとここに並びます。
          </p>
        ) : (
          tagCounts.map((entry) => (
            <TagRow
              key={entry.tag}
              tag={entry.tag}
              count={entry.count}
              active={filter.tags.includes(entry.tag)}
              onToggle={() => onToggleTag(entry.tag)}
              onRename={(next) => onRenameTag(entry.tag, next)}
              onRemove={() => onRemoveTag(entry.tag)}
            />
          ))
        )}
      </div>
    </aside>
  )
}
