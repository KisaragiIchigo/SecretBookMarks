import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { CornerDownLeft, Globe, Search } from 'lucide-react'
import type { Bookmark, FaviconMap } from '@shared/types'
import { cn } from '@/lib/cn'
import { truncateUrl } from '@/lib/format'
import { matchesQuery, parseQuery } from '@/lib/searchQuery'

const MAX_RESULTS = 40

export interface PaletteCommand {
  id: string
  label: string
  hint: string
  run: () => void
}

export interface CommandPaletteProps {
  open: boolean
  bookmarks: Bookmark[]
  favicons: FaviconMap
  commands: PaletteCommand[]
  onClose: () => void
  onOpenBookmark: (id: string) => void
}

export function CommandPalette({
  open,
  bookmarks,
  favicons,
  commands,
  onClose,
  onOpenBookmark,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
    }
  }, [open])

  const matchedCommands = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return commands
    return commands.filter((command) => command.label.toLowerCase().includes(needle))
  }, [commands, query])

  const matchedBookmarks = useMemo(() => {
    const needle = query.trim()
    if (!needle) {
      return [...bookmarks]
        .filter((b) => b.deletedAt === null)
        .sort((a, b) => (b.lastOpenedAt ?? b.createdAt) - (a.lastOpenedAt ?? a.createdAt))
        .slice(0, MAX_RESULTS)
    }
    const parsed = parseQuery(needle)
    return bookmarks.filter((b) => b.deletedAt === null && matchesQuery(b, parsed)).slice(0, MAX_RESULTS)
  }, [bookmarks, query])

  const total = matchedCommands.length + matchedBookmarks.length

  useEffect(() => {
    setCursor((current) => (total === 0 ? 0 : Math.min(current, total - 1)))
  }, [total])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const activate = (index: number) => {
    if (index < matchedCommands.length) {
      matchedCommands[index]?.run()
      onClose()
      return
    }
    const bookmark = matchedBookmarks[index - matchedCommands.length]
    if (bookmark) {
      onOpenBookmark(bookmark.id)
      onClose()
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-[2px] animate-fade-in" />
        <Dialog.Content
          aria-label="コマンドパレット"
          className="surface-panel fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-6rem)] max-w-2xl -translate-x-1/2 rounded-2xl bg-ink-850/95 shadow-panel animate-fade-in"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setCursor((current) => (total === 0 ? 0 : (current + 1) % total))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setCursor((current) => (total === 0 ? 0 : (current - 1 + total) % total))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              activate(cursor)
            }
          }}
        >
          <Dialog.Title className="sr-only">コマンドパレット</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setCursor(0)
              }}
              placeholder="ブックマークを検索、または操作を実行"
              className="w-full bg-transparent text-base text-slate-200 placeholder:text-slate-500 focus:outline-none"
            />
          </div>

          <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
            {total === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">一致する項目がありません。</p>
            ) : null}

            {matchedCommands.map((command, index) => (
              <button
                key={command.id}
                type="button"
                data-index={index}
                onMouseEnter={() => setCursor(index)}
                onClick={() => activate(index)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                  cursor === index ? 'bg-teal-500/10 text-teal-100' : 'text-slate-300 hover:bg-white/[0.04]',
                )}
              >
                <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="flex-1 truncate text-sm">{command.label}</span>
                <span className="shrink-0 font-mono text-xs text-slate-400">{command.hint}</span>
              </button>
            ))}

            {matchedBookmarks.map((bookmark, offset) => {
              const index = matchedCommands.length + offset
              const favicon = favicons[bookmark.domain]
              return (
                <button
                  key={bookmark.id}
                  type="button"
                  data-index={index}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => activate(index)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                    cursor === index ? 'bg-teal-500/10' : 'hover:bg-white/[0.04]',
                  )}
                >
                  {favicon ? (
                    <img src={favicon} alt="" className="h-4 w-4 shrink-0 rounded-[3px] object-contain" />
                  ) : (
                    <Globe className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  )}
                  <span className={cn('flex-1 truncate text-sm', cursor === index ? 'text-teal-100' : 'text-slate-200')}>
                    {bookmark.title}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-slate-400">{truncateUrl(bookmark.url, 40)}</span>
                </button>
              )
            })}
          </div>

          <footer className="flex items-center gap-4 border-t border-white/[0.06] px-4 py-2 text-xs text-slate-400">
            <span className="font-mono">↑↓ 移動</span>
            <span className="font-mono">Enter 実行</span>
            <span className="font-mono">Esc 閉じる</span>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
