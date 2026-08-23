import { z } from 'zod'
import { IPC } from '@shared/ipc'
import type { VaultSnapshot, VaultStatus } from '@shared/types'
import { enqueueMissingFavicons } from '../metadata/faviconQueue'
import { loadSettings } from '../settings'
import { collapsedGroups, listBookmarks, pruneTrash } from '../vault/repository'
import { session } from '../vault/session'
import { register, registerVoid } from './register'
import { changePasswordSchema, passwordSchema } from './schemas'

export function buildSnapshot(): VaultSnapshot {
  const settings = loadSettings()
  pruneTrash(settings.trashRetentionDays)
  const model = session.getModel()

  if (settings.fetchFavicons) {
    const seen = new Set<string>()
    const targets: string[] = []
    for (const bookmark of model.bookmarks) {
      if (bookmark.deletedAt !== null || seen.has(bookmark.domain)) continue
      seen.add(bookmark.domain)
      targets.push(bookmark.url)
    }
    enqueueMissingFavicons(targets)
  }

  return { bookmarks: listBookmarks(), favicons: model.favicons, settings, collapsedGroups: collapsedGroups() }
}

export function registerVaultHandlers(): void {
  registerVoid<VaultStatus>(
    IPC.vaultStatus,
    () => ({ exists: session.exists, unlocked: session.isUnlocked, vaultPath: session.path }),
    { requireUnlock: false },
  )

  register(
    IPC.vaultCreate,
    passwordSchema.extend({ password: z.string().min(8).max(1024) }),
    ({ password }): VaultSnapshot => {
      session.create(password)
      session.setAutoLockMinutes(loadSettings().autoLockMinutes)
      return buildSnapshot()
    },
    { requireUnlock: false },
  )

  register(
    IPC.vaultUnlock,
    passwordSchema,
    ({ password }): VaultSnapshot => {
      session.unlock(password)
      session.setAutoLockMinutes(loadSettings().autoLockMinutes)
      return buildSnapshot()
    },
    { requireUnlock: false },
  )

  registerVoid(IPC.vaultLock, () => {
    session.lock('manual')
    return true
  })

  register(IPC.vaultChangePassword, changePasswordSchema, ({ current, next }) => {
    session.changePassword(current, next)
    return true
  })

  registerVoid(
    IPC.vaultActivity,
    () => {
      session.touch()
      return true
    },
    { requireUnlock: false },
  )
}
