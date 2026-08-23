import { useEffect } from 'react'

export interface HotkeyHandlers {
  onPalette: () => void
  onAdd: () => void
  onSearch: () => void
  onSelectAll: () => void
  onDelete: () => void
  onLock: () => void
  onEscape: () => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

/** アプリ全体のキーボード操作。入力欄にフォーカスがある間は破壊的な単独キーを無効化する。 */
export function useAppHotkeys(handlers: HotkeyHandlers, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      const typing = isTypingTarget(event.target)
      const mod = event.ctrlKey || event.metaKey

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        handlers.onPalette()
        return
      }
      if (mod && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        handlers.onAdd()
        return
      }
      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        handlers.onSearch()
        return
      }
      if (mod && event.key.toLowerCase() === 'l') {
        event.preventDefault()
        handlers.onLock()
        return
      }
      if (mod && event.key.toLowerCase() === 'a' && !typing) {
        event.preventDefault()
        handlers.onSelectAll()
        return
      }
      if (event.key === 'Delete' && !typing) {
        event.preventDefault()
        handlers.onDelete()
        return
      }
      if (event.key === 'Escape') {
        handlers.onEscape()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, handlers])
}
