import { copyFileSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { backupsDir, vaultFilePath } from '../paths'

const BACKUP_KEEP = 8
const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000

export function vaultPath(): string {
  return vaultFilePath()
}

export function vaultExists(): boolean {
  return existsSync(vaultPath())
}

export function readVaultFile(): Buffer {
  return readFileSync(vaultPath())
}

/** 一時ファイルへ書いてから rename する。書き込み途中の電源断でも旧ファイルを壊さない。 */
export function writeVaultFile(data: Buffer): void {
  const target = vaultPath()
  const tmp = `${target}.tmp`
  writeFileSync(tmp, data, { mode: 0o600 })
  renameSync(tmp, target)
}

/** 直近のバックアップから一定時間が経っていれば世代を1つ残し、古いものを間引く。 */
export function rotateBackup(): void {
  const target = vaultPath()
  if (!existsSync(target)) return
  const dir = backupsDir()
  const existing = readdirSync(dir)
    .filter((name) => name.startsWith('vault-') && name.endsWith('.sbm'))
    .map((name) => ({ name, mtime: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)

  const newest = existing[0]
  if (newest && Date.now() - newest.mtime < BACKUP_INTERVAL_MS) return

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '')
  copyFileSync(target, join(dir, `vault-${stamp}.sbm`))

  for (const old of existing.slice(BACKUP_KEEP - 1)) {
    rmSync(join(dir, old.name), { force: true })
  }
}
