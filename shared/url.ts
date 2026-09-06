/** URL の判定・正規化・ドメイン抽出。Main / Renderer の両方から使う純粋関数。 */

const TRACKING_KEYS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_name',
  'utm_id',
  'utm_reader',
  'utm_viz_id',
  'utm_pubreferrer',
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'yclid',
  'ref_src',
  'spm',
])

export function isHttpUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test((text ?? '').trim())
}

/**
 * 重複判定用の正規化。
 * scheme/host の小文字化、既定ポート除去、末尾スラッシュ除去、
 * フラグメント除去、トラッキングパラメータ除去、クエリのキー昇順ソートを行う。
 */
export function normalizeUrl(input: string): string {
  const raw = (input ?? '').trim()
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return raw
  }
  const scheme = parsed.protocol.toLowerCase()
  if (scheme !== 'http:' && scheme !== 'https:') return raw

  const host = parsed.hostname.toLowerCase()
  const port = parsed.port
  const isDefaultPort = (scheme === 'http:' && port === '80') || (scheme === 'https:' && port === '443')
  const authority = port && !isDefaultPort ? `${host}:${port}` : host

  let path = parsed.pathname.replace(/\/{2,}/g, '/')
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  if (path === '') path = '/'

  const params: [string, string][] = []
  parsed.searchParams.forEach((value, key) => {
    if (!key || !value) return
    if (TRACKING_KEYS.has(key.toLowerCase())) return
    params.push([key, value])
  })
  params.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
  const query = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')

  return `${scheme}//${authority}${path}${query ? `?${query}` : ''}`
}

export function extractDomain(input: string): string {
  try {
    return new URL(input).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return input
  }
}

/** テキスト中から最初の http(s) URL を1件だけ拾う（クリップボード検知用） */
export function pickFirstUrl(text: string): string | null {
  const match = /(https?:\/\/[^\s"'<>]+)/i.exec(text ?? '')
  if (!match) return null
  const candidate = match[1].replace(/[),.;]+$/, '')
  return isHttpUrl(candidate) ? candidate : null
}

/** アルバム・ギャラリーページの URL パターン（/a/[識別子] 形式等） */
export const ALBUM_URL_PATTERN = /^https?:\/\/[^/]+\/a\/[\w-]+/i

/**
 * URL がアルバム・ギャラリーページ（一括ダウンロード対象）かどうかを判定する。
 */
export function isAlbumUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return ALBUM_URL_PATTERN.test(url.trim())
}

