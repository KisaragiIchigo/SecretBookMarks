import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { DownloadTask, MediaCandidate } from '@shared/types'
import { useVault } from './VaultProvider'

export interface BrowserTab {
  id: string
  /** webview に最初に読ませる URL。以後の遷移は url 側で追う */
  initialUrl: string
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  contentsId: number | null
}

interface BrowserContextValue {
  tabs: BrowserTab[]
  activeId: string | null
  active: BrowserTab | null
  downloads: DownloadTask[]
  activeDownloadCount: number
  mediaFor: (contentsId: number | null) => MediaCandidate[]
  /** 右クリックメニューから「検出済みの動画を表示」が押された回数。パネルを開く合図に使う */
  revealSignal: number
  openTab: (url: string, activate?: boolean) => void
  closeTab: (id: string) => void
  /** 指定タブより右／左をまとめて閉じる */
  closeTabsBeside: (id: string, side: 'left' | 'right') => void
  closeOtherTabs: (id: string) => void
  closeAllTabs: () => void
  /** Ctrl+Tab などで隣のタブへ移る。端まで行ったら反対側へ回る */
  cycleTab: (direction: 'next' | 'previous') => void
  selectTab: (id: string) => void
  patchTab: (id: string, patch: Partial<BrowserTab>) => void
  refreshDownloads: () => Promise<void>
}

const BrowserContext = createContext<BrowserContextValue | null>(null)

let tabCounter = 0
const nextTabId = () => `tab-${(tabCounter += 1)}`

export function useBrowser(): BrowserContextValue {
  const context = useContext(BrowserContext)
  if (!context) throw new Error('BrowserProvider の外側で useBrowser は使えません。')
  return context
}

export function BrowserProvider({ children }: { children: ReactNode }) {
  const { phase, settings } = useVault()
  const [tabs, setTabs] = useState<BrowserTab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [downloads, setDownloads] = useState<DownloadTask[]>([])
  const [mediaByContents, setMediaByContents] = useState<Record<number, MediaCandidate[]>>({})
  const [revealSignal, setRevealSignal] = useState(0)

  const openTab = useCallback((url: string, activate = true) => {
    const tab: BrowserTab = {
      id: nextTabId(),
      initialUrl: url,
      url,
      title: url,
      loading: true,
      canGoBack: false,
      canGoForward: false,
      contentsId: null,
    }
    setTabs((current) => [...current, tab])
    // 背面で開く場合でも、まだ1枚も無いときは表示するタブが必要。
    setActiveId((current) => (activate || current === null ? tab.id : current))
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs((current) => {
      const next = current.filter((tab) => tab.id !== id)
      setActiveId((active) => (active === id ? (next[next.length - 1]?.id ?? null) : active))
      return next
    })
  }, [])

  const closeTabsBeside = useCallback((id: string, side: 'left' | 'right') => {
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === id)
      if (index === -1) return current
      const next = side === 'right' ? current.slice(0, index + 1) : current.slice(index)
      setActiveId((active) => (next.some((tab) => tab.id === active) ? active : id))
      return next
    })
  }, [])

  const closeOtherTabs = useCallback((id: string) => {
    setTabs((current) => {
      const kept = current.filter((tab) => tab.id === id)
      if (kept.length === 0) return current
      setActiveId(id)
      return kept
    })
  }, [])

  const closeAllTabs = useCallback(() => {
    setTabs([])
    setActiveId(null)
  }, [])

  const cycleTab = useCallback((direction: 'next' | 'previous') => {
    setTabs((current) => {
      if (current.length < 2) return current
      setActiveId((active) => {
        const index = current.findIndex((tab) => tab.id === active)
        if (index === -1) return current[0].id
        const step = direction === 'next' ? 1 : -1
        // 端まで行ったら反対側へ回る
        const nextIndex = (index + step + current.length) % current.length
        return current[nextIndex].id
      })
      return current
    })
  }, [])

  const patchTab = useCallback((id: string, patch: Partial<BrowserTab>) => {
    setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)))
  }, [])

  const refreshDownloads = useCallback(async () => {
    setDownloads(await window.sbm.downloads.list())
  }, [])

  // 解錠したら履歴を読み、施錠したら画面から消す。
  useEffect(() => {
    if (phase !== 'unlocked') {
      setDownloads([])
      setTabs([])
      setActiveId(null)
      setMediaByContents({})
      return
    }
    void refreshDownloads()
  }, [phase, refreshDownloads])

  useEffect(() => {
    const unsubscribers = [
      window.sbm.events.onMediaDetected(({ contentsId, candidates, reveal }) => {
        setMediaByContents((current) => ({ ...current, [contentsId]: candidates }))
        if (reveal) setRevealSignal((value) => value + 1)
      }),
      window.sbm.events.onDownloadChanged((task) => {
        setDownloads((current) => {
          const index = current.findIndex((entry) => entry.id === task.id)
          if (index === -1) return [task, ...current]
          const next = [...current]
          next[index] = task
          return next
        })
      }),
      window.sbm.events.onBrowserOpenUrl(({ url, active }) => openTab(url, active)),
    ]
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [openTab])

  const mediaFor = useCallback(
    (contentsId: number | null) => (contentsId === null ? [] : (mediaByContents[contentsId] ?? [])),
    [mediaByContents],
  )

  const active = useMemo(() => tabs.find((tab) => tab.id === activeId) ?? null, [activeId, tabs])
  const activeDownloadCount = useMemo(
    () => downloads.filter((task) => task.status === 'running' || task.status === 'queued').length,
    [downloads],
  )

  // ブラウザを初めて開いたときにホームを1枚だけ用意する。
  const ensureHome = useCallback(() => {
    if (tabs.length === 0) openTab(settings?.browserHomeUrl ?? 'https://duckduckgo.com/')
  }, [openTab, settings, tabs.length])

  const value = useMemo<BrowserContextValue>(
    () => ({
      tabs,
      activeId,
      active,
      downloads,
      activeDownloadCount,
      mediaFor,
      revealSignal,
      openTab: (url: string, activate = true) => (url ? openTab(url, activate) : ensureHome()),
      closeTab,
      closeTabsBeside,
      closeOtherTabs,
      closeAllTabs,
      cycleTab,
      selectTab: setActiveId,
      patchTab,
      refreshDownloads,
    }),
    [
      tabs,
      activeId,
      active,
      downloads,
      activeDownloadCount,
      mediaFor,
      revealSignal,
      openTab,
      ensureHome,
      closeTab,
      closeTabsBeside,
      closeOtherTabs,
      closeAllTabs,
      cycleTab,
      patchTab,
      refreshDownloads,
    ],
  )

  return <BrowserContext.Provider value={value}>{children}</BrowserContext.Provider>
}
