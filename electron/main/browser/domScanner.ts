import { webContents } from 'electron'
import type { MediaCandidate } from '@shared/types'
import { addMediaCandidates } from './mediaSniffer'

/**
 * ページ内で実際に再生されている URL を集める。
 * 通信の監視だけでは、キャッシュから再生された場合や、こちらの判定条件から
 * 外れた content-type のときに取りこぼす。DOM 側からも見ることで補う。
 */
const COLLECTOR = `(() => {
  const out = []
  const push = (value) => {
    if (typeof value === 'string' && /^https?:\\/\\//i.test(value)) out.push(value)
  }
  for (const node of document.querySelectorAll('video, audio')) {
    push(node.currentSrc)
    push(node.getAttribute('src'))
    for (const source of node.querySelectorAll('source')) push(source.getAttribute('src') || source.src)
  }
  // og:video や JSON-LD に直リンクを置くサイトも多い
  for (const meta of document.querySelectorAll('meta[property="og:video"], meta[property="og:video:secure_url"], meta[itemprop="contentURL"]')) {
    push(meta.getAttribute('content'))
  }
  return Array.from(new Set(out))
})()`

const STREAM_MANIFEST = /\.(m3u8|mpd)(\?|#|$)/i

function toAbsolute(url: string, base: string): string | null {
  try {
    return new URL(url, base).href
  } catch {
    return null
  }
}

/**
 * 指定タブのすべてのフレームを走査する。
 * 動画サイトはプレイヤーを iframe に入れていることが多く、メインフレームだけでは届かない。
 */
export async function scanPageMedia(contentsId: number): Promise<MediaCandidate[]> {
  const contents = webContents.fromId(contentsId)
  if (!contents || contents.isDestroyed()) return []

  const found = new Set<string>()
  const frames = [contents.mainFrame, ...contents.mainFrame.framesInSubtree]

  for (const frame of frames) {
    try {
      const result = (await frame.executeJavaScript(COLLECTOR, false)) as unknown
      if (!Array.isArray(result)) continue
      for (const entry of result) {
        if (typeof entry !== 'string') continue
        const absolute = toAbsolute(entry, frame.url)
        if (absolute) found.add(absolute)
      }
    } catch {
      // 実行できないフレーム（about:blank や権限のないもの）は飛ばす。
    }
  }

  return addMediaCandidates(
    contentsId,
    [...found].map((url) => ({ url, kind: STREAM_MANIFEST.test(url) ? ('hls' as const) : ('file' as const) })),
  )
}
