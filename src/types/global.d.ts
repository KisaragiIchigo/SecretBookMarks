import type { SbmApi } from '../../electron/preload'

/** <webview> のうち、この画面で実際に使う最小限の API だけを型にする。 */
export interface WebviewElement extends HTMLElement {
  src: string
  loadURL(url: string): Promise<void>
  getURL(): string
  getTitle(): string
  reload(): void
  stop(): void
  goBack(): void
  goForward(): void
  canGoBack(): boolean
  canGoForward(): boolean
  getWebContentsId(): number
}

declare global {
  interface Window {
    sbm: SbmApi
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        partition?: string
        allowpopups?: boolean
        useragent?: string
      }
    }
  }
}

export {}
