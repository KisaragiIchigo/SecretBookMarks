import type { MouseEvent } from 'react'
import { Globe, Star } from 'lucide-react'
import type { Bookmark } from '@shared/types'
import { cn } from '@/lib/cn'
import { formatRelative, truncateUrl } from '@/lib/format'
import { isBrokenLink } from '@/lib/searchQuery'

export interface RowProps {
  bookmark: Bookmark
  favicon: string | undefined
  selected: boolean
  onSelect: (id: string, modifiers: { ctrl: boolean; shift: boolean }) => void
  onOpen: (id: string) => void
  onToggleFavorite: (id: string, favorite: boolean) => void
}

export function Row({ bookmark, favicon, selected, onSelect, onOpen, onToggleFavorite }: RowProps) {
  const broken = isBrokenLink(bookmark)

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    onSelect(bookmark.id, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey })
  }

  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={handleClick}
      onDoubleClick={() => onOpen(bookmark.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen(bookmark.id)
      }}
      className={cn(
        'group relative flex h-11 cursor-default select-none items-center gap-3 rounded-md px-3 transition-colors',
        selected ? 'bg-teal-500/10' : 'hover:bg-white/[0.035]',
      )}
    >
      {selected ? <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-teal-400/70" /> : null}

      <span className="grid h-4 w-4 shrink-0 place-items-center">
        {favicon ? (
          <img src={favicon} alt="" className="h-4 w-4 rounded-[3px] object-contain" />
        ) : (
          <Globe className="h-3.5 w-3.5 text-slate-500" />
        )}
      </span>

      <span className={cn('min-w-0 flex-[4] truncate text-sm', selected ? 'text-teal-100' : 'text-slate-200')}>
        {bookmark.title}
      </span>

      <span className="min-w-0 flex-[3] truncate font-mono text-xs text-slate-400">{truncateUrl(bookmark.url)}</span>

      <span className="flex w-44 shrink-0 items-center gap-1 overflow-hidden">
        {bookmark.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="shrink-0 rounded bg-teal-500/10 px-1.5 py-0.5 text-xs text-teal-300"
            title={tag}
          >
            {tag}
          </span>
        ))}
        {bookmark.tags.length > 3 ? (
          <span className="shrink-0 font-mono text-xs text-slate-400">+{bookmark.tags.length - 3}</span>
        ) : null}
      </span>

      {broken ? (
        <span className="shrink-0 rounded border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 text-xs text-rose-300">
          リンク切れ
        </span>
      ) : null}

      <span className="w-20 shrink-0 text-right font-mono text-xs text-slate-400">
        {formatRelative(bookmark.createdAt)}
      </span>

      <button
        type="button"
        aria-label={bookmark.favorite ? 'お気に入りを外す' : 'お気に入りに追加'}
        onClick={(event) => {
          event.stopPropagation()
          onToggleFavorite(bookmark.id, !bookmark.favorite)
        }}
        className={cn(
          'shrink-0 transition-colors',
          bookmark.favorite
            ? 'text-amber-300'
            : 'text-slate-500 opacity-0 hover:text-amber-300 focus:opacity-100 group-hover:opacity-100',
        )}
      >
        <Star className={cn('h-3.5 w-3.5', bookmark.favorite && 'fill-amber-300')} />
      </button>
    </div>
  )
}
