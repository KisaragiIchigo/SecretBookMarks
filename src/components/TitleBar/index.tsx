import { useEffect, useState } from 'react'
import { m } from 'framer-motion'
import { Compass, Download, Library, Lock, Minus, Settings, Square, X } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'

export type AppMode = 'library' | 'browser'

export interface TitleBarProps {
  unlocked: boolean
  mode: AppMode
  onModeChange: (mode: AppMode) => void
  downloadCount: number
  onOpenDownloads: () => void
  onLock: () => void
  onOpenSettings: () => void
}

const MODES: { id: AppMode; label: string; icon: typeof Library }[] = [
  { id: 'library', label: 'ライブラリ', icon: Library },
  { id: 'browser', label: 'ブラウザ', icon: Compass },
]

export function TitleBar({
  unlocked,
  mode,
  onModeChange,
  downloadCount,
  onOpenDownloads,
  onLock,
  onOpenSettings,
}: TitleBarProps) {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => window.sbm.events.onMaximizeChanged(setMaximized), [])

  return (
    <header className="drag-region flex h-9 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-white/[0.02] px-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'grid h-4 w-4 place-items-center rounded-[5px] transition-colors',
            unlocked ? 'bg-teal-500/15 text-teal-300 shadow-glow' : 'bg-white/[0.06] text-slate-400',
          )}
        >
          <Lock className="h-2.5 w-2.5" />
        </span>
        <span className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-slate-300">
          Secret<span className="text-teal-300">Bookmarks</span>
        </span>
      </div>

      {unlocked ? (
        <div className="no-drag ml-2 flex items-center gap-0.5 rounded-lg bg-black/30 p-0.5">
          {MODES.map((entry) => {
            const Icon = entry.icon
            const current = mode === entry.id
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => onModeChange(entry.id)}
                className={cn(
                  'relative inline-flex h-6 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors',
                  current ? 'text-teal-100' : 'text-slate-400 hover:text-slate-200',
                )}
              >
                {current ? (
                  <m.span
                    layoutId="mode-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-md bg-teal-500/15 shadow-glow"
                  />
                ) : null}
                <Icon className="relative h-3.5 w-3.5" />
                <span className="relative">{entry.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="flex-1" />

      <div className="no-drag flex items-center gap-0.5">
        {unlocked ? (
          <>
            <button
              type="button"
              onClick={onOpenDownloads}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors',
                downloadCount > 0
                  ? 'bg-teal-500/10 text-teal-300 shadow-glow'
                  : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200',
              )}
            >
              <Download className="h-3.5 w-3.5" />
              {downloadCount > 0 ? formatCount(downloadCount) : 'DL'}
            </button>
            <IconButton label="ヴォールトをロック (Ctrl+L)" icon={<Lock className="h-3.5 w-3.5" />} onClick={onLock} />
            <IconButton label="設定" icon={<Settings className="h-3.5 w-3.5" />} onClick={onOpenSettings} />
            <span className="mx-1 h-4 w-px bg-white/[0.06]" />
          </>
        ) : null}
        <IconButton
          label="最小化"
          icon={<Minus className="h-3.5 w-3.5" />}
          onClick={() => void window.sbm.window.minimize()}
        />
        <IconButton
          label={maximized ? '元のサイズに戻す' : '最大化'}
          icon={<Square className="h-3 w-3" />}
          onClick={() => void window.sbm.window.toggleMaximize()}
        />
        <IconButton
          label="閉じる"
          tone="danger"
          icon={<X className="h-3.5 w-3.5" />}
          onClick={() => void window.sbm.window.close()}
        />
      </div>
    </header>
  )
}
