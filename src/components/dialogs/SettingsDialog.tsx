import { useEffect, useState, type FormEvent } from 'react'
import { FolderOpen } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SwitchRow } from '@/components/ui/Switch'
import { useToast } from '@/components/ui/Toast'

export interface SettingsDialogProps {
  open: boolean
  settings: AppSettings
  vaultPath: string
  onClose: () => void
  onChange: (patch: Partial<AppSettings>) => Promise<void>
}

const AUTO_LOCK_OPTIONS = [
  { value: '0', label: '自動ロックしない' },
  { value: '5', label: '5 分' },
  { value: '15', label: '15 分' },
  { value: '30', label: '30 分' },
  { value: '60', label: '60 分' },
]

const TRASH_OPTIONS = [
  { value: '0', label: '自動削除しない' },
  { value: '7', label: '7 日' },
  { value: '30', label: '30 日' },
  { value: '90', label: '90 日' },
]

export function SettingsDialog({ open, settings, vaultPath, onClose, onChange }: SettingsDialogProps) {
  const toast = useToast()
  const [appInfo, setAppInfo] = useState<{
    version: string
    electron: string
    dataDir: string
    portable: boolean
  } | null>(null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setCurrent('')
    setNext('')
    setConfirmation('')
    void window.sbm.system.appInfo().then(setAppInfo)
  }, [open])

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
      toast.push({ title: '変更できませんでした', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !value && onClose()}
      title="設定"
      description="変更は即時に保存されます。"
      footer={<Button onClick={onClose}>閉じる</Button>}
    >
      <div className="space-y-6">
        <section>
          <span className="label-caps">capture</span>
          <div className="mt-1 divide-y divide-white/[0.06]">
            <SwitchRow
              label="クリップボード監視"
              description="コピーした URL を検知して、取り込みダイアログを自動で開きます。"
              checked={settings.clipboardWatch}
              onChange={(checked) => void onChange({ clipboardWatch: checked })}
            />
            <SwitchRow
              label="タイトルの自動取得"
              description="登録時にページへアクセスして、タイトルを取得します。"
              checked={settings.fetchTitles}
              onChange={(checked) => void onChange({ fetchTitles: checked })}
            />
            <SwitchRow
              label="ファビコンの取得"
              description="ドメインごとにアイコンを取得し、ヴォールト内に暗号化して保存します。"
              checked={settings.fetchFavicons}
              onChange={(checked) => void onChange({ fetchFavicons: checked })}
            />
            <SwitchRow
              label="同じサイトのタグを引き継ぐ"
              description="同じドメインのブックマークの半数以上に付いているタグを、追加時に自動で入力します。"
              checked={settings.inheritDomainTags}
              onChange={(checked) => void onChange({ inheritDomainTags: checked })}
            />
            <SwitchRow
              label="閉じるボタンでトレイに常駐"
              description="ウィンドウを閉じても常駐し、クリップボード監視を続けます。"
              checked={settings.minimizeToTray}
              onChange={(checked) => void onChange({ minimizeToTray: checked })}
            />
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <Field label="auto lock" hint="無操作がこの時間続くとロックします。">
            <Select
              value={String(settings.autoLockMinutes)}
              onChange={(value) => void onChange({ autoLockMinutes: Number(value) })}
              options={AUTO_LOCK_OPTIONS}
              ariaLabel="自動ロックまでの時間"
              className="w-full"
            />
          </Field>
          <Field label="trash retention" hint="ゴミ箱の項目を完全に削除するまでの日数です。">
            <Select
              value={String(settings.trashRetentionDays)}
              onChange={(value) => void onChange({ trashRetentionDays: Number(value) })}
              options={TRASH_OPTIONS}
              ariaLabel="ゴミ箱の保持期間"
              className="w-full"
            />
          </Field>
        </section>

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

        <section>
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
          <p className="mt-2 text-xs text-slate-400">
            このフォルダーに <span className="font-mono">vault.sbm</span>（AES-256-GCM で暗号化）、
            <span className="font-mono">settings.json</span>、<span className="font-mono">backups</span>{' '}
            が入ります。フォルダーごとコピーすれば、そのまま別の端末へ引っ越せます。
          </p>
          <p className="mt-1.5 text-xs text-slate-400">
            exe と同じ場所に <span className="font-mono">portable.txt</span> という空ファイルを置くと、
            データを exe の隣の <span className="font-mono">SecretBookMarks-data</span> に保存する
            ポータブル動作へ切り替わります。
          </p>
          {appInfo ? (
            <p className="mt-2 font-mono text-xs text-slate-400">
              SecretBookMarks {appInfo.version} / Electron {appInfo.electron}
            </p>
          ) : null}
        </section>
      </div>
    </Modal>
  )
}
