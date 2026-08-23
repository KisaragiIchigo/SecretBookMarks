import { Menu, app, clipboard, ipcMain, shell, type ContextMenuParams, type WebContents } from 'electron'
import { join } from 'node:path'
import { IPC_EVENT } from '@shared/ipc'
import { downloads } from '../download/manager'
import { emitToRenderer, getMainWindow } from '../window'
import { clearMediaFor, mediaCandidates } from './mediaSniffer'
import { browserSession } from './session'

const BROWSER_PARTITION = 'sbm-browser'

/**
 * Shift の状態は context-menu の params に載らない。
 * 各フレームへ差し込んだガードが、右クリックの瞬間に修飾キーを送ってくるので、それを保持する。
 */
const shiftHeld = new WeakMap<WebContents, boolean>()

function isStream(url: string): boolean {
  return /\.(m3u8|mpd)(\?|#|$)/i.test(url)
}

function saveMedia(url: string, pageUrl: string, saveAs: boolean): void {
  void downloads.start({ url, kind: isStream(url) ? 'hls' : 'file', pageUrl, saveAs })
}

function buildContextMenu(contents: WebContents, params: ContextMenuParams): Menu {
  const pageUrl = contents.getURL()
  const withShift = shiftHeld.get(contents) === true
  const template: Electron.MenuItemConstructorOptions[] = []

  const media = params.mediaType === 'video' || params.mediaType === 'audio' ? params.srcURL : ''
  const image = params.mediaType === 'image' ? params.srcURL : ''
  const target = media || image

  if (target && target.startsWith('blob:')) {
    template.push({ label: 'この動画は直接保存できません（ページ内で組み立てられた形式）', enabled: false })
    template.push({
      label: '検出済みの動画から探す(&V)',
      click: () =>
        emitToRenderer(IPC_EVENT.mediaDetected, {
          contentsId: contents.id,
          candidates: mediaCandidates(contents.id),
          reveal: true,
        }),
    })
    template.push({ type: 'separator' })
  } else if (target) {
    const saveAsItem: Electron.MenuItemConstructorOptions = {
      // (&V) は Windows のニーモニック。メニューを開いて V を押すとこれが実行される。
      label: '名前を付けて保存(&V)',
      click: () => saveMedia(target, pageUrl, true),
    }
    const quickItem: Electron.MenuItemConstructorOptions = {
      label: media ? 'この動画を保存' : 'この画像を保存',
      click: () => saveMedia(target, pageUrl, false),
    }
    // Shift を押しながらの右クリックでは「名前を付けて保存」を先頭に出す。
    template.push(...(withShift ? [saveAsItem, quickItem] : [quickItem, saveAsItem]))
    template.push({ type: 'separator' })
  }

  const detected = mediaCandidates(contents.id)
  if (detected.length > 0 && !target) {
    template.push({
      label: `このページで見つかった動画（${detected.length}件）を表示(&V)`,
      click: () =>
        emitToRenderer(IPC_EVENT.mediaDetected, {
          contentsId: contents.id,
          candidates: detected,
          reveal: true,
        }),
    })
    template.push({ type: 'separator' })
  }

  if (params.linkURL) {
    template.push({
      label: 'リンクを新しいタブで開く',
      click: () => emitToRenderer(IPC_EVENT.browserOpenUrl, params.linkURL),
    })
    template.push({ label: 'リンクをコピー', click: () => clipboard.writeText(params.linkURL) })
    template.push({ type: 'separator' })
  }

  if (params.selectionText) {
    template.push({ label: 'コピー', role: 'copy' })
    template.push({ type: 'separator' })
  }

  template.push({
    label: 'このページをブックマークに追加(&B)',
    click: () => emitToRenderer(IPC_EVENT.browserCapturePage, { url: pageUrl, title: contents.getTitle() }),
  })
  template.push({ type: 'separator' })
  template.push({
    label: '戻る',
    enabled: contents.navigationHistory.canGoBack(),
    click: () => contents.navigationHistory.goBack(),
  })
  template.push({
    label: '進む',
    enabled: contents.navigationHistory.canGoForward(),
    click: () => contents.navigationHistory.goForward(),
  })
  template.push({ label: '再読み込み', click: () => contents.reload() })
  template.push({ type: 'separator' })
  template.push({ label: '既定のブラウザーで開く', click: () => void shell.openExternal(pageUrl) })

  return Menu.buildFromTemplate(template)
}

/**
 * 内蔵ブラウザ（webview）の振る舞いを Main 側でまとめて面倒を見る。
 * 右クリックメニューをネイティブメニューにしているのは、Renderer 上のオーバーレイと
 * webview の重なり順を気にせずに済むため。
 */
export function registerWebviewBridge(): void {
  // ページ側の右クリック禁止を Shift で無効化するためのガードを全フレームへ差し込む。
  try {
    browserSession().registerPreloadScript({
      id: 'sbm-webview-guard',
      type: 'frame',
      filePath: join(__dirname, '..', 'preload', 'webview-guard.cjs'),
    })
  } catch (error) {
    console.warn('[browser] ガードの登録に失敗しました:', (error as Error).message)
  }

  ipcMain.on('sbm:context-modifiers', (event, payload: { shift?: boolean }) => {
    shiftHeld.set(event.sender, payload?.shift === true)
  })

  const window = getMainWindow()
  window?.webContents.on('will-attach-webview', (_event, webPreferences) => {
    // Renderer 側の指定に関わらず、危険な設定は付けさせない。
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.partition = BROWSER_PARTITION
  })

  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return

    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) emitToRenderer(IPC_EVENT.browserOpenUrl, url)
      return { action: 'deny' }
    })

    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) clearMediaFor(contents.id)
    })

    contents.on('context-menu', (_contextEvent, params) => {
      buildContextMenu(contents, params).popup({ window: getMainWindow() ?? undefined })
    })

    contents.on('destroyed', () => clearMediaFor(contents.id))
  })
}
