import { app, clipboard, shell } from 'electron'
import { existsSync } from 'node:fs'
import { IPC } from '@shared/ipc'
import type { AppSettings } from '@shared/types'
import { clipboardWatcher } from '../clipboard/watcher'
import { dataDir, isPortable } from '../paths'
import { loadSettings, saveSettings, settingsPatchSchema } from '../settings'
import { session } from '../vault/session'
import { getMainWindow } from '../window'
import { register, registerVoid } from './register'
import { copyTextSchema, openExternalSchema } from './schemas'

export function registerSystemHandlers(): void {
  registerVoid<AppSettings>(IPC.settingsGet, () => loadSettings(), { requireUnlock: false })

  register(
    IPC.settingsSet,
    settingsPatchSchema,
    (patch): AppSettings => {
      const next = saveSettings(patch)
      session.setAutoLockMinutes(next.autoLockMinutes)
      clipboardWatcher.setEnabled(next.clipboardWatch)
      return next
    },
    { requireUnlock: false },
  )

  register(
    IPC.systemOpenExternal,
    openExternalSchema,
    async ({ url }) => {
      await shell.openExternal(url)
      return true
    },
    { requireUnlock: false },
  )

  register(
    IPC.systemCopyText,
    copyTextSchema,
    ({ text }) => {
      clipboard.writeText(text)
      // 自分でコピーした URL を取り込みダイアログとして跳ね返さない。
      clipboardWatcher.ignoreOnce(text)
      return true
    },
    { requireUnlock: false },
  )

  registerVoid(
    IPC.systemRevealVault,
    () => {
      // ヴォールト未作成でもフォルダーは開けるようにする。
      if (existsSync(session.path)) shell.showItemInFolder(session.path)
      else void shell.openPath(dataDir())
      return true
    },
    { requireUnlock: false },
  )

  registerVoid(
    IPC.systemAppInfo,
    () => ({
      version: app.getVersion(),
      electron: process.versions.electron,
      vaultPath: session.path,
      dataDir: dataDir(),
      portable: isPortable(),
    }),
    { requireUnlock: false },
  )

  registerVoid(
    IPC.windowMinimize,
    () => {
      getMainWindow()?.minimize()
      return true
    },
    { requireUnlock: false },
  )

  registerVoid(
    IPC.windowToggleMaximize,
    () => {
      const window = getMainWindow()
      if (!window) return false
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
      return window.isMaximized()
    },
    { requireUnlock: false },
  )

  registerVoid(
    IPC.windowClose,
    () => {
      getMainWindow()?.close()
      return true
    },
    { requireUnlock: false },
  )
}
