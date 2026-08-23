import { contextBridge, ipcRenderer } from 'electron'
import { IPC, IPC_EVENT, type IpcResult } from '@shared/ipc'
import type {
  AdblockStatusView,
  AppSettings,
  Bookmark,
  BookmarkInput,
  BookmarkPatchInput,
  BulkTagMode,
  CreateResult,
  DuplicateResolution,
  ExportFormat,
  ExportSummary,
  CredentialCapture,
  CredentialSummary,
  DownloadTask,
  FilterListInfo,
  ImportSummary,
  LinkStatus,
  MediaCandidate,
  SaveState,
  VaultSnapshot,
  VaultStatus,
} from '@shared/types'

/** IPC の Result を剥がし、失敗はそのまま例外へ変換する。 */
async function call<T>(channel: string, payload?: unknown): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, payload)) as IpcResult<T>
  if (!result.ok) throw new Error(result.error)
  return result.data
}

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: unknown, payload: T) => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

const api = {
  vault: {
    status: () => call<VaultStatus>(IPC.vaultStatus),
    create: (password: string) => call<VaultSnapshot>(IPC.vaultCreate, { password }),
    unlock: (password: string) => call<VaultSnapshot>(IPC.vaultUnlock, { password }),
    lock: () => call<boolean>(IPC.vaultLock),
    changePassword: (current: string, next: string) =>
      call<boolean>(IPC.vaultChangePassword, { current, next }),
    reportActivity: () => call<boolean>(IPC.vaultActivity),
  },
  bookmarks: {
    list: () => call<Bookmark[]>(IPC.bookmarksList),
    create: (input: BookmarkInput, resolution: DuplicateResolution) =>
      call<CreateResult>(IPC.bookmarksCreate, { input, resolution }),
    update: (id: string, patch: BookmarkPatchInput) => call<Bookmark>(IPC.bookmarksUpdate, { id, patch }),
    trash: (ids: string[]) => call<number>(IPC.bookmarksTrash, ids),
    restore: (ids: string[]) => call<number>(IPC.bookmarksRestore, ids),
    purge: (ids: string[] | 'trash') => call<number>(IPC.bookmarksPurge, { ids }),
    bulkTags: (ids: string[], mode: BulkTagMode, tags: string[]) =>
      call<number>(IPC.bookmarksBulkTags, { ids, mode, tags }),
    setFavorite: (ids: string[], favorite: boolean) => call<number>(IPC.bookmarksSetFavorite, { ids, favorite }),
    setGroup: (ids: string[], group: string) => call<number>(IPC.bookmarksSetGroup, { ids, group }),
    renameTag: (from: string, to: string) => call<number>(IPC.bookmarksRenameTag, { from, to }),
    setCollapsedGroups: (keys: string[]) => call<string[]>(IPC.bookmarksSetCollapsed, { keys }),
    open: (id: string, external = false) => call<Bookmark | null>(IPC.bookmarksOpen, { id, external }),
    checkLinks: (ids: string[]) =>
      call<{ id: string; linkStatus: LinkStatus | null }[]>(IPC.bookmarksCheckLinks, { ids }),
  },
  meta: {
    fetchPage: (url: string) =>
      call<{
        title: string | null
        favicon: { domain: string; dataUrl: string } | null
        keywords: string[]
      }>(IPC.metaFetchPage, { url }),
  },
  io: {
    importFile: () => call<ImportSummary | null>(IPC.ioImport),
    exportFile: (format: ExportFormat, includeTrashed: boolean) =>
      call<ExportSummary | null>(IPC.ioExport, { format, includeTrashed }),
  },
  browser: {
    mediaList: (contentsId: number) => call<MediaCandidate[]>(IPC.browserMediaList, { contentsId }),
    mediaClear: (contentsId: number) => call<boolean>(IPC.browserMediaClear, { contentsId }),
    scanPage: (contentsId: number) => call<MediaCandidate[]>(IPC.browserScanPage, { contentsId }),
    pageMeta: (contentsId: number) =>
      call<{ title: string; keywords: string[] }>(IPC.browserPageMeta, { contentsId }),
    navigate: (contentsId: number, direction: 'back' | 'forward' | 'reload' | 'stop') =>
      call<boolean>(IPC.browserNavigate, { contentsId, direction }),
    clearData: () => call<boolean>(IPC.browserClearData),
  },
  adblock: {
    status: () => call<AdblockStatusView>(IPC.adblockStatus),
    lists: () => call<FilterListInfo[]>(IPC.adblockLists),
    update: () => call<AdblockStatusView>(IPC.adblockUpdate),
    setEnabled: (enabled: boolean) => call<AdblockStatusView>(IPC.adblockSetEnabled, { enabled }),
  },
  downloads: {
    start: (input: {
      url: string
      kind: 'file' | 'hls'
      pageUrl: string
      fileName?: string
      pageTitle?: string
      contentsId?: number
      saveAs?: boolean
    }) => call<DownloadTask | null>(IPC.downloadStart, input),
    cancel: (id: string) => call<boolean>(IPC.downloadCancel, { id }),
    reveal: (id: string) => call<boolean>(IPC.downloadReveal, { id }),
    list: () => call<DownloadTask[]>(IPC.downloadList),
    clearHistory: () => call<number>(IPC.downloadClearHistory),
    chooseDir: () => call<AppSettings | null>(IPC.downloadChooseDir),
    ffmpegStatus: () => call<{ available: boolean; path: string | null }>(IPC.downloadFfmpegStatus),
  },
  credentials: {
    list: () => call<CredentialSummary[]>(IPC.credentialList),
    forOrigin: (origin: string) => call<CredentialSummary[]>(IPC.credentialForOrigin, { origin }),
    save: (origin: string, username: string, password: string) =>
      call<CredentialSummary>(IPC.credentialSave, { origin, username, password }),
    remove: (id: string) => call<boolean>(IPC.credentialDelete, { id }),
    /** 利用者が明示的に表示を求めたときだけ使う */
    reveal: (id: string) => call<{ username: string; password: string } | null>(IPC.credentialReveal, { id }),
    fill: (contentsId: number, id: string) => call<boolean>(IPC.credentialFill, { contentsId, id }),
  },
  settings: {
    get: () => call<AppSettings>(IPC.settingsGet),
    set: (patch: Partial<AppSettings>) => call<AppSettings>(IPC.settingsSet, patch),
  },
  system: {
    openExternal: (url: string) => call<boolean>(IPC.systemOpenExternal, { url }),
    copyText: (text: string) => call<boolean>(IPC.systemCopyText, { text }),
    revealVault: () => call<boolean>(IPC.systemRevealVault),
    appInfo: () =>
      call<{ version: string; electron: string; vaultPath: string; dataDir: string; portable: boolean }>(
        IPC.systemAppInfo,
      ),
  },
  window: {
    minimize: () => call<boolean>(IPC.windowMinimize),
    toggleMaximize: () => call<boolean>(IPC.windowToggleMaximize),
    close: () => call<boolean>(IPC.windowClose),
  },
  events: {
    onClipboardUrl: (listener: (url: string) => void) => subscribe(IPC_EVENT.clipboardUrl, listener),
    onLocked: (listener: (reason: string) => void) => subscribe(IPC_EVENT.locked, listener),
    onQuickAdd: (listener: () => void) => subscribe(IPC_EVENT.quickAdd, listener),
    onFaviconUpdated: (listener: (payload: { domain: string; dataUrl: string }) => void) =>
      subscribe(IPC_EVENT.faviconUpdated, listener),
    onSaveState: (listener: (state: SaveState) => void) => subscribe(IPC_EVENT.saveState, listener),
    onMaximizeChanged: (listener: (maximized: boolean) => void) =>
      subscribe(IPC_EVENT.maximizeChanged, listener),
    onMediaDetected: (
      listener: (payload: { contentsId: number; candidates: MediaCandidate[]; reveal?: boolean }) => void,
    ) => subscribe(IPC_EVENT.mediaDetected, listener),
    onDownloadChanged: (listener: (task: DownloadTask) => void) => subscribe(IPC_EVENT.downloadChanged, listener),
    onBrowserOpenUrl: (listener: (payload: { url: string; active: boolean }) => void) =>
      subscribe(IPC_EVENT.browserOpenUrl, listener),
    onBrowserCapturePage: (
      listener: (payload: { url: string; title: string; contentsId: number | null }) => void,
    ) =>
      subscribe(IPC_EVENT.browserCapturePage, listener),
    onBrowserNavigate: (listener: (direction: 'back' | 'forward') => void) =>
      subscribe(IPC_EVENT.browserNavigate, listener),
    onCredentialCaptured: (listener: (capture: CredentialCapture) => void) =>
      subscribe(IPC_EVENT.credentialCaptured, listener),
  },
}

export type SbmApi = typeof api

contextBridge.exposeInMainWorld('sbm', api)
