import { BrowserWindow, app, globalShortcut } from 'electron'
import { IPC_EVENT } from '@shared/ipc'
import { clipboardWatcher } from './clipboard/watcher'
import { registerIpcHandlers } from './ipc'
import { redirectChromiumData } from './paths'
import { loadSettings } from './settings'
import { createTray, destroyTray, refreshTrayMenu } from './tray'
import { session } from './vault/session'
import { createMainWindow, emitToRenderer, getMainWindow } from './window'

const QUICK_ADD_SHORTCUT = 'CommandOrControl+Shift+B'

let isQuitting = false

// Chromium が userData を掴む前に置き場所を移す。ready 後では効かない。
redirectChromiumData()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())
  void bootstrap()
}

function showMainWindow(): void {
  const window = getMainWindow() ?? createMainWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function quitApp(): void {
  isQuitting = true
  app.quit()
}

function attachWindowLifecycle(window: BrowserWindow): void {
  window.on('close', (event) => {
    if (isQuitting || !loadSettings().minimizeToTray) return
    // トレイ常駐が有効なら閉じるボタンでは終了せず、監視だけ続ける。
    event.preventDefault()
    window.hide()
  })
}

async function bootstrap(): Promise<void> {
  await app.whenReady()

  registerIpcHandlers()

  const trayActions = { onShow: showMainWindow, onQuit: quitApp }
  const window = createMainWindow()
  attachWindowLifecycle(window)
  createTray(trayActions)

  const settings = loadSettings()
  session.setAutoLockMinutes(settings.autoLockMinutes)
  clipboardWatcher.setEnabled(settings.clipboardWatch)
  clipboardWatcher.start((url) => {
    if (!session.isUnlocked) return
    emitToRenderer(IPC_EVENT.clipboardUrl, url)
    showMainWindow()
  })

  session.on('locked', (reason: string) => {
    emitToRenderer(IPC_EVENT.locked, reason)
    refreshTrayMenu(trayActions)
  })
  session.on('unlocked', () => refreshTrayMenu(trayActions))
  session.on('save-state', (state) => emitToRenderer(IPC_EVENT.saveState, state))

  globalShortcut.register(QUICK_ADD_SHORTCUT, () => {
    showMainWindow()
    emitToRenderer(IPC_EVENT.quickAdd)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) attachWindowLifecycle(createMainWindow())
    else showMainWindow()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !loadSettings().minimizeToTray) quitApp()
})

app.on('before-quit', () => {
  isQuitting = true
  // 保存デバウンス中の変更を取りこぼさないよう、鍵を捨てる前に必ず書き切る。
  session.flush()
  session.lock('quit')
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  clipboardWatcher.stop()
  destroyTray()
})
