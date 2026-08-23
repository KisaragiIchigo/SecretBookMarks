import { randomUUID } from 'node:crypto'
import type { CredentialSummary, StoredCredential } from '@shared/types'
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

function toSummary(entry: StoredCredential): CredentialSummary {
  return {
    id: entry.id,
    origin: entry.origin,
    username: entry.username,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    lastUsedAt: entry.lastUsedAt,
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
