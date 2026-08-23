import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { session } from './session'

/**
 * ヴォールトの中でさらに個別に暗号化する層。
 *
 * ヴォールト全体は保存時に暗号化されるが、解錠している間はモデルが平文で主記憶に載る。
 * パスワードだけは使う瞬間まで暗号のままにしておき、露出する時間を最小にする。
 * 鍵はマスター鍵から用途別に導出するため、この層のために別の鍵を保存する必要はない。
 */
const SUBKEY_INFO = 'secretbookmarks/credential-secret/v1'
const NONCE_LEN = 12

export function sealSecret(plain: string): string {
  const key = session.deriveSubkey(SUBKEY_INFO)
  const nonce = randomBytes(NONCE_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  key.fill(0)
  return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64')
}

export function openSecret(blob: string): string {
  const raw = Buffer.from(blob, 'base64')
  if (raw.length < NONCE_LEN + 16) return ''
  const key = session.deriveSubkey(SUBKEY_INFO)
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, NONCE_LEN))
    decipher.setAuthTag(raw.subarray(NONCE_LEN, NONCE_LEN + 16))
    return Buffer.concat([decipher.update(raw.subarray(NONCE_LEN + 16)), decipher.final()]).toString('utf8')
  } catch {
    // 鍵が違う、または壊れている。中身は復元できない。
    return ''
  } finally {
    key.fill(0)
  }
}
