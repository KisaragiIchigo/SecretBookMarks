import { session, type Session } from 'electron'
import type { StoredCookie } from '@shared/types'
import { loadSettings } from '../settings'
import { session as vault } from '../vault/session'

/**
 * 内蔵ブラウザ用のセッション。
 * partition 名に persist: を付けないことで Chromium 側の永続化を止め、
 * Cookie はヴォールト（暗号化）へ自前で出し入れする。
 * これにより「秘密のブックマーク」を謳いながら履歴や Cookie が平文で残る、という矛盾を避ける。
 */
const PARTITION = 'sbm-browser'

export function browserSession(): Session {
  return session.fromPartition(PARTITION, { cache: true })
}

function cookieUrl(cookie: { domain?: string; path?: string; secure?: boolean }): string {
  const host = (cookie.domain ?? '').replace(/^\./, '')
  const scheme = cookie.secure ? 'https' : 'http'
  return `${scheme}://${host}${cookie.path ?? '/'}`
}

/** セッション上の Cookie をヴォールトへ書き出す。ロックと終了の直前に呼ぶ。 */
export async function persistCookies(): Promise<number> {
  if (!vault.isUnlocked || !loadSettings().saveBrowserCookies) return 0
  const cookies = await browserSession().cookies.get({})
  const stored: StoredCookie[] = cookies.map((cookie) => ({
    url: cookieUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    // 先頭がドットのものだけがドメイン Cookie。ホスト限定のものは domain を渡さない。
    domain: cookie.domain?.startsWith('.') ? cookie.domain : undefined,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    expirationDate: cookie.expirationDate,
    sameSite: cookie.sameSite,
  }))
  vault.getModel().cookies = stored
  vault.markDirty()
  return stored.length
}

/** ヴォールトの Cookie をセッションへ戻す。解錠の直後に呼ぶ。 */
export async function restoreCookies(): Promise<number> {
  if (!vault.isUnlocked || !loadSettings().saveBrowserCookies) return 0
  const stored = vault.getModel().cookies ?? []
  const jar = browserSession().cookies
  let restored = 0
  for (const cookie of stored) {
    try {
      await jar.set(cookie)
      restored += 1
    } catch {
      // 期限切れや不正なドメインのものは黙って捨てる。
    }
  }
  return restored
}

/** 閲覧の痕跡を消す。Cookie はヴォールト側も空にする。 */
export async function clearBrowserData(): Promise<void> {
  const ses = browserSession()
  await ses.clearStorageData()
  await ses.clearCache()
  if (vault.isUnlocked) {
    vault.getModel().cookies = []
    vault.markDirty()
  }
}

/**
 * Cookie の変更をヴォールトへ随時反映する。
 * ロックは同期処理で鍵を捨てるため、その瞬間に非同期の書き出しを挟めない。
 * 変更のたびに追従しておけば、いつロックされても直前の状態が残る。
 */
export function startCookieSync(): void {
  let timer: NodeJS.Timeout | null = null
  browserSession().cookies.on('changed', () => {
    if (!vault.isUnlocked || !loadSettings().saveBrowserCookies) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void persistCookies(), 2000)
  })
}
