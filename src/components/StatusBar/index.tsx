import { ClipboardCheck, ClipboardX, HardDriveDownload, Lock, TriangleAlert } from 'lucide-react'
import type { AppSettings, SaveState } from '@shared/types'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'

export interface StatusBarProps {
  visibleCount: number
  totalCount: number
  selectedCount: number
  settings: AppSettings
  saveState: SaveState
}

export function StatusBar({ visibleCount, totalCount, selectedCount, settings, saveState }: StatusBarProps) {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-white/[0.06] bg-white/[0.02] px-3 font-mono text-xs text-slate-400">
      <span>
        表示 {formatCount(visibleCount)} / 全 {formatCount(totalCount)}
      </span>
      {selectedCount > 0 ? <span className="text-teal-300">選択 {formatCount(selectedCount)}</span> : null}

      <span className="flex-1" />

      <span className="flex items-center gap-1.5">
        {settings.clipboardWatch ? (
          <>
            <ClipboardCheck className="h-3.5 w-3.5 text-teal-300" />
            クリップボード監視中
          </>
        ) : (
          <>
            <ClipboardX className="h-3.5 w-3.5" />
            監視オフ
          </>
        )}
      </span>

      <span className="flex items-center gap-1.5">
        <Lock className="h-3.5 w-3.5" />
        {settings.autoLockMinutes > 0 ? `自動ロック ${settings.autoLockMinutes}分` : '自動ロックなし'}
      </span>

      <span
        className={cn(
          'flex items-center gap-1.5',
          saveState.status === 'error' && 'text-rose-300',
          saveState.status === 'saving' && 'text-teal-300',
        )}
        title={saveState.message ?? undefined}
      >
        {saveState.status === 'error' ? (
          <TriangleAlert className="h-3.5 w-3.5" />
        ) : (
          <HardDriveDownload className="h-3.5 w-3.5" />
        )}
        {saveState.status === 'saving'
          ? '保存中'
          : saveState.status === 'error'
            ? '保存に失敗'
            : saveState.lastSavedAt
              ? '保存済み'
              : '待機中'}
      </span>
    </footer>
  )
}
