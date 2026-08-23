/** Main / Renderer で共有するドメイン型。IPC の境界を越える値はここに集約する。 */

export interface LinkStatus {
  /** HTTP ステータス。到達できなかった場合は null */
  code: number | null
  checkedAt: number
}

export interface Bookmark {
  id: string
  /** 開くときに使う URL（ユーザー入力を尊重した実URL） */
  url: string
  /** 重複判定用の正規化 URL */
  normalizedUrl: string
  title: string
  domain: string
  /** ツリーの束ね単位。既定はドメインだが手動で変更できる */
  group: string
  tags: string[]
  note: string
  favorite: boolean
  createdAt: number
  updatedAt: number
  lastOpenedAt: number | null
  openCount: number
  /** ゴミ箱に入れた時刻。null なら通常状態 */
  deletedAt: number | null
  linkStatus: LinkStatus | null
}

/** ドメイン単位で共有するファビコン（data URL）。ブックマーク数に比例させない */
export type FaviconMap = Record<string, string>

export interface VaultModel {
  version: number
  bookmarks: Bookmark[]
  favicons: FaviconMap
  /** 内蔵ブラウザの Cookie。平文でディスクに残さないためヴォールト内へ入れる */
  cookies: StoredCookie[]
  /** ダウンロード履歴（完了・失敗したものだけ。実行中は主記憶のみ） */
  downloads: DownloadTask[]
}

/** Electron の Cookie を復元できる最小限の形に落としたもの */
export interface StoredCookie {
  url: string
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expirationDate?: number
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
}

export type SortMode =
  | 'added-desc'
  | 'added-asc'
  | 'title-asc'
  | 'title-desc'
  | 'opened-desc'
  | 'opencount-desc'
  | 'updated-desc'

export type ViewMode = 'grouped' | 'flat'

export interface AppSettings {
  window: { x: number | null; y: number | null; width: number; height: number; maximized: boolean }
  /** クリップボードの URL を検知して取り込みダイアログを出す */
  clipboardWatch: boolean
  /** 0 で自動ロック無効 */
  autoLockMinutes: number
  /** 取り込み時にページタイトルを取得する */
  fetchTitles: boolean
  /** ドメインのファビコンを取得してヴォールト内にキャッシュする */
  fetchFavicons: boolean
  /** ページから抽出したキーワードを、確認なしでタグとして付ける */
  autoTagFromPage: boolean
  /** 内蔵ブラウザの Cookie をヴォールトへ暗号化保存する */
  saveBrowserCookies: boolean
  browserHomeUrl: string
  /** null なら OS の既定のダウンロードフォルダー */
  downloadDir: string | null
  /** null なら同梱の ffmpeg を使う */
  ffmpegPath: string | null
  /** 閉じるボタンでタスクトレイに常駐させる */
  minimizeToTray: boolean
  sortMode: SortMode
  viewMode: ViewMode
  /** ゴミ箱の自動完全削除までの日数。0 で自動削除しない */
  trashRetentionDays: number
}

export interface VaultStatus {
  exists: boolean
  unlocked: boolean
  vaultPath: string
}

/** unlock / create の成功時に Renderer へ一括で渡す初期ペイロード */
export interface VaultSnapshot {
  bookmarks: Bookmark[]
  favicons: FaviconMap
  settings: AppSettings
}

export interface BookmarkInput {
  url: string
  title: string
  tags: string[]
  note: string
  group: string | null
  favorite: boolean
}

/** 部分更新のペイロード。group は null を許さない（空文字ならドメインへ戻す） */
export type BookmarkPatchInput = Partial<{
  url: string
  title: string
  tags: string[]
  note: string
  group: string
  favorite: boolean
}>

export type DuplicateResolution = 'ask' | 'merge' | 'overwrite' | 'skip'

export type CreateResult =
  | { status: 'created'; bookmark: Bookmark }
  | { status: 'merged' | 'overwritten'; bookmark: Bookmark }
  | { status: 'skipped'; existing: Bookmark }
  | { status: 'duplicate'; existing: Bookmark }

export type BulkTagMode = 'add' | 'remove' | 'replace'

export interface ImportSummary {
  fileName: string
  imported: number
  merged: number
  skipped: number
}

export type ExportFormat = 'json' | 'html' | 'csv'

export interface ExportSummary {
  filePath: string
  count: number
}

export interface SaveState {
  status: 'idle' | 'saving' | 'error'
  lastSavedAt: number | null
  message: string | null
}

// ===== 内蔵ブラウザ =====

/** ページの読み込み中に見つかった保存候補 */
export interface MediaCandidate {
  id: string
  url: string
  /** file: 直接落とせるファイル / hls: .m3u8 で ffmpeg による結合が必要 */
  kind: 'file' | 'hls'
  mimeType: string | null
  sizeBytes: number | null
  pageUrl: string
  pageTitle: string
  detectedAt: number
}

export type DownloadStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled'

export interface DownloadTask {
  id: string
  url: string
  kind: 'file' | 'hls'
  fileName: string
  savePath: string
  status: DownloadStatus
  receivedBytes: number
  totalBytes: number
  /** 0〜1。総量が不明なときは null */
  progress: number | null
  error: string | null
  startedAt: number
  finishedAt: number | null
  pageUrl: string
}

export interface BrowserPageState {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}
