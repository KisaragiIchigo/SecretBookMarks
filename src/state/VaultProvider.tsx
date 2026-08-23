import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppSettings,
  Bookmark,
  BookmarkInput,
  BookmarkPatchInput,
  BulkTagMode,
  CreateResult,
  DuplicateResolution,
  FaviconMap,
  SaveState,
  VaultSnapshot,
} from '@shared/types'

export type VaultPhase = 'loading' | 'setup' | 'locked' | 'unlocked'

interface VaultContextValue {
  phase: VaultPhase
  bookmarks: Bookmark[]
  favicons: FaviconMap
  settings: AppSettings | null
  saveState: SaveState
  collapsedGroups: string[]
  setCollapsedGroups: (keys: string[]) => void
  vaultPath: string
  lockReason: string | null
  createVault: (password: string) => Promise<void>
  unlock: (password: string) => Promise<void>
  lock: () => Promise<void>
  refresh: () => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  actions: {
    create: (input: BookmarkInput, resolution: DuplicateResolution) => Promise<CreateResult>
    update: (id: string, patch: BookmarkPatchInput) => Promise<void>
    trash: (ids: string[]) => Promise<number>
    restore: (ids: string[]) => Promise<number>
    purge: (ids: string[] | 'trash') => Promise<number>
    bulkTags: (ids: string[], mode: BulkTagMode, tags: string[]) => Promise<number>
    setFavorite: (ids: string[], favorite: boolean) => Promise<number>
    setGroup: (ids: string[], group: string) => Promise<number>
    renameTag: (from: string, to: string) => Promise<number>
    open: (id: string, external?: boolean) => Promise<void>
    checkLinks: (ids: string[]) => Promise<number>
  }
}

const VaultContext = createContext<VaultContextValue | null>(null)

const IDLE_PING_MS = 30_000

export function useVault(): VaultContextValue {
  const context = useContext(VaultContext)
  if (!context) throw new Error('VaultProvider の外側で useVault は使えません。')
  return context
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<VaultPhase>('loading')
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [favicons, setFavicons] = useState<FaviconMap>({})
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle', lastSavedAt: null, message: null })
  const [collapsedGroups, setCollapsedGroupsState] = useState<string[]>([])
  const [vaultPath, setVaultPath] = useState('')
  const [lockReason, setLockReason] = useState<string | null>(null)
  const lastPingRef = useRef(0)

  const applySnapshot = useCallback((snapshot: VaultSnapshot) => {
    setBookmarks(snapshot.bookmarks)
    setFavicons(snapshot.favicons)
    setSettings(snapshot.settings)
    setCollapsedGroupsState(snapshot.collapsedGroups ?? [])
    setLockReason(null)
    setPhase('unlocked')
  }, [])

  const refresh = useCallback(async () => {
    setBookmarks(await window.sbm.bookmarks.list())
  }, [])

  useEffect(() => {
    void (async () => {
      const status = await window.sbm.vault.status()
      setVaultPath(status.vaultPath)
      setSettings(await window.sbm.settings.get())
      setPhase(status.exists ? 'locked' : 'setup')
    })()
  }, [])

  useEffect(() => {
    const unsubscribers = [
      window.sbm.events.onLocked((reason) => {
        setBookmarks([])
        setFavicons({})
        setCollapsedGroupsState([])
        setLockReason(reason)
        setPhase('locked')
      }),
      window.sbm.events.onFaviconUpdated(({ domain, dataUrl }) => {
        setFavicons((current) => ({ ...current, [domain]: dataUrl }))
      }),
      window.sbm.events.onSaveState(setSaveState),
    ]
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [])

  // 自動ロックの猶予は Main が管理するため、Renderer は操作があったことだけを間引いて伝える。
  useEffect(() => {
    if (phase !== 'unlocked') return
    const ping = () => {
      const now = Date.now()
      if (now - lastPingRef.current < IDLE_PING_MS) return
      lastPingRef.current = now
      void window.sbm.vault.reportActivity()
    }
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel']
    events.forEach((event) => window.addEventListener(event, ping, { passive: true }))
    return () => events.forEach((event) => window.removeEventListener(event, ping))
  }, [phase])

  const createVault = useCallback(
    async (password: string) => {
      applySnapshot(await window.sbm.vault.create(password))
    },
    [applySnapshot],
  )

  const unlock = useCallback(
    async (password: string) => {
      applySnapshot(await window.sbm.vault.unlock(password))
    },
    [applySnapshot],
  )

  // たたみ状態はヴォールト側に持つ（グループ名がドメインそのものなので平文に置かない）。
  const setCollapsedGroups = useCallback((keys: string[]) => {
    setCollapsedGroupsState(keys)
    void window.sbm.bookmarks.setCollapsedGroups(keys)
  }, [])

  const lock = useCallback(async () => {
    await window.sbm.vault.lock()
  }, [])

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings(await window.sbm.settings.set(patch))
  }, [])

  const actions = useMemo<VaultContextValue['actions']>(
    () => ({
      create: async (input, resolution) => {
        const result = await window.sbm.bookmarks.create(input, resolution)
        if (result.status !== 'duplicate') await refresh()
        return result
      },
      update: async (id, patch) => {
        await window.sbm.bookmarks.update(id, patch)
        await refresh()
      },
      trash: async (ids) => {
        const count = await window.sbm.bookmarks.trash(ids)
        await refresh()
        return count
      },
      restore: async (ids) => {
        const count = await window.sbm.bookmarks.restore(ids)
        await refresh()
        return count
      },
      purge: async (ids) => {
        const count = await window.sbm.bookmarks.purge(ids)
        await refresh()
        return count
      },
      bulkTags: async (ids, mode, tags) => {
        const count = await window.sbm.bookmarks.bulkTags(ids, mode, tags)
        await refresh()
        return count
      },
      setFavorite: async (ids, favorite) => {
        const count = await window.sbm.bookmarks.setFavorite(ids, favorite)
        await refresh()
        return count
      },
      setGroup: async (ids, group) => {
        const count = await window.sbm.bookmarks.setGroup(ids, group)
        await refresh()
        return count
      },
      renameTag: async (from, to) => {
        const count = await window.sbm.bookmarks.renameTag(from, to)
        await refresh()
        return count
      },
      open: async (id, external = false) => {
        await window.sbm.bookmarks.open(id, external)
        await refresh()
      },
      checkLinks: async (ids) => {
        const results = await window.sbm.bookmarks.checkLinks(ids)
        await refresh()
        return results.filter((r) => r.linkStatus === null || (r.linkStatus.code ?? 500) >= 400).length
      },
    }),
    [refresh],
  )

  const value = useMemo<VaultContextValue>(
    () => ({
      phase,
      bookmarks,
      favicons,
      settings,
      saveState,
      collapsedGroups,
      setCollapsedGroups,
      vaultPath,
      lockReason,
      createVault,
      unlock,
      lock,
      refresh,
      updateSettings,
      actions,
    }),
    [
      phase,
      bookmarks,
      favicons,
      settings,
      saveState,
      collapsedGroups,
      setCollapsedGroups,
      vaultPath,
      lockReason,
      createVault,
      unlock,
      lock,
      refresh,
      updateSettings,
      actions,
    ],
  )

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}
