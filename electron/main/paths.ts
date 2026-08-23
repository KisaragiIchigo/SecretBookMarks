import { app } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DATA_FOLDER_NAME = 'SecretBookMarks-data'
const PORTABLE_MARKER = 'portable.txt'
const CHROMIUM_FOLDER_NAME = 'chromium-cache'

let cachedDataDir: string | null = null
let cachedPortable: boolean | null = null

/**
 * ポータブル運用の基準フォルダ。
 * electron-builder の portable ターゲットは、展開先ではなく「元の exe が置かれたフォルダ」を
 * PORTABLE_EXECUTABLE_DIR で渡してくる。インストーラー版でも exe の隣に portable.txt を置けば
 * 同じ扱いにする（USB へ持ち出す運用のため）。
 */
function portableBaseDir(): string | null {
  const fromBuilder = process.env.PORTABLE_EXECUTABLE_DIR
  if (fromBuilder && existsSync(fromBuilder)) return fromBuilder
  if (!app.isPackaged) return null
  const exeDir = dirname(app.getPath('exe'))
  return existsSync(join(exeDir, PORTABLE_MARKER)) ? exeDir : null
}

/** ヴォールト・設定・バックアップを置く、アプリ専用のデータフォルダ。 */
export function dataDir(): string {
  if (cachedDataDir) return cachedDataDir
  const base = portableBaseDir()
  cachedPortable = base !== null
  cachedDataDir = base ? join(base, DATA_FOLDER_NAME) : join(app.getPath('appData'), 'SecretBookMarks')
  mkdirSync(cachedDataDir, { recursive: true })
  return cachedDataDir
}

export function isPortable(): boolean {
  if (cachedPortable === null) dataDir()
  return cachedPortable === true
}

/**
 * Chromium のキャッシュ類の置き場所。
 * 既定の userData をそのまま使うとヴォールトと同じ階層に GPUCache や Local Storage が散らばるため、
 * サブフォルダへ隔離する。app の ready より前に呼ぶこと。
 */
export function redirectChromiumData(): void {
  const target = join(dataDir(), CHROMIUM_FOLDER_NAME)
  mkdirSync(target, { recursive: true })
  app.setPath('userData', target)
  app.setPath('sessionData', target)
}

export function vaultFilePath(): string {
  return join(dataDir(), 'vault.sbm')
}

export function settingsFilePath(): string {
  return join(dataDir(), 'settings.json')
}

export function backupsDir(): string {
  const dir = join(dataDir(), 'backups')
  mkdirSync(dir, { recursive: true })
  return dir
}
