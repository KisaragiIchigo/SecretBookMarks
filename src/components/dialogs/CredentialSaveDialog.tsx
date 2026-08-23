import { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { CredentialCapture, CredentialSummary } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { formatDateTime } from '@/lib/format'

export interface CredentialSaveDialogProps {
  capture: CredentialCapture | null
  onClose: () => void
  onSaved: () => void
}

/** ログインフォームの送信を検知したときに、保存するかを確認する。 */
export function CredentialSaveDialog({ capture, onClose, onSaved }: CredentialSaveDialogProps) {
  const [username, setUsername] = useState('')
  const [existing, setExisting] = useState<CredentialSummary | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setUsername(capture?.username ?? '')
    setExisting(null)
  }, [capture])

  // 同じサイト・同じ利用者名の登録があるかを調べ、上書きになることを明示する。
  useEffect(() => {
    if (!capture?.origin) return
    let cancelled = false
    void window.sbm.credentials
      .forOrigin(capture.origin)
      .then((list) => {
        if (cancelled) return
        setExisting(list.find((entry) => entry.username === username) ?? null)
      })
      .catch(() => setExisting(null))
    return () => {
      cancelled = true
    }
  }, [capture?.origin, username])

  if (!capture) return null

  const isUpdate = existing !== null

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
      title={isUpdate ? 'パスワードを更新しますか？' : 'ログイン情報を保存しますか？'}
      description={
        isUpdate
          ? '既に保存されている情報を置き換えます。置き換え前のパスワードは履歴に残ります。'
          : '保存するとヴォールト内で暗号化されます。保存しない場合は何も残りません。'
      }
      width="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            保存しない
          </Button>
          <Button
            variant="primary"
            icon={<KeyRound className="h-3.5 w-3.5" />}
            onClick={() => void save()}
            disabled={busy}
          >
            {busy ? '保存中…' : isUpdate ? '更新する' : '保存する'}
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

        {isUpdate && existing ? (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              このサイトには {formatDateTime(existing.updatedAt)} に保存した情報があります。
              入力を間違えたまま更新しても、設定の一覧から以前のパスワードへ戻せます。
            </span>
          </p>
        ) : null}

        {capture.multiplePasswordFields ? (
          <p className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-slate-300">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>
              パスワード欄が複数ありました。変更や新規登録の画面と判断して、確認欄と一致する方を選んでいます。
              意図と違う場合は保存しないでください。
            </span>
          </p>
        ) : null}

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
