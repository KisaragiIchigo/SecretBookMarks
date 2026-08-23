import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { cn } from '@/lib/cn'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  icon: ReactNode
  tone?: 'default' | 'danger' | 'accent'
  active?: boolean
}

const TONE = {
  default: 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]',
  danger: 'text-slate-400 hover:text-rose-300 hover:bg-rose-500/10',
  accent: 'text-teal-300 hover:text-teal-200 hover:bg-teal-500/10',
} as const

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, tone = 'default', active = false, className, ...props },
  ref,
) {
  return (
    <Tooltip.Root delayDuration={420}>
      <Tooltip.Trigger asChild>
        <button
          ref={ref}
          type="button"
          aria-label={label}
          className={cn(
            'no-drag inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
            'disabled:pointer-events-none disabled:opacity-30',
            active ? 'bg-teal-500/10 text-teal-300' : TONE[tone],
            className,
          )}
          {...props}
        >
          {icon}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={6}
          className="surface-panel z-[60] rounded-md px-2 py-1 text-xs text-slate-300 shadow-panel data-[state=delayed-open]:animate-fade-in"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
})
