import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { m } from 'framer-motion'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'ghost' | 'outline' | 'danger'
type Size = 'sm' | 'md'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
}

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-teal-600 via-emerald-600 to-emerald-700 text-white shadow-glow hover:brightness-110',
  ghost: 'text-slate-300 hover:bg-white/[0.05] hover:text-slate-100',
  outline: 'border border-white/[0.08] bg-white/[0.02] text-slate-300 hover:border-teal-500/40 hover:text-slate-100',
  danger: 'border border-rose-500/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15',
}

const SIZE: Record<Size, string> = {
  sm: 'h-7 gap-1.5 px-2.5 text-xs',
  md: 'h-9 gap-2 px-3.5 text-sm',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'md', icon, className, children, ...props },
  ref,
) {
  return (
    <m.button
      ref={ref}
      whileHover={props.disabled ? undefined : { scale: 1.01 }}
      whileTap={props.disabled ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'no-drag inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </m.button>
  )
})
