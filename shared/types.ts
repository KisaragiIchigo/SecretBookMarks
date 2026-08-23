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
