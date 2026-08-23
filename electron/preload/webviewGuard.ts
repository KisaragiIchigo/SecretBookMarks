import { ipcRenderer } from 'electron'

/**
 * 内蔵ブラウザの各フレームに差し込むガード。
 */

/**
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

/**
 * マウスのサイドボタン（戻る / 進む）。
 * ポインタがページ上にあるときはゲストへマウスイベントとして配送され、
 * ウィンドウの app-command が発火しないことがある。ここでも捕捉して取りこぼしを防ぐ。
 * 二重発火は Main 側で間引く。
 */
const NAVIGATION_BUTTONS: Record<number, 'back' | 'forward'> = { 3: 'back', 4: 'forward' }

const onNavigationButton = (event: MouseEvent) => {
  const direction = NAVIGATION_BUTTONS[event.button]
  if (!direction) return
  event.preventDefault()
  event.stopPropagation()
  ipcRenderer.send('sbm:nav-command', direction)
}

window.addEventListener('mouseup', onNavigationButton, true)
window.addEventListener('auxclick', onNavigationButton, true)
