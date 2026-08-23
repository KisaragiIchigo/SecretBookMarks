/** IPC チャンネル名の単一情報源。Main / Preload の双方がここだけを参照する。 */

export const IPC = {
  vaultStatus: 'vault:status',
  vaultCreate: 'vault:create',
  vaultUnlock: 'vault:unlock',
  vaultLock: 'vault:lock',
  vaultChangePassword: 'vault:change-password',
  vaultActivity: 'vault:activity',

  bookmarksList: 'bookmarks:list',
  bookmarksCreate: 'bookmarks:create',
  bookmarksUpdate: 'bookmarks:update',
  bookmarksTrash: 'bookmarks:trash',
  bookmarksRestore: 'bookmarks:restore',
  bookmarksPurge: 'bookmarks:purge',
  bookmarksBulkTags: 'bookmarks:bulk-tags',
  bookmarksSetFavorite: 'bookmarks:set-favorite',
  bookmarksSetGroup: 'bookmarks:set-group',
  bookmarksOpen: 'bookmarks:open',
  bookmarksCheckLinks: 'bookmarks:check-links',
  bookmarksRenameTag: 'bookmarks:rename-tag',

  metaFetchPage: 'meta:fetch-page',

  ioImport: 'io:import',
  ioExport: 'io:export',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',

  systemOpenExternal: 'system:open-external',
  systemCopyText: 'system:copy-text',
  systemRevealVault: 'system:reveal-vault',
  systemAppInfo: 'system:app-info',

  browserMediaList: 'browser:media-list',
  browserMediaClear: 'browser:media-clear',
  browserScanPage: 'browser:scan-page',
  browserNavigate: 'browser:navigate',
  browserClearData: 'browser:clear-data',
  adblockStatus: 'adblock:status',
  adblockSetEnabled: 'adblock:set-enabled',
  adblockUpdate: 'adblock:update',
  adblockLists: 'adblock:lists',

  downloadStart: 'download:start',
  downloadCancel: 'download:cancel',
  downloadList: 'download:list',
  downloadClearHistory: 'download:clear-history',
  downloadReveal: 'download:reveal',
  downloadChooseDir: 'download:choose-dir',
  downloadFfmpegStatus: 'download:ffmpeg-status',

  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
} as const

/**
 * IPC ハンドラの戻り値。例外を Renderer 側でメッセージとして扱えるようにする。
 * ok:false は「操作の失敗」であって通信の失敗ではない。
 */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** Main → Renderer の一方向イベント */
export const IPC_EVENT = {
  clipboardUrl: 'event:clipboard-url',
  locked: 'event:locked',
  quickAdd: 'event:quick-add',
  faviconUpdated: 'event:favicon-updated',
  bookmarksChanged: 'event:bookmarks-changed',
  saveState: 'event:save-state',
  maximizeChanged: 'event:maximize-changed',
  mediaDetected: 'event:media-detected',
  downloadChanged: 'event:download-changed',
  browserOpenUrl: 'event:browser-open-url',
  browserCapturePage: 'event:browser-capture-page',
  browserNavigate: 'event:browser-navigate',
} as const
