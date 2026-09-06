import { useState, type FormEvent } from 'react'
import { FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'

export interface SecurityTabProps {
  vaultPath: string
  appInfo: {
    version: string
    electron: string
    dataDir: string
    portable: boolean
  } | null
}

export function SecurityTab({ vaultPath, appInfo }: SecurityTabProps) {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)

  const changePassword = async (event: FormEvent) => {
    event.preventDefault()
    if (next !== confirmation) {
      toast.push({ title: '確認用のパスワードが一致しません。', tone: 'danger' })
      return
    }
    setBusy(true)
    try {
      await window.sbm.vault.changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirmation('')
      toast.push({ title: 'マスターパスワードを変更しました', tone: 'success' })
    } catch (cause) {
      toast.push({
        title: '変更できませんでした',
        description: cause instanceof Error ? cause.message : undefined,
        tone: 'danger',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <span className="label-caps">master password</span>
        <form className="mt-2 grid grid-cols-3 gap-3" onSubmit={changePassword}>
          <Field label="current">
            <Input type="password" autoComplete="off" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="new">
            <Input type="password" autoComplete="off" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="confirm">
            <Input
              type="password"
              autoComplete="off"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
          <div className="col-span-3 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-400">
              変更するとヴォールト全体を新しい鍵で暗号化し直します。8 文字以上を指定してください。
            </p>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={busy || current.length === 0 || next.length < 8}
            >
              変更する
            </Button>
          </div>
        </form>
      </section>

      <section className="border-t border-white/[0.06] pt-4">
        <div className="flex items-center gap-2">
          <span className="label-caps">data folder</span>
          {appInfo?.portable ? (
            <span className="rounded bg-teal-500/10 px-1.5 py-0.5 text-xs text-teal-300">ポータブル動作中</span>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 font-mono text-xs text-slate-300">
            {appInfo?.dataDir ?? vaultPath}
          </p>
          <Button
            size="sm"
            icon={<FolderOpen className="h-3.5 w-3.5" />}
            onClick={() => void window.sbm.system.revealVault()}
          >
            開く
          </Button>
        </div>
        <div className="mt-2 space-y-1 text-xs text-slate-400">
          <p>
            このフォルダーに <span className="font-mono">vault.sbm</span>（AES-256-GCM で暗号化）、
            <span className="font-mono">settings.json</span>、<span className="font-mono">backups</span>{' '}
            が入ります。フォルダーごとコピーすれば、そのまま別の端末へ引っ越せます。
          </p>
          <p>
            exe と同じ場所に <span className="font-mono">portable.txt</span> という空ファイルを置くと、
            データを exe の隣の <span className="font-mono">SecretBookMarks-data</span> に保存する
            ポータブル動作へ切り替わります。
          </p>
          {appInfo ? (
            <p className="pt-1 font-mono text-xs text-slate-500">
              SecretBookMarks {appInfo.version} / Electron {appInfo.electron}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
