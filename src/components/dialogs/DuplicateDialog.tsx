import type { DuplicateResolution } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatDateTime } from '@/lib/format'
import type { DuplicatePrompt } from '@/hooks/useCaptureFlow'

export interface DuplicateDialogProps {
  prompt: DuplicatePrompt | null
  onResolve: (resolution: DuplicateResolution) => Promise<void>
  onDismiss: () => void
}

export function DuplicateDialog({ prompt, onResolve, onDismiss }: DuplicateDialogProps) {
  if (!prompt) return null
  const { existing, input } = prompt

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onDismiss()}
      title="同じ URL が登録されています"
      description="正規化した URL が一致しました。どう扱うか選んでください。"
      width="sm"
      footer={
        <>
          <Button onClick={() => void onResolve('skip')}>スキップ</Button>
          <Button variant="danger" onClick={() => void onResolve('overwrite')}>
            上書き
          </Button>
          <Button variant="primary" onClick={() => void onResolve('merge')}>
            マージ
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <section className="rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2.5">
          <p className="label-caps">既存</p>
          <p className="mt-1.5 truncate text-sm text-slate-200">{existing.title}</p>
          <p className="mt-1 break-all font-mono text-xs text-slate-400">{existing.url}</p>
          <p className="mt-2 text-xs text-slate-400">
            タグ: {existing.tags.length > 0 ? existing.tags.join(', ') : 'なし'} / 追加:{' '}
            {formatDateTime(existing.createdAt)}
          </p>
        </section>

        <section className="rounded-lg border border-teal-500/20 bg-teal-500/[0.07] px-3 py-2.5">
          <p className="label-caps">これから登録</p>
          <p className="mt-1.5 truncate text-sm text-slate-200">{input.title || input.url}</p>
          <p className="mt-1 break-all font-mono text-xs text-slate-400">{input.url}</p>
          <p className="mt-2 text-xs text-slate-400">
            タグ: {input.tags.length > 0 ? input.tags.join(', ') : 'なし'}
          </p>
        </section>

        <p className="text-xs text-slate-400">
          マージはタグを合流させ、情報量の多いタイトルを残します。上書きは既存の内容を新しい入力で置き換えます。
        </p>
      </div>
    </Modal>
  )
}
