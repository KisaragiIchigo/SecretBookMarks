import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, PencilLine, RadioTower, Star, Trash2 } from 'lucide-react'
import type { Bookmark, BookmarkPatchInput } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { TagInput } from '@/components/ui/TagInput'
import { TagSuggestions } from '@/components/ui/TagSuggestions'
import { cn } from '@/lib/cn'
import { describeLinkStatus, formatCount, formatDateTime } from '@/lib/format'
import { buildSuggestions, completeTag } from '@/lib/tagSuggest'
import { useVault } from '@/state/VaultProvider'

export interface InspectorProps {
  bookmark: Bookmark | null
  selectedCount: number
  onUpdate: (id: string, patch: BookmarkPatchInput) => void
  onOpen: (id: string) => void
  onCopy: (url: string) => void
  onEdit: (bookmark: Bookmark) => void
  onTrash: () => void
  onCheckLinks: () => void
}

interface DraftFields {
  title: string
  group: string
  note: string
}

function toDraft(bookmark: Bookmark): DraftFields {
  return { title: bookmark.title, group: bookmark.group, note: bookmark.note }
}

export function Inspector({
  bookmark,
  selectedCount,
  onUpdate,
  onOpen,
  onCopy,
  onEdit,
  onTrash,
  onCheckLinks,
}: InspectorProps) {
  const { bookmarks } = useVault()
  const [draft, setDraft] = useState<DraftFields | null>(bookmark ? toDraft(bookmark) : null)

  // 選択が変わったら編集途中の内容は破棄して、選択中の実データに合わせ直す。
  useEffect(() => {
    setDraft(bookmark ? toDraft(bookmark) : null)
  }, [bookmark])

  const suggestions = useMemo(
    () =>
      bookmark
        ? buildSuggestions({ bookmarks, domain: bookmark.domain, keywords: [], current: bookmark.tags })
        : [],
    [bookmark, bookmarks],
  )

  const getCompletions = useCallback(
    (input: string) => (bookmark ? completeTag(input, bookmarks, bookmark.tags) : []),
    [bookmark, bookmarks],
  )

  if (selectedCount > 1) {
    return (
      <aside className="flex w-80 shrink-0 flex-col border-l border-white/[0.06] bg-white/[0.02]">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <span className="label-caps">selection</span>
        </div>
        <div className="space-y-4 p-4">
          <p className="font-display text-2xl font-semibold text-teal-300">{formatCount(selectedCount)}</p>
          <p className="text-sm text-slate-400">
            複数のブックマークを選択しています。ツールバーからタグの一括編集やリンク検査が行えます。
          </p>
          <div className="flex flex-col gap-2">
            <Button icon={<RadioTower className="h-3.5 w-3.5" />} onClick={onCheckLinks}>
              リンク切れを検査
            </Button>
            <Button variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={onTrash}>
              ゴミ箱へ移動
            </Button>
          </div>
        </div>
      </aside>
    )
  }

  if (!bookmark || !draft) {
    return (
      <aside className="flex w-80 shrink-0 flex-col border-l border-white/[0.06] bg-white/[0.02]">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <span className="label-caps">inspector</span>
        </div>
        <div className="p-4">
          <p className="text-sm text-slate-400">
            項目を選択すると、ここで内容を直接編集できます。ダブルクリックでブラウザが開きます。
          </p>
        </div>
      </aside>
    )
  }

  const commit = (patch: BookmarkPatchInput) => onUpdate(bookmark.id, patch)

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-white/[0.06] bg-white/[0.02]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <span className="label-caps">inspector</span>
        <button
          type="button"
          aria-label={bookmark.favorite ? 'お気に入りを外す' : 'お気に入りに追加'}
          onClick={() => commit({ favorite: !bookmark.favorite })}
          className={cn('transition-colors', bookmark.favorite ? 'text-amber-300' : 'text-slate-500 hover:text-amber-300')}
        >
          <Star className={cn('h-4 w-4', bookmark.favorite && 'fill-amber-300')} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <Field label="title">
          <Input
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            onBlur={() => draft.title !== bookmark.title && commit({ title: draft.title })}
          />
        </Field>

        <div>
          <span className="label-caps">url</span>
          <p className="mt-1.5 break-all rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 font-mono text-xs text-slate-300">
            {bookmark.url}
          </p>
        </div>

        <div>
          <span className="label-caps">tags</span>
          <div className="mt-1.5 space-y-2">
            <TagInput
              value={bookmark.tags}
              onChange={(tags) => commit({ tags })}
              getCompletions={getCompletions}
              placeholder="タグを追加"
            />
            <TagSuggestions
              suggestions={suggestions}
              onPick={(tag) => commit({ tags: [...bookmark.tags, tag] })}
              limit={6}
            />
          </div>
        </div>

        <Field label="group" hint="空欄にするとドメイン名に戻ります。">
          <Input
            value={draft.group}
            onChange={(event) => setDraft({ ...draft, group: event.target.value })}
            onBlur={() => draft.group !== bookmark.group && commit({ group: draft.group })}
          />
        </Field>

        <Field label="note">
          <Textarea
            rows={4}
            value={draft.note}
            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            onBlur={() => draft.note !== bookmark.note && commit({ note: draft.note })}
            placeholder="この URL を残した理由など"
          />
        </Field>

        <dl className="space-y-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5 text-xs">
          {[
            ['追加', formatDateTime(bookmark.createdAt)],
            ['更新', formatDateTime(bookmark.updatedAt)],
            ['最終アクセス', formatDateTime(bookmark.lastOpenedAt)],
            ['開いた回数', `${formatCount(bookmark.openCount)} 回`],
            [
              'リンク検査',
              bookmark.linkStatus
                ? `${describeLinkStatus(bookmark.linkStatus.code)} / ${formatDateTime(bookmark.linkStatus.checkedAt)}`
                : '未検査',
            ],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-slate-400">{label}</dt>
              <dd className="truncate text-right font-mono text-slate-300">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-white/[0.06] p-3">
        <Button variant="primary" size="sm" icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => onOpen(bookmark.id)}>
          開く
        </Button>
        <Button size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => onCopy(bookmark.url)}>
          URLをコピー
        </Button>
        <Button size="sm" icon={<PencilLine className="h-3.5 w-3.5" />} onClick={() => onEdit(bookmark)}>
          詳細を編集
        </Button>
        <Button variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={onTrash}>
          ゴミ箱へ
        </Button>
      </div>
    </aside>
  )
}
