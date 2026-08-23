import { dialog, webContents } from 'electron'
import { IPC } from '@shared/ipc'
import type { AdblockStatusView, AppSettings, DownloadTask, FilterListInfo, MediaCandidate } from '@shared/types'
import {
  FILTER_LISTS,
  adblockStatus,
  normalizeAllowlistEntry,
  refreshAllowlist,
  setAdblockEnabled,
  setUserBlocklist,
  updateFilters,
} from '../browser/adblock'
import { clearBrowserData } from '../browser/session'
import { clearMediaFor, mediaCandidates } from '../browser/mediaSniffer'
import { scanPageMedia } from '../browser/domScanner'
import { resolvePageMeta, resolvePageTitle } from '../browser/pageTitle'
import { enqueueFavicon } from '../metadata/faviconQueue'
import { downloads } from '../download/manager'
import { ffmpegStatus } from '../download/ffmpeg'
import { loadSettings, saveSettings } from '../settings'
import { getMainWindow } from '../window'
import { register, registerVoid } from './register'
import {
  adblockToggleSchema,
  allowlistSchema,
  allowlistToggleSchema,
  contentsIdSchema,
  downloadIdSchema,
  navigateSchema,
  startDownloadSchema,
} from './schemas'

export function registerBrowserHandlers(): void {
  register(IPC.browserMediaList, contentsIdSchema, ({ contentsId }): MediaCandidate[] =>
    mediaCandidates(contentsId),
  )

  /**
   * 履歴の操作は Main 側の webContents を直接触る。
   * Renderer の状態（canGoBack 等）を経由すると、同期の取りこぼしがそのまま
   * 「ボタンが効かない」に化けるため、判断も実行も権威ある側で行う。
   */
  register(IPC.browserNavigate, navigateSchema, ({ contentsId, direction }) => {
    const contents = webContents.fromId(contentsId)
    if (!contents || contents.isDestroyed()) return false
    const history = contents.navigationHistory
    if (direction === 'back') {
      if (!history.canGoBack()) return false
      history.goBack()
    } else if (direction === 'forward') {
      if (!history.canGoForward()) return false
      history.goForward()
    } else if (direction === 'reload') {
      contents.reload()
    } else {
      contents.stop()
    }
    return true
  })

  // 開いているページからタイトルとタグ候補を読む。取り直しでは通れない壁があるため。
  register(IPC.browserPageMeta, contentsIdSchema, async ({ contentsId }) => {
    const meta = await resolvePageMeta(contentsId)
    // この経路では HTML を取り直さないため、ファビコンは別途取りに行く。
    const contents = webContents.fromId(contentsId)
    if (contents && !contents.isDestroyed() && loadSettings().fetchFavicons) {
      enqueueFavicon(contents.getURL())
    }
    return meta
  })

  register(IPC.browserScanPage, contentsIdSchema, ({ contentsId }): Promise<MediaCandidate[]> =>
    scanPageMedia(contentsId),
  )

  register(IPC.browserMediaClear, contentsIdSchema, ({ contentsId }) => {
    clearMediaFor(contentsId)
    return true
  })

  registerVoid(IPC.browserClearData, async () => {
    await clearBrowserData()
    return true
  })

  registerVoid<AdblockStatusView>(IPC.adblockStatus, () => adblockStatus(), { requireUnlock: false })
  registerVoid<FilterListInfo[]>(IPC.adblockLists, () => FILTER_LISTS, { requireUnlock: false })
  registerVoid<AdblockStatusView>(IPC.adblockUpdate, () => updateFilters(), { requireUnlock: false })

  register(
    IPC.adblockAllowlist,
    allowlistSchema,
    ({ entries }): string[] => {
      const cleaned = [...new Set(entries.map(normalizeAllowlistEntry).filter(Boolean))]
      saveSettings({ adBlockAllowlist: cleaned })
      refreshAllowlist()
      return cleaned
    },
    { requireUnlock: false },
  )

  register(
    IPC.adblockUserBlocklist,
    allowlistSchema,
    ({ entries }): string[] => setUserBlocklist(entries),
    { requireUnlock: false },
  )

  /** 表示中のサイトを除外リストに出し入れする。 */
  register(
    IPC.adblockToggleSite,
    allowlistToggleSchema,
    ({ site }): { allowlist: string[]; allowed: boolean } => {
      const host = normalizeAllowlistEntry(site)
      if (!host) return { allowlist: loadSettings().adBlockAllowlist, allowed: false }
      const current = loadSettings().adBlockAllowlist
      const allowed = current.includes(host)
      const next = allowed ? current.filter((entry) => entry !== host) : [...current, host]
      saveSettings({ adBlockAllowlist: next })
      refreshAllowlist()
      return { allowlist: next, allowed: !allowed }
    },
    { requireUnlock: false },
  )
  register(
    IPC.adblockSetEnabled,
    adblockToggleSchema,
    ({ enabled }): AdblockStatusView => {
      saveSettings({ adBlockEnabled: enabled })
      return setAdblockEnabled(enabled)
    },
    { requireUnlock: false },
  )

  register(IPC.downloadStart, startDownloadSchema, async (input): Promise<DownloadTask | null> => {
    // タイトルは Main 側で解決する。document.title にはサイト名が混ざるため、
    // 見出しや og:title を見て動画そのものの名前を選ぶ。
    const pageTitle =
      input.contentsId === undefined ? input.pageTitle : await resolvePageTitle(input.contentsId)
    return downloads.start({ ...input, pageTitle: pageTitle || input.pageTitle })
  })

  register(IPC.downloadCancel, downloadIdSchema, ({ id }) => {
    downloads.cancel(id)
    return true
  })

  register(IPC.downloadReveal, downloadIdSchema, ({ id }) => {
    downloads.reveal(id)
    return true
  })

  registerVoid<DownloadTask[]>(IPC.downloadList, () => downloads.list())
  registerVoid(IPC.downloadClearHistory, () => downloads.clearHistory())

  registerVoid(IPC.downloadFfmpegStatus, () => ffmpegStatus(), { requireUnlock: false })

  registerVoid<AppSettings | null>(IPC.downloadChooseDir, async () => {
    const window = getMainWindow()
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      title: '保存先のフォルダーを選ぶ',
      defaultPath: downloads.downloadDir(),
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return saveSettings({ downloadDir: result.filePaths[0] })
  })
}
