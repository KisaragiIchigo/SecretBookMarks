import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import type { BrowserTab } from '@/state/BrowserProvider'
import type { WebviewElement } from '@/types/global'

export interface WebviewHostProps {
  tab: BrowserTab
  active: boolean
  onPatch: (patch: Partial<BrowserTab>) => void
  onRegister: (id: string, element: WebviewElement | null) => void
}

/** タブ1枚ぶんの <webview>。表示状態に関わらず常にマウントし続け、ページの状態を保つ。 */
export function WebviewHost({ tab, active, onPatch, onRegister }: WebviewHostProps) {
  const ref = useRef<WebviewElement | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const sync = () =>
      onPatch({
        url: element.getURL(),
        title: element.getTitle() || element.getURL(),
        canGoBack: element.canGoBack(),
        canGoForward: element.canGoForward(),
      })

    const onStartLoading = () => onPatch({ loading: true })
    const onStopLoading = () => {
      onPatch({ loading: false })
      sync()
    }
    const onNavigate = () => sync()
    const onTitleUpdated = (event: Event) => {
      const title = (event as Event & { title?: string }).title
      if (title) onPatch({ title })
    }
    // getWebContentsId() は接続後でないと使えないため dom-ready を待つ。
    const onDomReady = () => {
      onPatch({ contentsId: element.getWebContentsId() })
      sync()
    }

    element.addEventListener('did-start-loading', onStartLoading)
    element.addEventListener('did-stop-loading', onStopLoading)
    element.addEventListener('did-navigate', onNavigate)
    element.addEventListener('did-navigate-in-page', onNavigate)
    element.addEventListener('page-title-updated', onTitleUpdated)
    element.addEventListener('dom-ready', onDomReady)

    return () => {
      element.removeEventListener('did-start-loading', onStartLoading)
      element.removeEventListener('did-stop-loading', onStopLoading)
      element.removeEventListener('did-navigate', onNavigate)
      element.removeEventListener('did-navigate-in-page', onNavigate)
      element.removeEventListener('page-title-updated', onTitleUpdated)
      element.removeEventListener('dom-ready', onDomReady)
    }
  }, [onPatch])

  return (
    <webview
      ref={(element) => {
        ref.current = element as WebviewElement | null
        onRegister(tab.id, element as WebviewElement | null)
      }}
      src={tab.initialUrl}
      partition="sbm-browser"
      allowpopups={true}
      className={cn('absolute inset-0 h-full w-full bg-white', active ? 'flex' : 'hidden')}
    />
  )
}
