import { useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import type { BrowserTab } from '@/state/BrowserProvider'
import type { WebviewElement } from '@/types/global'

export interface WebviewHostProps {
  tabId: string
  initialUrl: string
  active: boolean
  /** タブ id を伴う安定した関数を渡すこと（毎回作り直すとリスナーが付け外しされる） */
  onPatch: (id: string, patch: Partial<BrowserTab>) => void
  onRegister: (id: string, element: WebviewElement | null) => void
}

/** タブ1枚ぶんの <webview>。表示状態に関わらず常にマウントし続け、ページの状態を保つ。 */
export function WebviewHost({ tabId, initialUrl, active, onPatch, onRegister }: WebviewHostProps) {
  const ref = useRef<WebviewElement | null>(null)

  // ref コールバックを毎回作り直すと React が付け外しを繰り返すため固定する。
  const attachRef = useCallback(
    (element: WebviewElement | null) => {
      ref.current = element
      onRegister(tabId, element)
    },
    [onRegister, tabId],
  )

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const sync = () => {
      onPatch(tabId, {
        url: element.getURL(),
        title: element.getTitle() || element.getURL(),
        canGoBack: element.canGoBack(),
        canGoForward: element.canGoForward(),
      })
    }

    const onStartLoading = () => onPatch(tabId, { loading: true })
    const onStopLoading = () => {
      onPatch(tabId, { loading: false })
      sync()
    }
    const onTitleUpdated = (event: Event) => {
      const title = (event as Event & { title?: string }).title
      if (title) onPatch(tabId, { title })
    }
    // getWebContentsId() は接続後でないと使えないため dom-ready を待つ。
    const onDomReady = () => {
      onPatch(tabId, { contentsId: element.getWebContentsId() })
      sync()
    }

    const events: [string, EventListener][] = [
      ['did-start-loading', onStartLoading],
      ['did-stop-loading', onStopLoading],
      ['did-navigate', sync],
      ['did-navigate-in-page', sync],
      ['did-frame-navigate', sync],
      ['load-commit', sync],
      ['page-title-updated', onTitleUpdated],
      ['dom-ready', onDomReady],
    ]
    for (const [name, handler] of events) element.addEventListener(name, handler)

    // 履歴の可否はイベントの取りこぼしで簡単にずれるため、控えめな間隔で追従させる。
    const timer = window.setInterval(() => {
      if (!ref.current) return
      onPatch(tabId, {
        canGoBack: ref.current.canGoBack(),
        canGoForward: ref.current.canGoForward(),
      })
    }, 700)

    return () => {
      for (const [name, handler] of events) element.removeEventListener(name, handler)
      window.clearInterval(timer)
    }
  }, [onPatch, tabId])

  return (
    <webview
      ref={attachRef}
      src={initialUrl}
      partition="sbm-browser"
      allowpopups={true}
      className={cn('absolute inset-0 h-full w-full bg-white', active ? 'flex' : 'hidden')}
    />
  )
}
