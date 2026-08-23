import * as RadixSelect from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

export interface SelectProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: SelectOption<T>[]
  ariaLabel: string
  className?: string
}

export function Select<T extends string>({ value, onChange, options, ariaLabel, className }: SelectProps<T>) {
  return (
    <RadixSelect.Root value={value} onValueChange={(next) => onChange(next as T)}>
      <RadixSelect.Trigger
        aria-label={ariaLabel}
        className={cn(
          'no-drag inline-flex h-9 items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/40 px-3',
          'text-sm text-slate-300 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)] transition-colors hover:text-slate-100',
          'focus:border-teal-500/50 focus:outline-none',
          className,
        )}
      >
        <RadixSelect.Value />
        <RadixSelect.Icon>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className="surface-panel z-[60] overflow-hidden rounded-lg bg-ink-850/95 shadow-panel animate-fade-in"
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                className={cn(
                  'flex cursor-default select-none items-center justify-between gap-6 rounded-md px-2.5 py-1.5 text-sm text-slate-300',
                  'outline-none data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-slate-100',
                  'data-[state=checked]:text-teal-300',
                )}
              >
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator>
                  <Check className="h-3.5 w-3.5" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
