import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, MoreHorizontal, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'

export interface TagRowProps {
  tag: string
  count: number
  active: boolean
  onToggle: () => void
  onRename: (next: string) => void
  onRemove: () => void
}

export function TagRow({ tag, count, active, onToggle, onRename, onRemove }: TagRowProps) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(tag)

  if (renaming) {
    return (
      <form
        className="flex items-center gap-1 px-1 py-1"
        onSubmit={(event) => {
          event.preventDefault()
          const next = draft.trim()
          if (next && next !== tag) onRename(next)
          setRenaming(false)
        }}
      >
        <Input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => setRenaming(false)}
          className="h-7 text-xs"
        />
        <button type="submit" className="text-teal-300 transition-colors hover:text-teal-200" aria-label="タグ名を確定">
          <Check className="h-3.5 w-3.5" />
        </button>
      </form>
    )
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
        active ? 'bg-teal-500/10 text-teal-200' : 'text-slate-300 hover:bg-white/[0.04]',
      )}
    >
      <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', active ? 'bg-teal-400' : 'bg-slate-500')} />
        <span className="truncate text-sm">{tag}</span>
      </button>
      <span className="shrink-0 font-mono text-xs text-slate-400">{formatCount(count)}</span>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label={`${tag} の操作`}
          className="shrink-0 text-slate-500 opacity-0 transition-opacity hover:text-slate-200 focus:opacity-100 group-hover:opacity-100"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="surface-panel z-[60] min-w-[10rem] rounded-lg bg-ink-850/95 p-1 shadow-panel animate-fade-in"
          >
            <DropdownMenu.Item
              onSelect={() => {
                setDraft(tag)
                setRenaming(true)
              }}
              className="flex cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-slate-300 outline-none data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-slate-100"
            >
              名前を変更
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={onRemove}
              className="flex cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-rose-300 outline-none data-[highlighted]:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              全項目から外す
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}
