import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { IPC_EVENT } from '@shared/ipc'
import { assetPath } from './assets'
import { loadSettings, saveSettings } from './settings'

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const GEOMETRY_SAVE_DEBOUNCE_MS = 500

let mainWindow: BrowserWindow | null = null
let geometryTimer: NodeJS.Timeout | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/** Main → Renderer の一方向通知。ウィンドウが無い / 破棄済みなら黙って捨てる。 */
export function emitToRenderer(channel: string, payload?: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

function persistGeometry(window: BrowserWindow): void {
  if (geometryTimer) clearTimeout(geometryTimer)
  geometryTimer = setTimeout(() => {
    if (window.isDestroyed()) return
    const maximized = window.isMaximized()
    const bounds = maximized ? window.getNormalBounds() : window.getBounds()
    saveSettings({
      window: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized },
    })
  }, GEOMETRY_SAVE_DEBOUNCE_MS)
}

export function createMainWindow(): BrowserWindow {
  const settings = loadSettings()

  const window = new BrowserWindow({
    width: settings.window.width,
    height: settings.window.height,
    x: settings.window.x ?? undefined,
    y: settings.window.y ?? undefined,
    minWidth: 1040,
    minHeight: 620,
    show: false,
    frame: false,
    backgroundColor: '#070b14',
    title: 'SecretBookMarks',
    icon: assetPath('icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      // 内蔵ブラウザ用。webPreferences は will-attach-webview で安全側に上書きする。
      webviewTag: true,
    },
  })

  if (settings.window.maximized) window.maximize()

  window.once('ready-to-show', () => window.show())
  // マウスのサイドボタンは WM_APPCOMMAND として届く。webview 側では拾えないため、
  // ウィンドウで受けて Renderer（アクティブなタブを知っている）へ回す。
  window.on('app-command', (event, command) => {
    if (command === 'browser-backward') {
      emitToRenderer(IPC_EVENT.browserNavigate, 'back')
      event.preventDefault()
    } else if (command === 'browser-forward') {
      emitToRenderer(IPC_EVENT.browserNavigate, 'forward')
      event.preventDefault()
    }
  })

  window.on('maximize', () => emitToRenderer(IPC_EVENT.maximizeChanged, true))
  window.on('unmaximize', () => emitToRenderer(IPC_EVENT.maximizeChanged, false))
  window.on('resize', () => persistGeometry(window))
  window.on('move', () => persistGeometry(window))
  window.on('closed', () => {
    mainWindow = null
  })

  // Renderer からの遷移・新規ウィンドウは全て外部ブラウザへ逃がす。
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (DEV_SERVER_URL && url.startsWith(DEV_SERVER_URL)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  if (DEV_SERVER_URL) {
    void window.loadURL(DEV_SERVER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow = window
  return window
}
