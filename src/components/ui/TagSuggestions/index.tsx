import { Plus } from 'lucide-react'
import type { TagSuggestion } from '@/lib/tagSuggest'
import { cn } from '@/lib/cn'

export interface TagSuggestionsProps {
  suggestions: TagSuggestion[]
  onPick: (tag: string) => void
  limit?: number
}

const SOURCE_STYLE = {
  domain: 'border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20',
  page: 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300 hover:bg-emerald-500/15',
  library: 'border-white/[0.08] bg-white/[0.02] text-slate-300 hover:border-white/[0.16]',
} as const

const SOURCE_LABEL = {
  domain: 'このサイトで使用中',
  page: 'ページから抽出',
  library: 'よく使うタグ',
} as const

/** タグ候補をワンクリックで付けられるチップ列。出所ごとに色を変えて優先度を伝える。 */
export function TagSuggestions({ suggestions, onPick, limit = 12 }: TagSuggestionsProps) {
  if (suggestions.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {suggestions.slice(0, limit).map((suggestion) => (
        <button
          key={`${suggestion.source}:${suggestion.tag}`}
          type="button"
          title={SOURCE_LABEL[suggestion.source]}
          onClick={() => onPick(suggestion.tag)}
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors',
            SOURCE_STYLE[suggestion.source],
          )}
        >
          <Plus className="h-3 w-3 opacity-60" />
          {suggestion.tag}
          {suggestion.count > 1 ? <span className="font-mono opacity-60">{suggestion.count}</span> : null}
        </button>
      ))}
    </div>
  )
}
