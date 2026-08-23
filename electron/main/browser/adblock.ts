import { ElectronBlocker } from '@ghostery/adblocker-electron'
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir } from '../paths'
import { loadSettings } from '../settings'
import { browserSession } from './session'

/**
 * 購読するフィルターリスト。URL は uBlock Origin の assets.json に載っている
 * 正規の配布元をそのまま使う（自前で推測した URL は 404 になりやすいため）。
 */
export const FILTER_LISTS: { id: string; title: string; url: string }[] = [
  { id: 'easylist', title: 'EasyList', url: 'https://ublockorigin.github.io/uAssets/thirdparties/easylist.txt' },
  {
    id: 'easyprivacy',
    title: 'EasyPrivacy',
    url: 'https://ublockorigin.github.io/uAssets/thirdparties/easyprivacy.txt',
  },
  {
    id: 'plowe',
    title: 'Peter Lowe – Ads, trackers, and more',
    url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext',
  },
  {
    id: 'ublock-filters',
    title: 'uBlock filters – Ads, trackers, and more',
    url: 'https://ublockorigin.github.io/uAssets/filters/filters.txt',
  },
  {
    id: 'ublock-badware',
    title: 'uBlock filters – Badware risks',
    url: 'https://ublockorigin.github.io/uAssets/filters/badware.txt',
  },
  {
    id: 'urlhaus',
    title: 'Malicious URL Blocklist',
    url: 'https://malware-filter.gitlab.io/urlhaus-filter/urlhaus-filter-ag-online.txt',
  },
  {
    id: 'lan-block',
    title: 'Block Outsider Intrusion into LAN',
    url: 'https://ublockorigin.github.io/uAssets/filters/lan-block.txt',
  },
  {
    id: 'easylist-ai',
    title: 'EasyList – AI Widgets',
    url: 'https://ublockorigin.github.io/uAssets/thirdparties/easylist-ai.txt',
  },
  {
    id: 'adguard-japanese',
    title: 'jp: AdGuard Japanese',
    url: 'https://filters.adtidy.org/extension/ublock/filters/7.txt',
  },
]

const CACHE_FILE = 'adblock-cache.bin'
const REFRESH_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000

export interface AdblockStatus {
  enabled: boolean
  ready: boolean
  updatedAt: number | null
  listCount: number
  updating: boolean
  /** 要素の非表示（cosmetic filtering）が使えているか */
  cosmetics: boolean
}

let blocker: ElectronBlocker | null = null
let updatedAt: number | null = null
let updating = false
let enabled = true

function cachePath(): string {
  return join(dataDir(), CACHE_FILE)
}

export function adblockStatus(): AdblockStatus {
  return {
    enabled,
    ready: blocker !== null,
    updatedAt,
    listCount: FILTER_LISTS.length,
    updating,
    cosmetics: !cosmeticsDisabled,
  }
}

let cosmeticsDisabled = false

function attach(): void {
  if (!blocker) return
  const ses = browserSession()
  if (!enabled) {
    try {
      blocker.disableBlockingInSession(ses)
    } catch {
      // 有効化されていなければ何もしなくてよい。
    }
    return
  }
  try {
    blocker.enableBlockingInSession(ses)
  } catch (error) {
    // 要素を隠す機能は Electron 側の API に依存する。使えない環境では
    // 通信のブロックだけに切り替えて動かし続ける。
    cosmeticsDisabled = true
    console.warn('[adblock] 要素の非表示を無効化して続行します:', (error as Error).message)
    void rebuildWithoutCosmetics()
  }
}

async function rebuildWithoutCosmetics(): Promise<void> {
  try {
    blocker = await ElectronBlocker.fromLists(
      fetch,
      FILTER_LISTS.map((list) => list.url),
      { enableCompression: true, loadCosmeticFilters: false },
    )
    blocker.enableBlockingInSession(browserSession())
    saveToCache()
  } catch {
    blocker = null
  }
}

function loadFromCache(): boolean {
  const path = cachePath()
  if (!existsSync(path)) return false
  try {
    blocker = ElectronBlocker.deserialize(new Uint8Array(readFileSync(path)))
    updatedAt = statSync(path).mtimeMs
    return true
  } catch {
    // 形式が変わっている場合はキャッシュを捨てて取り直す。
    return false
  }
}

function saveToCache(): void {
  try {
    if (!blocker) return
    const path = cachePath()
    const tmp = `${path}.tmp`
    writeFileSync(tmp, Buffer.from(blocker.serialize()))
    renameSync(tmp, path)
    updatedAt = Date.now()
  } catch {
    // キャッシュに失敗しても動作自体は続けられる。
  }
}

/** フィルターを取得し直す。ネットワークが無い場合は既存のものを維持する。 */
export async function updateFilters(): Promise<AdblockStatus> {
  if (updating) return adblockStatus()
  updating = true
  try {
    const fresh = await ElectronBlocker.fromLists(
      fetch,
      FILTER_LISTS.map((list) => list.url),
      { enableCompression: true },
    )
    blocker = fresh
    saveToCache()
    attach()
  } catch {
    // 取得に失敗したら、キャッシュ済みのフィルターをそのまま使い続ける。
  } finally {
    updating = false
  }
  return adblockStatus()
}

export function setAdblockEnabled(next: boolean): AdblockStatus {
  enabled = next
  attach()
  return adblockStatus()
}

/**
 * 起動時の初期化。
 * キャッシュがあれば即座に有効化し、古ければ裏で取り直す。
 * 初回だけはフィルターの取得が終わるまで広告が通るが、起動を待たせない方を優先する。
 */
export async function initAdblock(): Promise<void> {
  enabled = loadSettings().adBlockEnabled
  const cached = loadFromCache()
  if (cached) {
    attach()
    const age = updatedAt === null ? Infinity : Date.now() - updatedAt
    if (age > REFRESH_INTERVAL_MS) void updateFilters()
    return
  }
  await updateFilters()
}
