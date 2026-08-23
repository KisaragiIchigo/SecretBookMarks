import { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import type { CredentialCapture } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

export interface CredentialSaveDialogProps {
  capture: CredentialCapture | null
  onClose: () => void
  onSaved: () => void
}

/** ログインフォームの送信を検知したときに、保存するかを確認する。 */
export function CredentialSaveDialog({ capture, onClose, onSaved }: CredentialSaveDialogProps) {
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setUsername(capture?.username ?? '')
  }, [capture])

  if (!capture) return null

  const save = async () => {
    setBusy(true)
    try {
      await window.sbm.credentials.save(capture.origin, username, capture.password)
      onSaved()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={(next) => !next && onClose()}
      title="ログイン情報を保存しますか？"
      description="保存するとヴォールト内で暗号化されます。保存しない場合は何も残りません。"
      width="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            保存しない
          </Button>
          <Button variant="primary" icon={<KeyRound className="h-3.5 w-3.5" />} onClick={() => void save()} disabled={busy}>
            {busy ? '保存中…' : '保存する'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <span className="label-caps">site</span>
          <p className="mt-1.5 break-all rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 font-mono text-xs text-slate-300">
            {capture.origin}
          </p>
        </div>

        <Field label="user">
          <Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" />
        </Field>

        <div>
          <span className="label-caps">password</span>
          <p className="mt-1.5 rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 font-mono text-sm text-slate-300">
            {'•'.repeat(Math.min(capture.password.length, 24))}
          </p>
        </div>

        <p className="flex items-start gap-2 text-xs text-teal-300">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            パスワードはマスターパスワードから導いた鍵で個別に暗号化され、ヴォールトの中でも
            そのままの文字列では保持されません。
          </span>
        </p>
      </div>
    </Modal>
  )
}
