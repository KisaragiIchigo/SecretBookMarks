import { useCallback, useEffect, useRef, useState } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ChevronLeft, ChevronRight, Loader2, Plus, X } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/cn'
import type { BrowserTab } from '@/state/BrowserProvider'

const SCROLL_STEP = 220

export interface TabStripProps {
  tabs: BrowserTab[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onCloseBeside: (id: string, side: 'left' | 'right') => void
  onCloseOthers: (id: string) => void
  onCloseAll: () => void
  onNewTab: () => void
}

const MENU_ITEM =
  'flex cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-slate-300 outline-none ' +
  'data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-slate-100 data-[disabled]:opacity-40'

export function TabStrip({
  tabs,
  activeId,
  onSelect,
  onClose,
  onCloseBeside,
  onCloseOthers,
  onCloseAll,
  onNewTab,
}: TabStripProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })

  /** 端まで来たら送りボタンを隠すため、はみ出し具合を測る。 */
  const measure = useCallback(() => {
    const element = scroller.current
    if (!element) return
    const max = element.scrollWidth - element.clientWidth
    setOverflow({
      left: element.scrollLeft > 1,
      right: element.scrollLeft < max - 1,
    })
  }, [])

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    element.addEventListener('scroll', measure, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', measure)
    }
  }, [measure, tabs.length])

  // 選んだタブが隠れていたら見える位置まで送る。
  useEffect(() => {
    if (!activeId) return
    const element = scroller.current?.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [activeId])

  const scrollBy = (delta: number) => {
    scroller.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-white/[0.06] bg-white/[0.02] px-2">
      {overflow.left ? (
        <IconButton
          label="左のタブへ送る"
          icon={<ChevronLeft className="h-4 w-4" />}
          onClick={() => scrollBy(-SCROLL_STEP)}
        />
      ) : null}

      {/* スクロールバーは出さず、両端の送りボタンで動かす */}
      <div ref={scroller} className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <ContextMenu.Root key={tab.id}>
            <ContextMenu.Trigger asChild>
              <button
                type="button"
                data-tab-id={tab.id}
                onClick={() => onSelect(tab.id)}
                onAuxClick={(event) => {
                  // 中クリックで閉じる（一般的なブラウザに合わせる）
                  if (event.button === 1) {
                    event.preventDefault()
                    onClose(tab.id)
                  }
                }}
                className={cn(
                  'group flex h-7 min-w-0 max-w-[13rem] shrink-0 items-center gap-2 rounded-md px-2.5 text-xs transition-colors',
                  tab.id === activeId ? 'bg-teal-500/10 text-teal-100' : 'text-slate-400 hover:bg-white/[0.04]',
                )}
              >
                {tab.loading ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : null}
                <span className="truncate">{tab.title || '新しいタブ'}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="タブを閉じる"
                  onClick={(event) => {
                    event.stopPropagation()
                    onClose(tab.id)
                  }}
                  className="shrink-0 text-slate-500 opacity-0 transition-opacity hover:text-rose-300 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </span>
              </button>
            </ContextMenu.Trigger>

            <ContextMenu.Portal>
              <ContextMenu.Content className="surface-panel z-[60] min-w-[13rem] rounded-lg bg-ink-850/95 p-1 shadow-panel animate-fade-in">
                <ContextMenu.Item className={MENU_ITEM} onSelect={() => onClose(tab.id)}>
                  このタブを閉じる
                </ContextMenu.Item>
                <ContextMenu.Separator className="my-1 h-px bg-white/[0.06]" />
                <ContextMenu.Item
                  className={MENU_ITEM}
                  disabled={tabs[tabs.length - 1]?.id === tab.id}
                  onSelect={() => onCloseBeside(tab.id, 'right')}
                >
                  右側のタブを閉じる
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={MENU_ITEM}
                  disabled={tabs[0]?.id === tab.id}
                  onSelect={() => onCloseBeside(tab.id, 'left')}
                >
                  左側のタブを閉じる
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={MENU_ITEM}
                  disabled={tabs.length < 2}
                  onSelect={() => onCloseOthers(tab.id)}
                >
                  他のタブを閉じる
                </ContextMenu.Item>
                <ContextMenu.Separator className="my-1 h-px bg-white/[0.06]" />
                <ContextMenu.Item
                  className={cn(MENU_ITEM, 'text-rose-300 data-[highlighted]:bg-rose-500/10')}
                  onSelect={onCloseAll}
                >
                  全部のタブを閉じる
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        ))}
      </div>

      {overflow.right ? (
        <IconButton
          label="右のタブへ送る"
          icon={<ChevronRight className="h-4 w-4" />}
          onClick={() => scrollBy(SCROLL_STEP)}
        />
      ) : null}

      <IconButton label="新しいタブ" icon={<Plus className="h-3.5 w-3.5" />} onClick={onNewTab} />
    </div>
  )
}
