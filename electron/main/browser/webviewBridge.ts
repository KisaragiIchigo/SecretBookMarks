import { Menu, app, clipboard, shell, type ContextMenuParams, type WebContents } from 'electron'
import { IPC_EVENT } from '@shared/ipc'
import { downloads } from '../download/manager'
import { emitToRenderer, getMainWindow } from '../window'
import { clearMediaFor, mediaCandidates } from './mediaSniffer'

const BROWSER_PARTITION = 'sbm-browser'

function isStream(url: string): boolean {
  return /\.(m3u8|mpd)(\?|#|$)/i.test(url)
}

function buildContextMenu(contents: WebContents, params: ContextMenuParams): Menu {
  const pageUrl = contents.getURL()
  const template: Electron.MenuItemConstructorOptions[] = []

  if (params.mediaType === 'video' || params.mediaType === 'audio') {
    const src = params.srcURL
    if (src && src.startsWith('blob:')) {
      template.push({
        label: 'この動画は保存できません（ページ内で組み立てられた形式）',
        enabled: false,
      })
      template.push({
        label: '検出済みの動画から探す',
        click: () => emitToRenderer(IPC_EVENT.mediaDetected, { contentsId: contents.id, candidates: mediaCandidates(contents.id), reveal: true }),
      })
    } else if (src) {
      template.push({
        label: 'この動画を保存',
        click: () => {
          void downloads.start({ url: src, kind: isStream(src) ? 'hls' : 'file', pageUrl })
        },
      })
    }
    template.push({ type: 'separator' })
  }

  if (params.mediaType === 'image' && params.srcURL && !params.srcURL.startsWith('blob:')) {
    template.push({
      label: 'この画像を保存',
      click: () => {
        void downloads.start({ url: params.srcURL, kind: 'file', pageUrl })
      },
    })
    template.push({ type: 'separator' })
  }

  const detected = mediaCandidates(contents.id)
  if (detected.length > 0) {
    template.push({
      label: `このページで見つかった動画（${detected.length}件）を表示`,
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
    label: 'このページをブックマークに追加',
    click: () => emitToRenderer(IPC_EVENT.browserCapturePage, { url: pageUrl, title: contents.getTitle() }),
  })
  template.push({ type: 'separator' })
  template.push({ label: '戻る', enabled: contents.navigationHistory.canGoBack(), click: () => contents.navigationHistory.goBack() })
  template.push({ label: '進む', enabled: contents.navigationHistory.canGoForward(), click: () => contents.navigationHistory.goForward() })
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
