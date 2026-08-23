import { Download, Film, PenLine, Radio, X } from 'lucide-react'
import type { MediaCandidate } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/cn'
import { formatCount, truncateUrl } from '@/lib/format'

export interface MediaPanelProps {
  candidates: MediaCandidate[]
  pageUrl: string
  ffmpegAvailable: boolean
  onClose: () => void
  onSave: (candidate: MediaCandidate, saveAs: boolean) => void
}

function formatSize(bytes: number | null): string {
  if (!bytes) return 'サイズ不明'
  const mb = bytes / 1048576
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`
}

/** ページ読み込み中に捕まえたメディアの一覧。右クリックで拾えない動画はここから保存する。 */
export function MediaPanel({ candidates, pageUrl, ffmpegAvailable, onClose, onSave }: MediaPanelProps) {
  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-white/[0.06] bg-ink-900/95">
      <header className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
        <Film className="h-4 w-4 text-teal-300" />
        <span className="label-caps flex-1">detected media</span>
        <span className="font-mono text-xs text-slate-400">{formatCount(candidates.length)}</span>
        <IconButton label="閉じる" icon={<X className="h-3.5 w-3.5" />} onClick={onClose} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {candidates.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-slate-400">
            まだ何も見つかっていません。動画を再生すると、読み込まれたファイルがここに並びます。
          </p>
        ) : (
          candidates.map((candidate) => {
            const isStream = candidate.kind === 'hls'
            const blocked = isStream && !ffmpegAvailable
            return (
              <div
                key={candidate.id}
                className="mb-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs',
                      isStream ? 'bg-emerald-500/10 text-emerald-300' : 'bg-teal-500/10 text-teal-300',
                    )}
                  >
                    {isStream ? <Radio className="h-3 w-3" /> : <Film className="h-3 w-3" />}
                    {isStream ? 'ストリーム' : 'ファイル'}
                  </span>
                  <span className="flex-1 truncate font-mono text-xs text-slate-400">
                    {candidate.mimeType ?? '種類不明'}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-slate-400">{formatSize(candidate.sizeBytes)}</span>
                </div>

                <p className="mt-1.5 break-all font-mono text-xs text-slate-300" title={candidate.url}>
                  {truncateUrl(candidate.url, 96)}
                </p>

                <div className="mt-2 flex items-center justify-between gap-2">
                  {blocked ? (
                    <span className="text-xs text-amber-300">ffmpeg が必要です</span>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                      {isStream ? '結合して mp4 で保存' : '直接保存'}
                    </span>
                  )}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      size="sm"
                      icon={<PenLine className="h-3.5 w-3.5" />}
                      disabled={blocked}
                      onClick={() => onSave({ ...candidate, pageUrl }, true)}
                    >
                      名前を付けて
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Download className="h-3.5 w-3.5" />}
                      disabled={blocked}
                      onClick={() => onSave({ ...candidate, pageUrl }, false)}
                    >
                      保存
                    </Button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
