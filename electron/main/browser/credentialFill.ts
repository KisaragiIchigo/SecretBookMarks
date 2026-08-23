import { webContents } from 'electron'
import { markCredentialUsed, revealCredential } from '../vault/credentials'

/**
 * 保存済みのログイン情報をページへ入力する。
 *
 * 復号した値は Main の中だけで扱い、画面側へは渡さない。
 * 送信までは行わない（利用者が内容を確認してから押せるようにするため）。
 */
const FILLER = `(username, password) => {
  const forms = Array.from(document.querySelectorAll('form'))
  const target =
    forms.find((form) => form.querySelector('input[type="password"]')) ?? document
  const password_ = target.querySelector('input[type="password"]')
  if (!password_) return false

  const inputs = Array.from(target.querySelectorAll('input'))
  const index = inputs.indexOf(password_)
  const user = inputs
    .slice(0, index)
    .reverse()
    .find((input) => {
      const type = (input.type || '').toLowerCase()
      return ['text', 'email', 'tel', 'username', ''].includes(type)
    })

  const assign = (input, value) => {
    if (!input) return
    const setter = Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value')?.set
    if (setter) setter.call(input, value)
    else input.value = value
    // React などの制御された入力にも反映されるよう、変更を通知する
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  if (username) assign(user, username)
  assign(password_, password)
  return true
}`

export async function fillCredential(contentsId: number, credentialId: string): Promise<boolean> {
  const contents = webContents.fromId(contentsId)
  if (!contents || contents.isDestroyed()) return false

  const secret = revealCredential(credentialId)
  if (!secret) return false

  // 値は引数として渡し、スクリプト本文には埋め込まない。
  const script = `(${FILLER})(${JSON.stringify(secret.username)}, ${JSON.stringify(secret.password)})`
  try {
    const filled = (await contents.executeJavaScript(script, true)) as boolean
    if (filled) markCredentialUsed(credentialId)
    return filled
  } catch {
    return false
  }
}

/** 表示中のページに入力されている利用者名とパスワードを読む。 */
const READER = `(() => {
  const scopes = [document, ...Array.from(document.querySelectorAll('form'))]
  for (const scope of scopes) {
    const passwords = Array.from(scope.querySelectorAll('input[type="password"]')).filter((i) => i.value)
    if (passwords.length === 0) continue
    let chosen = passwords[0]
    if (passwords.length > 1) {
      const dup = passwords.find((input, index) =>
        passwords.findIndex((other, i) => i !== index && other.value === input.value) !== -1)
      chosen = dup || passwords[passwords.length - 1]
    }
    const inputs = Array.from(scope.querySelectorAll('input'))
    const index = inputs.indexOf(chosen)
    const user = inputs.slice(0, index).reverse().find((input) => {
      const type = (input.type || '').toLowerCase()
      return input.value && ['text', 'email', 'tel', 'username', ''].includes(type)
    })
    return JSON.stringify({
      origin: location.origin,
      username: user ? user.value : '',
      password: chosen.value,
      multiplePasswordFields: passwords.length > 1,
    })
  }
  return ''
})()`

/**
 * 自動検知が働かない画面のための手動保存。
 * すべてのフレームを見て、最初に見つかった入力内容を返す。
 */
export async function readLoginFields(contentsId: number): Promise<{
  origin: string
  username: string
  password: string
  multiplePasswordFields: boolean
} | null> {
  const contents = webContents.fromId(contentsId)
  if (!contents || contents.isDestroyed()) return null

  for (const frame of [contents.mainFrame, ...contents.mainFrame.framesInSubtree]) {
    try {
      const raw = (await frame.executeJavaScript(READER, false)) as string
      if (!raw) continue
      const parsed = JSON.parse(raw) as {
        origin: string
        username: string
        password: string
        multiplePasswordFields: boolean
      }
      if (parsed.password) return parsed
    } catch {
      // 実行できないフレームは飛ばす。
    }
  }
  return null
}
