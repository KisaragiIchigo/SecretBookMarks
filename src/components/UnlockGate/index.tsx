import { useEffect, useRef, useState, type FormEvent } from 'react'
import { m } from 'framer-motion'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { useVault } from '@/state/VaultProvider'

const MIN_PASSWORD_LENGTH = 8

export function UnlockGate() {
  const { phase, unlock, createVault, vaultPath, lockReason } = useVault()
  const isSetup = phase === 'setup'
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [isSetup])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (isSetup) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`パスワードは ${MIN_PASSWORD_LENGTH} 文字以上にしてください。`)
        return
      }
      if (password !== confirmation) {
        setError('確認用のパスワードが一致しません。')
        return
      }
    }

    setBusy(true)
    try {
      if (isSetup) await createVault(password)
      else await unlock(password)
      setPassword('')
      setConfirmation('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid flex-1 place-items-center px-6 py-10">
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="surface-panel w-full max-w-md rounded-2xl bg-ink-850/60 p-7 shadow-panel"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-teal-600 via-emerald-600 to-emerald-700 shadow-glow">
            {isSetup ? <ShieldCheck className="h-4 w-4 text-white" /> : <KeyRound className="h-4 w-4 text-white" />}
          </span>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-slate-100">
              {isSetup ? 'ヴォールトを作成' : 'ヴォールトを開く'}
            </h1>
            <p className="mt-0.5 text-xs text-slate-400">
              {isSetup
                ? 'マスターパスワードでこの端末のブックマークを暗号化します。'
                : 'マスターパスワードを入力してください。'}
            </p>
          </div>
        </div>

        {lockReason === 'idle' ? (
          <p className="mt-5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            一定時間操作がなかったため、自動的にロックしました。
          </p>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <Field label="master password">
            <Input
              ref={inputRef}
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </Field>

          {isSetup ? (
            <Field
              label="confirm"
              hint="パスワードは復旧できません。パスワードマネージャー等で必ず控えてください。"
            >
              <Input
                type="password"
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="••••••••"
              />
            </Field>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" className="w-full" disabled={busy || password.length === 0}>
            {busy ? '処理中…' : isSetup ? 'ヴォールトを作成する' : 'ロックを解除する'}
          </Button>
        </form>

        <p className="mt-6 break-all font-mono text-xs text-slate-400">{vaultPath}</p>
      </m.div>
    </div>
  )
}
