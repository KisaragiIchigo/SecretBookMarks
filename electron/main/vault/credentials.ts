import { randomUUID } from 'node:crypto'
import type { CredentialHistoryView, CredentialSummary, StoredCredential } from '@shared/types'
import { openSecret, sealSecret } from './secrets'
import { session } from './session'

/**
 * サイトのログイン情報を扱う。
 * パスワードはこのモジュールの外へ出さない（画面には username までしか渡さない）。
 */

function all(): StoredCredential[] {
  return session.getModel().credentials
}

/** スキームとホストまでを鍵にする。パスやクエリは無視する。 */
export function normalizeOrigin(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return ''
  }
}

const HISTORY_LIMIT = 5

function toSummary(entry: StoredCredential): CredentialSummary {
  return {
    id: entry.id,
    origin: entry.origin,
    username: entry.username,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    lastUsedAt: entry.lastUsedAt,
    historyCount: entry.history?.length ?? 0,
  }
}

export function listCredentials(): CredentialSummary[] {
  return all()
    .map(toSummary)
    .sort((a, b) => a.origin.localeCompare(b.origin) || a.username.localeCompare(b.username))
}

export function credentialsForOrigin(origin: string): CredentialSummary[] {
  return all()
    .filter((entry) => entry.origin === origin)
    .map(toSummary)
}

/** 同じサイトの同じ利用者名なら上書きし、無ければ追加する。 */
export function saveCredential(input: { origin: string; username: string; password: string }): CredentialSummary {
  const origin = normalizeOrigin(input.origin)
  const now = Date.now()
  const existing = all().find((entry) => entry.origin === origin && entry.username === input.username)

  if (existing) {
    // 同じパスワードなら何も変えない（ログインのたびに履歴が増えるのを防ぐ）。
    if (openSecret(existing.secret) === input.password) {
      existing.updatedAt = now
      session.markDirty()
      return toSummary(existing)
    }
    // 打ち間違いで正しいパスワードを失わないよう、古い方を履歴へ退避する。
    existing.history = [{ secret: existing.secret, replacedAt: now }, ...(existing.history ?? [])].slice(
      0,
      HISTORY_LIMIT,
    )
    existing.secret = sealSecret(input.password)
    existing.updatedAt = now
    session.markDirty()
    return toSummary(existing)
  }

  const created: StoredCredential = {
    id: randomUUID(),
    origin,
    username: input.username,
    secret: sealSecret(input.password),
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    history: [],
  }
  all().unshift(created)
  session.markDirty()
  return toSummary(created)
}

export function deleteCredential(id: string): boolean {
  const model = session.getModel()
  const before = model.credentials.length
  model.credentials = model.credentials.filter((entry) => entry.id !== id)
  if (model.credentials.length === before) return false
  session.markDirty()
  return true
}

/**
 * 復号したパスワードを取り出す。
 * 自動入力と、利用者が明示的に「表示」を選んだときだけ呼ぶこと。
 */
export function revealCredential(id: string): { username: string; password: string } | null {
  const entry = all().find((item) => item.id === id)
  if (!entry) return null
  return { username: entry.username, password: openSecret(entry.secret) }
}

export function markCredentialUsed(id: string): void {
  const entry = all().find((item) => item.id === id)
  if (!entry) return
  entry.lastUsedAt = Date.now()
  session.markDirty()
}

/** 過去のパスワードの一覧。中身は含めず、いつ置き換わったかだけ返す。 */
export function credentialHistory(id: string): CredentialHistoryView[] {
  const entry = all().find((item) => item.id === id)
  if (!entry) return []
  return (entry.history ?? []).map((item, index) => ({ index, replacedAt: item.replacedAt }))
}

/** 過去のパスワードを1件だけ取り出す。利用者が明示的に求めたときのみ。 */
export function revealCredentialHistory(id: string, index: number): string | null {
  const entry = all().find((item) => item.id === id)
  const found = entry?.history?.[index]
  return found ? openSecret(found.secret) : null
}

/**
 * 過去のパスワードを現在のものへ戻す。
 * 打ち間違いで上書きしてしまった場合の復旧に使う。
 */
export function restoreCredentialHistory(id: string, index: number): CredentialSummary | null {
  const entry = all().find((item) => item.id === id)
  const found = entry?.history?.[index]
  if (!entry || !found) return null

  const now = Date.now()
  const rest = entry.history.filter((_, position) => position !== index)
  entry.history = [{ secret: entry.secret, replacedAt: now }, ...rest].slice(0, HISTORY_LIMIT)
  entry.secret = found.secret
  entry.updatedAt = now
  session.markDirty()
  return toSummary(entry)
}
