import { EventEmitter } from 'node:events'
import { hkdfSync } from 'node:crypto'
import type { SaveState, VaultModel } from '@shared/types'
import { DEFAULT_KDF, createSalt, deriveKey, open, seal, WrongPasswordError } from './crypto'
import { readVaultFile, rotateBackup, vaultExists, vaultPath, writeVaultFile } from './file'

const MODEL_VERSION = 2
const SAVE_DEBOUNCE_MS = 400
const LOCK_CHECK_MS = 15_000

interface UnlockedState {
  key: Buffer
  salt: Buffer
  model: VaultModel
}

function emptyModel(): VaultModel {
  return { version: MODEL_VERSION, bookmarks: [], favicons: {}, cookies: [], downloads: [], credentials: [], collapsedGroups: [] }
}

/**
 * 復号済みモデルとマスター鍵をメモリ内だけで保持する。
 * 変更は markDirty() でデバウンス保存し、ロック時に鍵とモデルを破棄する。
 */
class VaultSession extends EventEmitter {
  private state: UnlockedState | null = null
  private saveTimer: NodeJS.Timeout | null = null
  private lockTimer: NodeJS.Timeout | null = null
  private lastActivity = Date.now()
  private autoLockMinutes = 0
  private saveState: SaveState = { status: 'idle', lastSavedAt: null, message: null }

  get isUnlocked(): boolean {
    return this.state !== null
  }

  get path(): string {
    return vaultPath()
  }

  get exists(): boolean {
    return vaultExists()
  }

  getSaveState(): SaveState {
    return this.saveState
  }

  /**
   * 用途ごとの副鍵をマスター鍵から導出する。
   * パスワードのように、解錠中でも平文で持ち歩きたくない値の暗号化に使う。
   * 副鍵は保存しない（毎回導出する）ため、ヴォールトの外に鍵が残らない。
   */
  deriveSubkey(info: string): Buffer {
    if (!this.state) throw new Error('ヴォールトがロックされています。')
    return Buffer.from(hkdfSync('sha256', this.state.key, this.state.salt, Buffer.from(info, 'utf8'), 32))
  }

  getModel(): VaultModel {
    if (!this.state) throw new Error('ヴォールトがロックされています。')
    return this.state.model
  }

  create(password: string): VaultModel {
    if (vaultExists()) throw new Error('ヴォールトは既に存在します。')
    const salt = createSalt()
    const key = deriveKey(password, salt, DEFAULT_KDF)
    this.state = { key, salt, model: emptyModel() }
    this.saveNow()
    this.startLockTimer()
    this.emit('unlocked')
    return this.state.model
  }

  unlock(password: string): VaultModel {
    const opened = open(readVaultFile(), password)
    const parsed = JSON.parse(opened.plaintext) as VaultModel
    const model: VaultModel = {
      version: MODEL_VERSION,
      bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
      favicons: parsed.favicons ?? {},
      cookies: Array.isArray(parsed.cookies) ? parsed.cookies : [],
      downloads: Array.isArray(parsed.downloads) ? parsed.downloads : [],
      credentials: Array.isArray(parsed.credentials) ? parsed.credentials : [],
      collapsedGroups: Array.isArray(parsed.collapsedGroups) ? parsed.collapsedGroups : [],
    }
    this.state = { key: opened.key, salt: opened.salt, model }
    this.touch()
    this.startLockTimer()
    this.emit('unlocked')
    return model
  }

  changePassword(current: string, next: string): void {
    if (!this.state) throw new Error('ヴォールトがロックされています。')
    // 現行パスワードの正当性はファイルの復号で確認する（メモリ上の鍵とは独立に検証）。
    try {
      open(readVaultFile(), current)
    } catch {
      throw new WrongPasswordError()
    }
    const salt = createSalt()
    this.state.key = deriveKey(next, salt, DEFAULT_KDF)
    this.state.salt = salt
    this.saveNow()
  }

  lock(reason: 'manual' | 'idle' | 'quit'): void {
    if (!this.state) return
    this.flush()
    this.state.key.fill(0)
    this.state = null
    if (this.lockTimer) {
      clearInterval(this.lockTimer)
      this.lockTimer = null
    }
    this.emit('locked', reason)
  }

  setAutoLockMinutes(minutes: number): void {
    this.autoLockMinutes = Math.max(0, minutes)
    this.touch()
  }

  touch(): void {
    this.lastActivity = Date.now()
  }

  markDirty(): void {
    if (!this.state) return
    this.touch()
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.saveNow(), SAVE_DEBOUNCE_MS)
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (this.state) this.saveNow()
  }

  private saveNow(): void {
    if (!this.state) return
    this.setSaveState({ status: 'saving', lastSavedAt: this.saveState.lastSavedAt, message: null })
    try {
      rotateBackup()
      const payload = JSON.stringify(this.state.model)
      writeVaultFile(seal(payload, this.state.key, this.state.salt, DEFAULT_KDF))
      this.setSaveState({ status: 'idle', lastSavedAt: Date.now(), message: null })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setSaveState({ status: 'error', lastSavedAt: this.saveState.lastSavedAt, message })
    }
  }

  private setSaveState(next: SaveState): void {
    this.saveState = next
    this.emit('save-state', next)
  }

  private startLockTimer(): void {
    if (this.lockTimer) clearInterval(this.lockTimer)
    this.lockTimer = setInterval(() => {
      if (this.autoLockMinutes <= 0 || !this.state) return
      if (Date.now() - this.lastActivity >= this.autoLockMinutes * 60_000) this.lock('idle')
    }, LOCK_CHECK_MS)
  }
}

export const session = new VaultSession()
