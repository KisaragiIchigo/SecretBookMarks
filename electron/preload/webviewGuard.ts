import { ipcRenderer } from 'electron'

/**
 * 内蔵ブラウザの各フレームに差し込むガード。
 *
 * 動画サイトの多くは contextmenu を preventDefault で潰しており、Firefox と違って
 * Chromium には Shift でそれを無視する仕組みが無い（実測で確認済み）。
 * そこで Shift を押しているときだけ、ページ側のハンドラへイベントを渡さないようにする。
 * window の捕捉フェーズで止めるため、document 以下に登録された preventDefault は走らない。
 */
window.addEventListener(
  'contextmenu',
  (event) => {
    const mouseEvent = event as MouseEvent
    // 右クリックの時点で修飾キーの状態を Main へ伝える。
    // context-menu イベントには修飾キーが載らないため、これが唯一の確実な経路。
    ipcRenderer.send('sbm:context-modifiers', { shift: mouseEvent.shiftKey })
    if (!mouseEvent.shiftKey) return
    event.stopImmediatePropagation()
  },
  true,
)
