import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  /** 入力途中の文字列に対する補完候補を返す */
  getCompletions?: (input: string) => string[]
  placeholder?: string
  autoFocus?: boolean
}

/** タグをチップで扱う入力欄。Enter とカンマで確定し、空の状態の Backspace で末尾を削る。 */
export function TagInput({ value, onChange, getCompletions, placeholder, autoFocus }: TagInputProps) {
  const [draft, setDraft] = useState('')
  const [cursor, setCursor] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const completions = useMemo(() => (getCompletions ? getCompletions(draft) : []), [draft, getCompletions])
  const showCompletions = draft.trim().length > 0 && completions.length > 0

  const commit = (tag: string) => {
    const next = tag.trim()
    if (!next) return
    if (!value.some((t) => t.toLowerCase() === next.toLowerCase())) onChange([...value, next])
    setDraft('')
    setCursor(-1)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === '、') {
      event.preventDefault()
      commit(cursor >= 0 && completions[cursor] ? completions[cursor] : draft)
      return
    }
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
      return
    }
    if (!showCompletions) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((current) => (current + 1) % completions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((current) => (current - 1 + completions.length) % completions.length)
    } else if (event.key === 'Escape') {
      setCursor(-1)
      setDraft('')
    }
  }

  return (
    <div className="relative">
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          'flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-white/[0.06] bg-black/40 px-2 py-1.5',
          'shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)] transition-colors focus-within:border-teal-500/50',
        )}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex shrink-0 items-center gap-1 rounded bg-teal-500/10 py-0.5 pl-2 pr-1 text-xs text-teal-300"
          >
            {tag}
            <button
              type="button"
              aria-label={`${tag} を外す`}
              onClick={(event) => {
                event.stopPropagation()
                onChange(value.filter((t) => t !== tag))
              }}
              className="text-teal-400/70 transition-colors hover:text-rose-300"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            setCursor(-1)
          }}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          placeholder={value.length === 0 ? placeholder : ''}
          className="min-w-[7rem] flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
        />
      </div>

      {showCompletions ? (
        <ul className="surface-panel absolute left-0 right-0 top-[calc(100%+0.25rem)] z-40 overflow-hidden rounded-lg bg-ink-850/95 p-1 shadow-panel">
          {completions.map((tag, index) => (
            <li key={tag}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  commit(tag)
                }}
                onMouseEnter={() => setCursor(index)}
                className={cn(
                  'w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                  cursor === index ? 'bg-teal-500/10 text-teal-100' : 'text-slate-300 hover:bg-white/[0.05]',
                )}
              >
                {tag}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
