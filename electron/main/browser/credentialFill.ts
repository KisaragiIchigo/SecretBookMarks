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
