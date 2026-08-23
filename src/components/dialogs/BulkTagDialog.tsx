import { useCallback, useEffect, useState } from 'react'
import * as RadioGroup from '@radix-ui/react-radio-group'
import type { BulkTagMode } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { TagInput } from '@/components/ui/TagInput'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'
import { completeTag } from '@/lib/tagSuggest'
import { useVault } from '@/state/VaultProvider'

export interface BulkTagDialogProps {
  open: boolean
  targetCount: number
  onClose: () => void
  onApply: (mode: BulkTagMode, tags: string[]) => Promise<void>
}

const MODES: { value: BulkTagMode; label: string; description: string }[] = [
  { value: 'add', label: '追加', description: '既存のタグを残したまま追記します。' },
  { value: 'remove', label: '削除', description: '一致するタグだけを取り除きます。' },
  { value: 'replace', label: '置き換え', description: '既存のタグを破棄して入力内容にします。' },
]

export function BulkTagDialog({ open, targetCount, onClose, onApply }: BulkTagDialogProps) {
  const { bookmarks } = useVault()
  const [mode, setMode] = useState<BulkTagMode>('add')
  const [tags, setTags] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setMode('add')
      setTags([])
    }
  }, [open])

  const getCompletions = useCallback((input: string) => completeTag(input, bookmarks, tags), [bookmarks, tags])
  const canApply = mode === 'replace' ? true : tags.length > 0

  const apply = async () => {
    setBusy(true)
    try {
      await onApply(mode, tags)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="タグを一括編集"
      description={`選択中の ${formatCount(targetCount)} 件に対して操作します。`}
      width="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={() => void apply()} disabled={busy || !canApply}>
            {busy ? '適用中…' : '適用'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <span className="label-caps">tags</span>
          <div className="mt-1.5">
            <TagInput
              autoFocus
              value={tags}
              onChange={setTags}
              getCompletions={getCompletions}
              placeholder="Enter またはカンマで確定します"
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            大文字と小文字の違いは同じタグとして扱います。入力中は既存のタグを補完します。
          </p>
        </div>

        <div>
          <span className="label-caps">mode</span>
          <RadioGroup.Root
            value={mode}
            onValueChange={(next) => setMode(next as BulkTagMode)}
            className="mt-2 grid gap-2"
          >
            {MODES.map((option) => (
              <RadioGroup.Item
                key={option.value}
                value={option.value}
                className={cn(
                  'flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                  mode === option.value
                    ? 'border-teal-500/40 bg-teal-500/10 shadow-glow'
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]',
                )}
              >
                <span
                  className={cn(
                    'mt-1 h-2.5 w-2.5 shrink-0 rounded-full border',
                    mode === option.value ? 'border-teal-300 bg-teal-400' : 'border-slate-500',
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-200">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-400">{option.description}</span>
                </span>
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
        </div>

        {mode === 'replace' && tags.length === 0 ? (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            入力が空のため、選択中の項目からすべてのタグが外れます。
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
