import * as RadixSwitch from '@radix-ui/react-switch'
import { cn } from '@/lib/cn'

export interface SwitchRowProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description: string
}

export function SwitchRow({ checked, onChange, label, description }: SwitchRowProps) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-200">{label}</p>
        <p className="mt-1 text-xs text-slate-400">{description}</p>
      </div>
      <RadixSwitch.Root
        checked={checked}
        onCheckedChange={onChange}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full border transition-colors',
          checked
            ? 'border-teal-500/40 bg-teal-500/25 shadow-glow'
            : 'border-white/[0.08] bg-black/40 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]',
        )}
      >
        <RadixSwitch.Thumb
          className={cn(
            'block h-3.5 w-3.5 translate-x-1 rounded-full bg-slate-300 transition-transform duration-150 ease-smooth',
            'data-[state=checked]:translate-x-[1.125rem] data-[state=checked]:bg-teal-200',
          )}
        />
      </RadixSwitch.Root>
    </div>
  )
}
