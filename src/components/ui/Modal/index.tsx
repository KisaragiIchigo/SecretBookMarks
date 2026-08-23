import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
}

const WIDTH = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
} as const

export function Modal({ open, onOpenChange, title, description, children, footer, width = 'md' }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-[2px] animate-fade-in" />
        <Dialog.Content
          className={cn(
            'surface-panel fixed left-1/2 top-1/2 z-50 w-[calc(100vw-4rem)] -translate-x-1/2 -translate-y-1/2',
            'rounded-2xl bg-ink-850/95 shadow-panel animate-scale-in',
            WIDTH[width],
          )}
        >
          <header className="flex items-start gap-3 border-b border-white/[0.06] px-5 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-display text-lg font-semibold tracking-tight text-slate-100">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-xs text-slate-400">{description}</Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              aria-label="閉じる"
              className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </header>

          <div className="max-h-[62vh] overflow-y-auto px-5 py-4">{children}</div>

          {footer ? (
            <footer className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-3.5">
              {footer}
            </footer>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
