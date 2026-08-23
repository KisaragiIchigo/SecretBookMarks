import { BrowserWindow, app, globalShortcut } from 'electron'
import { IPC_EVENT } from '@shared/ipc'
import { initAdblock } from './browser/adblock'
import { restoreCookies, startCookieSync } from './browser/session'
import { startMediaSniffer } from './browser/mediaSniffer'
import { registerWebviewBridge } from './browser/webviewBridge'
import { clipboardWatcher } from './clipboard/watcher'
import { downloads } from './download/manager'
import { registerIpcHandlers } from './ipc'
import { installCrashGuard } from './crashGuard'
import { redirectChromiumData } from './paths'
import { loadSettings } from './settings'
import { createTray, destroyTray, refreshTrayMenu } from './tray'
import { session } from './vault/session'
import { createMainWindow, emitToRenderer, getMainWindow } from './window'

const QUICK_ADD_SHORTCUT = 'CommandOrControl+Shift+B'
// 終了処理が滞っても、この時間で強制的に終える
const QUIT_TIMEOUT_MS = 4000

// Chromium が userData を掴む前に置き場所を移す。ready 後では効かない。
redirectChromiumData()
// 通信層など、こちらで防ぎきれない例外でアプリごと落ちないようにする。
installCrashGuard()

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
  app.quit()
}

function attachWindowLifecycle(window: BrowserWindow): void {
  // 閉じるボタンは常に終了する。タスクマネージャーに残り続けるのは分かりにくいため、
  // 常駐させたい場合は最小化を使う（設定で切り替え）。

  window.on('minimize', () => {
    if (!loadSettings().minimizeToTray) return
    // 最小化でトレイへ入れる（タスクバーから消える）。クリップボード監視は続く。
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

  // 内蔵ブラウザ一式。セッションは persist しないので、Cookie はヴォールト経由で出し入れする。
  registerWebviewBridge()
  startMediaSniffer()
  startCookieSync()
  void initAdblock()
  downloads.init()
  downloads.on('changed', (task) => emitToRenderer(IPC_EVENT.downloadChanged, task))

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
  session.on('unlocked', () => {
    refreshTrayMenu(trayActions)
    void restoreCookies()
  })
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
  if (process.platform !== 'darwin') quitApp()
})

app.on('before-quit', () => {
  // 実行中のダウンロードを止める。ffmpeg の子プロセスが残るのを防ぐ。
  downloads.shutdown()
  // 保存デバウンス中の変更を取りこぼさないよう、鍵を捨てる前に必ず書き切る。
  session.flush()
  session.lock('quit')
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  clipboardWatcher.stop()
  destroyTray()

  // 何かが終了を妨げても、確実に終わらせる。
  const watchdog = setTimeout(() => app.exit(0), QUIT_TIMEOUT_MS)
  watchdog.unref()
})
