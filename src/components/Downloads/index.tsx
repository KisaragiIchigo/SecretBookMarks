import { FolderOpen, Trash2, X } from 'lucide-react'
import type { DownloadTask } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'
import { formatCount, formatRelative } from '@/lib/format'
import { useBrowser } from '@/state/BrowserProvider'

const STATUS_LABEL: Record<DownloadTask['status'], string> = {
  queued: '待機中',
  running: '取得中',
  completed: '完了',
  failed: '失敗',
  canceled: 'キャンセル',
}

const STATUS_STYLE: Record<DownloadTask['status'], string> = {
  queued: 'bg-white/[0.06] text-slate-300',
  running: 'bg-teal-500/10 text-teal-300',
  completed: 'bg-emerald-500/10 text-emerald-300',
  failed: 'bg-rose-500/10 text-rose-300',
  canceled: 'bg-amber-500/10 text-amber-300',
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—'
  const mb = bytes / 1048576
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`
}

export interface DownloadsDialogProps {
  open: boolean
  onClose: () => void
}

export function DownloadsDialog({ open, onClose }: DownloadsDialogProps) {
  const { downloads, refreshDownloads } = useBrowser()

  const clearHistory = async () => {
    await window.sbm.downloads.clearHistory()
    await refreshDownloads()
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="ダウンロード"
      description="実行中の進捗と、完了した履歴を表示します。履歴はヴォールト内に暗号化して保存されます。"
      width="lg"
      footer={
        <>
          <Button icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => void clearHistory()}>
            履歴を消す
          </Button>
          <Button variant="primary" onClick={onClose}>
            閉じる
          </Button>
        </>
      }
    >
      {downloads.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          まだダウンロードはありません。ブラウザで動画を右クリックするか、検出パネルから保存してください。
        </p>
      ) : (
        <ul className="space-y-2">
          {downloads.map((task) => {
            const percent = task.progress === null ? null : Math.round(task.progress * 100)
            const running = task.status === 'running' || task.status === 'queued'
            return (
              <li key={task.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-xs', STATUS_STYLE[task.status])}>
                    {STATUS_LABEL[task.status]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-200" title={task.savePath}>
                    {task.fileName}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-slate-400">{formatRelative(task.startedAt)}</span>
                  {running ? (
                    <IconButton
                      label="中止"
                      tone="danger"
                      icon={<X className="h-3.5 w-3.5" />}
                      onClick={() => void window.sbm.downloads.cancel(task.id)}
                    />
                  ) : (
                    <IconButton
                      label="保存先を開く"
                      icon={<FolderOpen className="h-3.5 w-3.5" />}
                      disabled={task.status !== 'completed'}
                      onClick={() => void window.sbm.downloads.reveal(task.id)}
                    />
                  )}
                </div>

                {running ? (
                  <div className="mt-2">
                    <div className="h-1 overflow-hidden rounded-full bg-black/40">
                      <div
                        className={cn(
                          'h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-[width] duration-200',
                          percent === null && 'w-1/3 animate-pulse',
                        )}
                        style={percent === null ? undefined : { width: `${percent}%` }}
                      />
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-400">
                      {percent === null ? '進捗を測定できません' : `${percent}%`} / {formatBytes(task.receivedBytes)}
                      {task.totalBytes > 0 ? ` of ${formatBytes(task.totalBytes)}` : ''}
                      {task.kind === 'hls' ? ' / ffmpeg で結合中' : ''}
                    </p>
                  </div>
                ) : null}

                {task.error ? <p className="mt-1.5 text-xs text-rose-300">{task.error}</p> : null}
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-3 font-mono text-xs text-slate-400">{formatCount(downloads.length)} 件</p>
    </Modal>
  )
}
