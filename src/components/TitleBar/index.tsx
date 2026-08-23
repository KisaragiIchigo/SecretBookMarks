import { useEffect, useState } from 'react'
import { Lock, Minus, Settings, Square, X } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/cn'

export interface TitleBarProps {
  unlocked: boolean
  onLock: () => void
  onOpenSettings: () => void
}

export function TitleBar({ unlocked, onLock, onOpenSettings }: TitleBarProps) {
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

      <div className="flex-1" />

      <div className="no-drag flex items-center gap-0.5">
        {unlocked ? (
          <>
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
