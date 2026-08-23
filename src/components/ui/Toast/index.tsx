import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import * as RadixToast from '@radix-ui/react-toast'
import { AnimatePresence, m } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '@/lib/cn'

export type ToastTone = 'info' | 'success' | 'danger'

interface ToastItem {
  id: number
  title: string
  description?: string
  tone: ToastTone
}

interface ToastContextValue {
  push: (toast: { title: string; description?: string; tone?: ToastTone }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TONE_STYLE: Record<ToastTone, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: 'text-teal-300' },
  success: { icon: CheckCircle2, className: 'text-emerald-300' },
  danger: { icon: AlertTriangle, className: 'text-rose-300' },
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('ToastProvider の外側で useToast は使えません。')
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback<ToastContextValue['push']>((toast) => {
    setItems((current) => [...current, { id: Date.now() + Math.random(), tone: 'info', ...toast }])
  }, [])

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider duration={4200} swipeDirection="right">
        {children}
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const tone = TONE_STYLE[item.tone]
            const Icon = tone.icon
            return (
              <RadixToast.Root
                key={item.id}
                asChild
                forceMount
                onOpenChange={(open) => {
                  if (!open) dismiss(item.id)
                }}
              >
                <m.li
                  layout
                  initial={{ opacity: 0, x: 24, scale: 0.98 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 24, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="surface-panel pointer-events-auto flex w-80 items-start gap-3 rounded-xl px-4 py-3 shadow-panel"
                >
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone.className)} />
                  <div className="min-w-0 flex-1">
                    <RadixToast.Title className="text-sm font-medium text-slate-200">{item.title}</RadixToast.Title>
                    {item.description ? (
                      <RadixToast.Description className="mt-1 text-xs text-slate-400">
                        {item.description}
                      </RadixToast.Description>
                    ) : null}
                  </div>
                </m.li>
              </RadixToast.Root>
            )
          })}
        </AnimatePresence>
        <RadixToast.Viewport className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-auto list-none flex-col gap-2 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  )
}
