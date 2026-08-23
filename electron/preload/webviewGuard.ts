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

/**
 * ログインフォームの送信を検知して Main へ渡す。
 * 保存するかどうかは利用者に確認し、保存する場合もヴォールト内で暗号化される。
 * ここで拾った値はディスクへは書かれない。
 */
/**
 * 送信されたフォームから、保存すべき利用者名とパスワードを選ぶ。
 *
 * パスワード欄が複数ある場合は変更・登録フォームのことが多い。
 * 単純に最初の欄を採ると「旧パスワード」を保存してしまうため、
 * 確認欄と一致する値（＝新しいパスワード）を優先する。
 */
const findLoginFields = (form: HTMLFormElement) => {
  const passwords = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="password"]')).filter(
    (input) => input.value,
  )
  if (passwords.length === 0) return null

  let chosen = passwords[0]
  if (passwords.length > 1) {
    // 同じ値が2回入力されているものを新しいパスワードとみなす
    const duplicated = passwords.find(
      (input, index) => passwords.findIndex((other, i) => i !== index && other.value === input.value) !== -1,
    )
    chosen = duplicated ?? passwords[passwords.length - 1]
  }

  const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input'))
  const chosenIndex = inputs.indexOf(chosen)
  // 利用者名はパスワード欄より前にある入力欄のうち、いちばん近いものを採る
  const username = inputs
    .slice(0, chosenIndex)
    .reverse()
    .find((input) => {
      const type = (input.type || '').toLowerCase()
      return input.value && ['text', 'email', 'tel', 'username', ''].includes(type)
    })

  return {
    username: username?.value ?? '',
    password: chosen.value,
    /** パスワード欄が複数あった＝変更や登録の画面である可能性 */
    multiplePasswordFields: passwords.length > 1,
  }
}

window.addEventListener(
  'submit',
  (event) => {
    const form = event.target as HTMLFormElement | null
    if (!form || typeof form.querySelector !== 'function') return
    const found = findLoginFields(form)
    if (!found) return
    ipcRenderer.send('sbm:credential-capture', {
      origin: location.origin,
      username: found.username,
      password: found.password,
      multiplePasswordFields: found.multiplePasswordFields,
    })
  },
  true,
)
