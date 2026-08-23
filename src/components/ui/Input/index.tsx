import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const FIELD_BASE =
  'w-full rounded-lg border border-white/[0.06] bg-black/40 px-3 text-sm text-slate-200 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)] ' +
  'placeholder:text-slate-500 transition-colors focus:border-teal-500/50 focus:outline-none disabled:opacity-40'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leading?: ReactNode
  trailing?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leading, trailing, className, ...props },
  ref,
) {
  if (!leading && !trailing) {
    return <input ref={ref} className={cn(FIELD_BASE, 'h-9', className)} {...props} />
  }
  return (
    <div className="relative flex items-center">
      {leading ? <span className="pointer-events-none absolute left-3 text-slate-400">{leading}</span> : null}
      <input ref={ref} className={cn(FIELD_BASE, 'h-9', leading && 'pl-9', trailing && 'pr-9', className)} {...props} />
      {trailing ? <span className="absolute right-2 flex items-center">{trailing}</span> : null}
    </div>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(FIELD_BASE, 'resize-none py-2 leading-relaxed', className)} {...props} />
  },
)

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="label-caps">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1.5 text-xs text-slate-400">{hint}</p> : null}
    </label>
  )
}
