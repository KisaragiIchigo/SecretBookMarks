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
 * 画面上のパスワード欄から、保存すべき利用者名とパスワードを選ぶ。
 *
 * パスワード欄が複数ある場合は変更・登録フォームのことが多い。
 * 単純に最初の欄を採ると「旧パスワード」を保存してしまうため、
 * 確認欄と一致する値（＝新しいパスワード）を優先する。
 */
function findLoginFields(scope: ParentNode) {
  const passwords = Array.from(scope.querySelectorAll<HTMLInputElement>('input[type="password"]')).filter(
    (input) => input.value,
  )
  if (passwords.length === 0) return null

  let chosen = passwords[0]
  if (passwords.length > 1) {
    const duplicated = passwords.find(
      (input, index) => passwords.findIndex((other, i) => i !== index && other.value === input.value) !== -1,
    )
    chosen = duplicated ?? passwords[passwords.length - 1]
  }

  // 利用者名はパスワード欄より前にある入力欄のうち、いちばん近いものを採る
  const inputs = Array.from(scope.querySelectorAll<HTMLInputElement>('input'))
  const chosenIndex = inputs.indexOf(chosen)
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

/**
 * ログインの検知。
 *
 * form の submit だけを見ていると、ボタンのクリックで送る作りや Enter で送る作りを
 * 丸ごと取りこぼす（実測で確認）。送信の合図になりうる操作を広く拾い、
 * 同じ内容の重複だけを抑える。
 */
let lastSent = ''
let lastSentAt = 0

function reportCredentials(scope: ParentNode | null): void {
  const found = findLoginFields(scope ?? document)
  if (!found) return

  const signature = `${location.origin}|${found.username}|${found.password}`
  const now = Date.now()
  // クリックと Enter の両方が起きる作りもあるため、同じ内容の連投を抑える
  if (signature === lastSent && now - lastSentAt < 5000) return
  lastSent = signature
  lastSentAt = now

  ipcRenderer.send('sbm:credential-capture', {
    origin: location.origin,
    username: found.username,
    password: found.password,
    multiplePasswordFields: found.multiplePasswordFields,
  })
}

/** 対象の要素が属するフォーム。無ければ画面全体を見る。 */
function scopeOf(node: EventTarget | null): ParentNode {
  if (node instanceof Element && typeof node.closest === 'function') {
    return node.closest('form') ?? document
  }
  return document
}

// 昔ながらの form 送信
window.addEventListener('submit', (event) => reportCredentials(scopeOf(event.target)), true)

// ボタンのクリックで送る作り。画面が切り替わる前に読む必要があるのでその場で拾う。
window.addEventListener(
  'click',
  (event) => {
    const target = event.target
    if (!(target instanceof Element) || typeof target.closest !== 'function') return
    const trigger = target.closest('button, input[type="submit"], input[type="button"], [role="button"], a')
    if (!trigger) return
    reportCredentials(scopeOf(trigger))
  },
  true,
)

// パスワード欄などで Enter を押す作り
window.addEventListener(
  'keydown',
  (event) => {
    if ((event as KeyboardEvent).key !== 'Enter') return
    if (!(event.target instanceof HTMLInputElement)) return
    reportCredentials(scopeOf(event.target))
  },
  true,
)

// 画面を離れる直前。上のどれにも当てはまらない作りへの保険。
window.addEventListener('pagehide', () => reportCredentials(document), true)
