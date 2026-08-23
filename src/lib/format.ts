const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(ms: number | null): string {
  return ms === null ? '—' : dateFormatter.format(ms)
}

export function formatDateTime(ms: number | null): string {
  return ms === null ? '—' : dateTimeFormatter.format(ms)
}

/** 一覧の右端に置く控えめな相対表記。7日以上前は日付そのものを出す。 */
export function formatRelative(ms: number | null): string {
  if (ms === null) return '—'
  const diff = Date.now() - ms
  if (diff < 60_000) return 'たった今'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}日前`
  return formatDate(ms)
}

export function formatCount(count: number): string {
  return count.toLocaleString('ja-JP')
}

/** URL をリストで潰さずに見せるため、長いパスを中略する。 */
export function truncateUrl(url: string, max = 72): string {
  const trimmed = url.replace(/^https?:\/\//, '')
  if (trimmed.length <= max) return trimmed
  const head = trimmed.slice(0, Math.ceil(max * 0.6))
  const tail = trimmed.slice(-Math.floor(max * 0.3))
  return `${head}…${tail}`
}

export function describeLinkStatus(code: number | null): string {
  if (code === null) return '到達できません'
  if (code >= 200 && code < 300) return `正常 (${code})`
  if (code >= 300 && code < 400) return `リダイレクト (${code})`
  if (code === 404) return '見つかりません (404)'
  return `エラー (${code})`
}
