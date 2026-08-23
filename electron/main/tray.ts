import { Menu, Tray, app, nativeImage } from 'electron'
import { assetPath } from './assets'
import { clipboardWatcher } from './clipboard/watcher'
import { loadSettings, saveSettings } from './settings'
import { session } from './vault/session'

let tray: Tray | null = null

interface TrayActions {
  onShow: () => void
  onQuit: () => void
}

function buildMenu(actions: TrayActions): Menu {
  const settings = loadSettings()
  return Menu.buildFromTemplate([
    { label: 'SecretBookMarks を開く', click: actions.onShow },
    { type: 'separator' },
    {
      label: 'クリップボード監視',
      type: 'checkbox',
      checked: settings.clipboardWatch,
      click: (item) => {
        saveSettings({ clipboardWatch: item.checked })
        clipboardWatcher.setEnabled(item.checked)
      },
    },
    {
      label: 'ヴォールトをロック',
      enabled: session.isUnlocked,
      click: () => session.lock('manual'),
    },
    { type: 'separator' },
    { label: '終了', click: actions.onQuit },
  ])
}

export function createTray(actions: TrayActions): Tray {
  const image = nativeImage.createFromPath(assetPath('icon.ico'))
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
  tray.setToolTip(`SecretBookMarks ${app.getVersion()}`)
  tray.setContextMenu(buildMenu(actions))
  tray.on('double-click', actions.onShow)

  // ロック状態でメニューの活性が変わるため、状態変化のたびに組み直す。
  session.on('locked', () => tray?.setContextMenu(buildMenu(actions)))
  session.on('unlocked', () => tray?.setContextMenu(buildMenu(actions)))
  return tray
}

export function refreshTrayMenu(actions: TrayActions): void {
  tray?.setContextMenu(buildMenu(actions))
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
