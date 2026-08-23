import { Menu, app, clipboard, ipcMain, shell, type ContextMenuParams, type WebContents } from 'electron'
import { join } from 'node:path'
import { IPC_EVENT } from '@shared/ipc'
import { downloads } from '../download/manager'
import { emitToRenderer, getMainWindow } from '../window'
import { clearMediaFor, mediaCandidates } from './mediaSniffer'
import { resolvePageTitle } from './pageTitle'
import { browserSession } from './session'

const BROWSER_PARTITION = 'sbm-browser'

// サイドボタンは app-command とゲストの DOM の2経路から届くため、
// 短時間の重複を弾いて二重に戻ってしまうのを防ぐ。
const NAV_DEDUP_MS = 250
const lastNavigationAt: Record<string, number> = {}

/** ナビゲーション要求を Renderer へ配送する。経路が複数あっても1回だけ通す。 */
export function dispatchNavigation(direction: 'back' | 'forward'): void {
  const now = Date.now()
  if (now - (lastNavigationAt[direction] ?? 0) < NAV_DEDUP_MS) return
  lastNavigationAt[direction] = now
  emitToRenderer(IPC_EVENT.browserNavigate, direction)
}

/**
 * Shift の状態は context-menu の params に載らない。
 * 各フレームへ差し込んだガードが、右クリックの瞬間に修飾キーを送ってくるので、それを保持する。
 */
const shiftHeld = new WeakMap<WebContents, boolean>()

function isStream(url: string): boolean {
  return /\.(m3u8|mpd)(\?|#|$)/i.test(url)
}

function saveMedia(url: string, contents: WebContents, saveAs: boolean): void {
  const pageUrl = contents.getURL()
  void resolvePageTitle(contents.id).then((pageTitle) =>
    downloads.start({ url, kind: isStream(url) ? 'hls' : 'file', pageUrl, pageTitle, saveAs }),
  )
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
      click: () => saveMedia(target, contents, true),
    }
    const quickItem: Electron.MenuItemConstructorOptions = {
      label: media ? 'この動画を保存' : 'この画像を保存',
      click: () => saveMedia(target, contents, false),
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
      // 「新しいタブで開く」は背面に開くのが慣習。
      click: () => emitToRenderer(IPC_EVENT.browserOpenUrl, { url: params.linkURL, active: false }),
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
    click: () =>
      emitToRenderer(IPC_EVENT.browserCapturePage, {
        url: pageUrl,
        title: contents.getTitle(),
        contentsId: contents.id,
      }),
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

  ipcMain.on('sbm:nav-command', (_event, direction: 'back' | 'forward') => {
    if (direction === 'back' || direction === 'forward') dispatchNavigation(direction)
  })

  // ログインフォームの送信を検知したら、保存するかを画面で確認する。
  // ここで受け取った値は保存を選ぶまでどこにも書かない。
  ipcMain.on(
    'sbm:credential-capture',
    (
      _event,
      payload: { origin?: string; username?: string; password?: string; multiplePasswordFields?: boolean },
    ) => {
      if (!payload?.password || !payload.origin) return
      emitToRenderer(IPC_EVENT.credentialCaptured, {
        origin: payload.origin,
        username: payload.username ?? '',
        password: payload.password,
        multiplePasswordFields: payload.multiplePasswordFields === true,
      })
    },
  )

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

    contents.setWindowOpenHandler(({ url, disposition }) => {
      // Ctrl+クリックは background-tab、Ctrl+Shift+クリックは foreground-tab。
      // ブラウザの慣習どおり、要求された方を尊重する。
      const active = disposition === 'foreground-tab' || disposition === 'new-window'
      if (/^https?:\/\//i.test(url)) emitToRenderer(IPC_EVENT.browserOpenUrl, { url, active })
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
