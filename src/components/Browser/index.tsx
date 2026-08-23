import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Film,
  Home,
  Loader2,
  Plus,
  RotateCw,
  X,
} from 'lucide-react'
import type { MediaCandidate } from '@shared/types'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'
import { useBrowser, type BrowserTab } from '@/state/BrowserProvider'
import type { WebviewElement } from '@/types/global'
import { MediaPanel } from './MediaPanel'
import { WebviewHost } from './WebviewHost'

export interface BrowserProps {
  visible: boolean
  homeUrl: string
  onBookmarkPage: (url: string, title: string) => void
}

/** 入力欄の文字列を URL か検索語かに振り分ける。 */
function toNavigationUrl(input: string): string {
  const value = input.trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  if (/^[\w-]+(\.[\w-]+)+(\/|$|:\d)/.test(value) && !/\s/.test(value)) return `https://${value}`
  return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`
}

export function Browser({ visible, homeUrl, onBookmarkPage }: BrowserProps) {
  const { tabs, active, activeId, openTab, closeTab, selectTab, patchTab, mediaFor, revealSignal } = useBrowser()
  const views = useRef(new Map<string, WebviewElement>())
  const [draftUrl, setDraftUrl] = useState('')
  const [editing, setEditing] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [ffmpegAvailable, setFfmpegAvailable] = useState(true)
  const [scanning, setScanning] = useState(false)

  const candidates = mediaFor(active?.contentsId ?? null)

  useEffect(() => {
    void window.sbm.downloads.ffmpegStatus().then((status) => setFfmpegAvailable(status.available))
  }, [])

  // 入力中はユーザーの文字を優先し、それ以外は実際の URL に追従させる。
  useEffect(() => {
    if (!editing) setDraftUrl(active?.url ?? '')
  }, [active?.url, editing])

  useEffect(() => {
    if (revealSignal > 0) setPanelOpen(true)
  }, [revealSignal])

  // ブラウザ画面を初めて開いたときにホームを1枚用意する。
  useEffect(() => {
    if (visible && tabs.length === 0) openTab(homeUrl)
  }, [homeUrl, openTab, tabs.length, visible])

  const registerView = useCallback((id: string, element: WebviewElement | null) => {
    if (element) views.current.set(id, element)
    else views.current.delete(id)
  }, [])

  const activeView = activeId ? views.current.get(activeId) : undefined

  // マウスのサイドボタン。Main から届いた方向をアクティブなタブへ流す。
  useEffect(() => {
    return window.sbm.events.onBrowserNavigate((direction) => {
      const view = activeId ? views.current.get(activeId) : undefined
      if (!view) return
      if (direction === 'back') view.goBack()
      else view.goForward()
    })
  }, [activeId])

  const navigate = (event: FormEvent) => {
    event.preventDefault()
    const url = toNavigationUrl(draftUrl)
    if (!url || !activeView) return
    setEditing(false)
    void activeView.loadURL(url)
  }

  // ページ内の video 要素を直接読む。通信の監視で取りこぼした URL を拾うための保険。
  const rescan = useCallback(async () => {
    const contentsId = active?.contentsId
    if (contentsId === undefined || contentsId === null) return
    setScanning(true)
    try {
      await window.sbm.browser.scanPage(contentsId)
    } finally {
      setScanning(false)
    }
  }, [active?.contentsId])

  // パネルを開いた時点で一度自動で走らせる。
  useEffect(() => {
    if (panelOpen) void rescan()
  }, [panelOpen, rescan])

  const saveMedia = (candidate: MediaCandidate, saveAs: boolean) => {
    void window.sbm.downloads.start({
      url: candidate.url,
      kind: candidate.kind,
      pageUrl: active?.url ?? '',
      saveAs,
    })
  }

  const patchFor = useCallback(
    (tab: BrowserTab) => (patch: Partial<BrowserTab>) => patchTab(tab.id, patch),
    [patchTab],
  )

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', visible ? 'flex' : 'hidden')}>
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-white/[0.06] bg-white/[0.02] px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
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
                  closeTab(tab.id)
                }}
                className="shrink-0 text-slate-500 opacity-0 transition-opacity hover:text-rose-300 group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          ))}
          <IconButton label="新しいタブ" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openTab(homeUrl)} />
        </div>
      </div>

      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-white/[0.06] px-2">
        <IconButton
          label="戻る"
          icon={<ArrowLeft className="h-4 w-4" />}
          disabled={!active?.canGoBack}
          onClick={() => activeView?.goBack()}
        />
        <IconButton
          label="進む"
          icon={<ArrowRight className="h-4 w-4" />}
          disabled={!active?.canGoForward}
          onClick={() => activeView?.goForward()}
        />
        <IconButton
          label={active?.loading ? '読み込みを中止' : '再読み込み'}
          icon={active?.loading ? <X className="h-4 w-4" /> : <RotateCw className="h-4 w-4" />}
          onClick={() => (active?.loading ? activeView?.stop() : activeView?.reload())}
        />
        <IconButton
          label="ホーム"
          icon={<Home className="h-4 w-4" />}
          onClick={() => void activeView?.loadURL(homeUrl)}
        />

        <form className="min-w-0 flex-1" onSubmit={navigate}>
          <Input
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            placeholder="URL または検索語を入力"
            spellCheck={false}
            className="w-full font-mono"
          />
        </form>

        <button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          className={cn(
            'no-drag inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs transition-colors',
            candidates.length > 0
              ? 'bg-teal-500/10 text-teal-300 shadow-glow hover:bg-teal-500/20'
              : 'text-slate-400 hover:bg-white/[0.06]',
          )}
        >
          <Film className="h-3.5 w-3.5" />
          動画 {formatCount(candidates.length)}
        </button>

        <IconButton
          label="このページをブックマーク"
          icon={<BookmarkPlus className="h-4 w-4" />}
          tone="accent"
          disabled={!active}
          onClick={() => active && onBookmarkPage(active.url, active.title)}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-ink-950">
          {tabs.map((tab) => (
            <WebviewHost
              key={tab.id}
              tab={tab}
              active={tab.id === activeId}
              onPatch={patchFor(tab)}
              onRegister={registerView}
            />
          ))}
          {tabs.length === 0 ? (
            <div className="grid h-full place-items-center">
              <p className="text-sm text-slate-400">タブがありません。＋ で開いてください。</p>
            </div>
          ) : null}
        </div>

        {panelOpen ? (
          <MediaPanel
            candidates={candidates}
            pageUrl={active?.url ?? ''}
            ffmpegAvailable={ffmpegAvailable}
            scanning={scanning}
            onClose={() => setPanelOpen(false)}
            onRescan={() => void rescan()}
            onSave={saveMedia}
          />
        ) : null}
      </div>
    </div>
  )
}
