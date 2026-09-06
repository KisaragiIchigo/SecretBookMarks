import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Film,
  FolderDown,
  Home,
  KeyRound,
  Loader2,
  RotateCw,
  Shield,
  ShieldOff,
  X,
} from 'lucide-react'
import type { AlbumBundle, AlbumMediaItem, CredentialCapture, MediaCandidate } from '@shared/types'
import { isAlbumUrl } from '@shared/url'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'
import { useBrowser } from '@/state/BrowserProvider'
import type { WebviewElement } from '@/types/global'
import { MediaPanel } from './MediaPanel'
import { TabStrip } from './TabStrip'
import { WebviewHost } from './WebviewHost'

export interface BrowserProps {
  visible: boolean
  homeUrl: string
  onBookmarkPage: (url: string, title: string, contentsId: number | null) => void
  /** 自動検知が働かない画面から、手動でログイン情報を保存するとき */
  onCaptureLogin: (capture: CredentialCapture) => void
}

/** 入力欄の文字列を URL か検索語かに振り分ける。 */
function toNavigationUrl(input: string): string {
  const value = input.trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  if (/^[\w-]+(\.[\w-]+)+(\/|$|:\d)/.test(value) && !/\s/.test(value)) return `https://${value}`
  return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`
}

export function Browser({ visible, homeUrl, onBookmarkPage, onCaptureLogin }: BrowserProps) {
  const {
    tabs,
    active,
    activeId,
    openTab,
    closeTab,
    closeTabsBeside,
    closeOtherTabs,
    closeAllTabs,
    cycleTab,
    selectTab,
    patchTab,
    mediaFor,
    albumFor,
    albumProgress,
    revealSignal,
  } = useBrowser()
  const views = useRef(new Map<string, WebviewElement>())
  const [draftUrl, setDraftUrl] = useState('')
  const [editing, setEditing] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [ffmpegAvailable, setFfmpegAvailable] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [credentialCount, setCredentialCount] = useState(0)
  const [adblockAllowed, setAdblockAllowed] = useState(false)

  const candidates = mediaFor(active?.contentsId ?? null)
  const album = albumFor(active?.contentsId ?? null)
  const isAlbumPage = isAlbumUrl(active?.url)

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

  // アルバムが検出されたら、保存パネルを自動で開いて気付けるようにする。
  const lastAlbumRef = useRef<string | null>(null)
  useEffect(() => {
    if (album && album.pageUrl !== lastAlbumRef.current) {
      lastAlbumRef.current = album.pageUrl
      setPanelOpen(true)
    }
  }, [album])

  // ブラウザ画面を初めて開いたときにホームを1枚用意する。
  useEffect(() => {
    if (visible && tabs.length === 0) openTab(homeUrl)
  }, [homeUrl, openTab, tabs.length, visible])

  const registerView = useCallback((id: string, element: WebviewElement | null) => {
    if (element) views.current.set(id, element)
    else views.current.delete(id)
  }, [])

  // ナビゲーションは再描画に左右されないよう ref 経由で最新のタブを見る。
  const activeIdRef = useRef<string | null>(activeId)
  const activeContentsIdRef = useRef<number | null>(active?.contentsId ?? null)
  useEffect(() => {
    activeIdRef.current = activeId
    activeContentsIdRef.current = active?.contentsId ?? null
  }, [activeId, active?.contentsId])

  const activeView = activeId ? views.current.get(activeId) : undefined

  /**
   * 履歴の操作は Main 側へ委ねる。
   * Renderer が持つ canGoBack は同期の取りこぼしでずれることがあり、
   * それをボタンの有効・無効に使うと「押せない」形で表面化するため。
   */
  const navigateHistory = useCallback(
    (direction: 'back' | 'forward' | 'reload' | 'stop') => {
      // webview の要素を直接操作する。contentsId は dom-ready まで確定しないため、
      // それに依存すると読み込み中に操作できない時間ができてしまう。
      const view = activeIdRef.current ? views.current.get(activeIdRef.current) : undefined
      if (view) {
        if (direction === 'back') view.goBack()
        else if (direction === 'forward') view.goForward()
        else if (direction === 'reload') view.reload()
        else view.stop()
        return
      }
      // 要素を掴めない場合の保険として Main 側からも試す。
      const contentsId = activeContentsIdRef.current
      if (contentsId !== null) void window.sbm.browser.navigate(contentsId, direction)
    },
    [],
  )

  // Ctrl+Tab / Ctrl+Shift+Tab。ページ側にフォーカスがあっても Main が拾って届く。
  useEffect(() => window.sbm.events.onBrowserCycleTab((direction) => cycleTab(direction)), [cycleTab])

  // マウスのサイドボタン。Main から届いた方向をそのまま流す。
  useEffect(
    () => window.sbm.events.onBrowserNavigate((direction) => navigateHistory(direction)),
    [navigateHistory],
  )

  const navigate = (event: FormEvent) => {
    event.preventDefault()
    const url = toNavigationUrl(draftUrl)
    if (!url || !activeView) return
    setEditing(false)
    void activeView.loadURL(url)
  }

  // ページ内の video 要素およびアルバム構造を直接読む。
  const rescan = useCallback(async () => {
    const contentsId = active?.contentsId
    if (contentsId === undefined || contentsId === null) return
    setScanning(true)
    try {
      await Promise.all([
        window.sbm.browser.scanPage(contentsId),
        window.sbm.browser.extractAlbum(contentsId),
      ])
    } finally {
      setScanning(false)
    }
  }, [active?.contentsId])

  // ページの読み込み完了またはアルバムURL検知時に抽出を走らせる
  useEffect(() => {
    const contentsId = active?.contentsId
    if (!contentsId) return

    if (isAlbumUrl(active?.url) || !active?.loading) {
      void window.sbm.browser.extractAlbum(contentsId)
    }
  }, [active?.contentsId, active?.loading, active?.url])

  // 現在のサイトに保存済みのログイン情報があるかを見ておく。
  useEffect(() => {
    if (!active?.url) {
      setCredentialCount(0)
      return
    }
    void window.sbm.credentials
      .forOrigin(active.url)
      .then((list) => setCredentialCount(list.length))
      .catch(() => setCredentialCount(0))
  }, [active?.url])

  // 表示中のサイトが除外リストに入っているかを見ておく。
  useEffect(() => {
    if (!active?.url) {
      setAdblockAllowed(false)
      return
    }
    void window.sbm.settings
      .get()
      .then((settings) => {
        try {
          const host = new URL(active.url).hostname.toLowerCase()
          setAdblockAllowed(settings.adBlockAllowlist.includes(host))
        } catch {
          setAdblockAllowed(false)
        }
      })
      .catch(() => setAdblockAllowed(false))
  }, [active?.url])

  /** 表示中のサイトを広告ブロックの対象から出し入れする。 */
  const toggleAdblockForSite = useCallback(async () => {
    if (!active?.url) return
    const result = await window.sbm.adblock.toggleSite(active.url)
    setAdblockAllowed(result.allowed)
    // ルールの反映には再読み込みが要る
    navigateHistory('reload')
  }, [active?.url, navigateHistory])

  /**
   * 保存済みがあれば入力し、無ければ画面の入力内容を読んで保存を促す。
   * 自動検知が働かないログイン画面のための逃げ道。
   */
  const handleCredentialButton = useCallback(async () => {
    const contentsId = active?.contentsId
    if (!active?.url || contentsId === undefined || contentsId === null) return

    const list = await window.sbm.credentials.forOrigin(active.url)
    if (list.length > 0) {
      await window.sbm.credentials.fill(contentsId, list[0].id)
      return
    }
    const found = await window.sbm.credentials.readForm(contentsId)
    if (found) onCaptureLogin(found)
  }, [active?.contentsId, active?.url, onCaptureLogin])

  // パネルを開いた時点で一度自動で走らせる。
  useEffect(() => {
    if (panelOpen) void rescan()
  }, [panelOpen, rescan])

  const saveMedia = (candidate: MediaCandidate, saveAs: boolean) => {
    void window.sbm.downloads.start({
      url: candidate.url,
      kind: candidate.kind,
      pageUrl: active?.url ?? '',
      pageTitle: active?.title ?? '',
      contentsId: active?.contentsId ?? undefined,
      saveAs,
    })
  }

  const downloadAlbum = useCallback(
    (
      targetAlbum: AlbumBundle,
      title: string,
      saveAs: boolean,
      withIndexPrefix: boolean,
      options?: { concatVideos?: boolean; createSlideshow?: boolean; slideshowDuration?: number },
    ) => {
      const items = targetAlbum.items.map((item) => {
        let fileName = item.fileName
        if (!withIndexPrefix) {
          fileName = fileName.replace(/^\d+_/, '')
        }
        return {
          url: item.url,
          kind: item.kind,
          fileName,
        }
      })

      void window.sbm.downloads.startAlbum({
        albumTitle: title.trim() || targetAlbum.title,
        pageUrl: active?.url ?? targetAlbum.pageUrl,
        items,
        saveAs,
        withIndexPrefix,
        concatVideos: options?.concatVideos,
        createSlideshow: options?.createSlideshow,
        slideshowDuration: options?.slideshowDuration,
      })
    },
    [active?.url],
  )

  const saveAlbumItem = useCallback(
    (item: AlbumMediaItem, saveAs: boolean) => {
      void window.sbm.downloads.start({
        url: item.url,
        kind: 'file',
        pageUrl: active?.url ?? '',
        pageTitle: active?.title ?? '',
        fileName: item.fileName,
        saveAs,
      })
    },
    [active?.title, active?.url],
  )

  /**
   * アルバムの一括保存を即座に開始する。
   * まだDOMの解析（album）が完了していなければ、その場で即座に抽出を試みてから保存する。
   */
  const handleQuickAlbumDownload = useCallback(async () => {
    setPanelOpen(true)
    if (album && album.items.length > 0) {
      downloadAlbum(album, album.title, false, true)
      return
    }
    const contentsId = active?.contentsId
    if (contentsId === undefined || contentsId === null) return
    setScanning(true)
    try {
      const res = await window.sbm.browser.extractAlbum(contentsId)
      if (res && res.items.length > 0) {
        downloadAlbum(res, res.title, false, true)
      }
    } finally {
      setScanning(false)
    }
  }, [active?.contentsId, album, downloadAlbum])

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', visible ? 'flex' : 'hidden')}>
      <TabStrip
        tabs={tabs}
        activeId={activeId}
        onSelect={selectTab}
        onClose={closeTab}
        onCloseBeside={closeTabsBeside}
        onCloseOthers={closeOtherTabs}
        onCloseAll={closeAllTabs}
        onNewTab={() => openTab(homeUrl)}
      />

      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-white/[0.06] px-2">
        <IconButton
          label="戻る"
          icon={<ArrowLeft className={cn('h-4 w-4', !active?.canGoBack && 'opacity-40')} />}
          disabled={!active}
          onClick={() => navigateHistory('back')}
        />
        <IconButton
          label="進む"
          icon={<ArrowRight className={cn('h-4 w-4', !active?.canGoForward && 'opacity-40')} />}
          disabled={!active}
          onClick={() => navigateHistory('forward')}
        />
        <IconButton
          label={active?.loading ? '読み込みを中止' : '再読み込み'}
          icon={active?.loading ? <X className="h-4 w-4" /> : <RotateCw className="h-4 w-4" />}
          disabled={!active}
          onClick={() => navigateHistory(active?.loading ? 'stop' : 'reload')}
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

        {album || isAlbumPage ? (
          <div className="no-drag flex items-center gap-1">
            <Button
              size="sm"
              variant="primary"
              icon={scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderDown className="h-3.5 w-3.5" />}
              onClick={() => void handleQuickAlbumDownload()}
              className="shadow-glow"
              title="アルバム内の全画像・動画を一括ダウンロードします"
            >
              {album ? `一括保存 (${formatCount(album.items.length)})` : scanning ? '解析中...' : 'アルバムを一括保存'}
            </Button>
            <IconButton
              label={panelOpen ? 'パネルを閉じる' : '詳細・保存オプションを開く'}
              icon={<Film className="h-3.5 w-3.5" />}
              active={panelOpen}
              onClick={() => setPanelOpen((open) => !open)}
            />
          </div>
        ) : (
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
        )}

        <IconButton
          label={
            adblockAllowed
              ? 'このサイトで広告ブロックを有効に戻す'
              : 'このサイトだけ広告ブロックを無効にする（ログインできない場合に）'
          }
          icon={adblockAllowed ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
          tone={adblockAllowed ? 'danger' : 'default'}
          disabled={!active}
          onClick={() => void toggleAdblockForSite()}
        />

        <IconButton
          label={
            credentialCount > 0
              ? '保存したログイン情報を入力'
              : '入力中のログイン情報を保存（自動で聞かれなかった場合に）'
          }
          icon={<KeyRound className="h-4 w-4" />}
          tone={credentialCount > 0 ? 'accent' : 'default'}
          disabled={!active}
          onClick={() => void handleCredentialButton()}
        />

        <IconButton
          label="このページをブックマーク"
          icon={<BookmarkPlus className="h-4 w-4" />}
          tone="accent"
          disabled={!active}
          onClick={() => active && onBookmarkPage(active.url, active.title, active.contentsId)}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-ink-950">
          {tabs.map((tab) => (
            <WebviewHost
              key={tab.id}
              tabId={tab.id}
              initialUrl={tab.initialUrl}
              active={tab.id === activeId}
              onPatch={patchTab}
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
            album={album}
            albumProgress={albumProgress}
            pageUrl={active?.url ?? ''}
            ffmpegAvailable={ffmpegAvailable}
            scanning={scanning}
            onClose={() => setPanelOpen(false)}
            onRescan={() => void rescan()}
            onSave={saveMedia}
            onSaveAlbumItem={saveAlbumItem}
            onDownloadAlbum={downloadAlbum}
            onCancelAlbumDownload={(id) => void window.sbm.downloads.cancelAlbum(id)}
            onRevealAlbum={(id) => void window.sbm.downloads.revealAlbum(id)}
          />
        ) : null}
      </div>
    </div>
  )
}
