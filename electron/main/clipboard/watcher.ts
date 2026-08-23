import { clipboard } from 'electron'
import { pickFirstUrl } from '@shared/url'

const POLL_MS = 900

type UrlListener = (url: string) => void

/**
 * クリップボードを監視して http(s) URL を拾う。
 * アプリ自身がコピーした URL は ignoreOnce() で握り潰し、自作自演の取り込みを防ぐ。
 */
class ClipboardWatcher {
  private timer: NodeJS.Timeout | null = null
  private lastText = ''
  private ignored = new Set<string>()
  private enabled = false
  private listener: UrlListener | null = null

  start(listener: UrlListener): void {
    this.listener = listener
    this.lastText = clipboard.readText() ?? ''
    if (this.timer) return
    this.timer = setInterval(() => this.poll(), POLL_MS)
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    // 無効中に変化したテキストで再開直後に発火しないよう、現在値を基準に戻す。
    this.lastText = clipboard.readText() ?? ''
  }

  ignoreOnce(text: string): void {
    this.ignored.add(text)
  }

  private poll(): void {
    const text = (clipboard.readText() ?? '').trim()
    if (text === this.lastText) return
    this.lastText = text

    if (this.ignored.delete(text)) return
    if (!this.enabled || !this.listener) return

    const url = pickFirstUrl(text)
    if (url) this.listener(url)
  }
}

export const clipboardWatcher = new ClipboardWatcher()
