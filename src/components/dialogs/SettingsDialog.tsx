import { useEffect, useState, type FormEvent } from 'react'
import { Eraser, Eye, FolderOpen, History, KeyRound, RefreshCw, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react'
import type {
  AdblockStatusView,
  AppSettings,
  CredentialHistoryView,
  CredentialSummary,
  FilterListInfo,
} from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { IconButton } from '@/components/ui/IconButton'
import { SwitchRow } from '@/components/ui/Switch'
import { useToast } from '@/components/ui/Toast'
import { formatDateTime } from '@/lib/format'

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
  const [ffmpeg, setFfmpeg] = useState<{ available: boolean; path: string | null } | null>(null)
  const [adblock, setAdblock] = useState<AdblockStatusView | null>(null)
  const [lists, setLists] = useState<FilterListInfo[]>([])
  const [credentials, setCredentials] = useState<CredentialSummary[]>([])
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [historyOf, setHistoryOf] = useState<{ id: string; entries: CredentialHistoryView[] } | null>(null)
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
    void window.sbm.downloads.ffmpegStatus().then(setFfmpeg)
    void window.sbm.adblock.status().then(setAdblock)
    void window.sbm.adblock.lists().then(setLists)
    void window.sbm.credentials.list().then(setCredentials)
    setRevealed({})
    setHistoryOf(null)
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
              label="ページからタグを自動で付ける"
              description="そのページのキーワード情報から最大5件を選び、確認なしでタグとして入力します。他のブックマークからタグを引き継ぐことはありません。"
              checked={settings.autoTagFromPage}
              onChange={(checked) => void onChange({ autoTagFromPage: checked })}
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
          <div className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5 text-teal-300" />
            <span className="label-caps flex-1">saved logins</span>
            <span className="font-mono text-xs text-slate-400">{credentials.length}</span>
          </div>

          {credentials.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">
              保存されたログイン情報はありません。内蔵ブラウザでログインすると、保存するかを確認します。
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {credentials.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-slate-300">{entry.origin}</p>
                    <p className="truncate text-sm text-slate-200">{entry.username || '(利用者名なし)'}</p>
                    {revealed[entry.id] ? (
                      <p className="mt-1 break-all font-mono text-xs text-teal-300">{revealed[entry.id]}</p>
                    ) : null}

                    {historyOf?.id === entry.id ? (
                      <ul className="mt-2 space-y-1 border-l border-white/[0.08] pl-2">
                        {historyOf.entries.length === 0 ? (
                          <li className="text-xs text-slate-400">以前のパスワードはありません。</li>
                        ) : (
                          historyOf.entries.map((item) => (
                            <li key={item.index} className="flex items-center gap-2">
                              <span className="flex-1 font-mono text-xs text-slate-400">
                                {formatDateTime(item.replacedAt)} まで使用
                              </span>
                              <button
                                type="button"
                                className="text-xs text-slate-300 transition-colors hover:text-teal-300"
                                onClick={() => {
                                  void window.sbm.credentials.revealHistory(entry.id, item.index).then((value) => {
                                    if (value) {
                                      setRevealed((current) => ({ ...current, [`${entry.id}:${item.index}`]: value }))
                                    }
                                  })
                                }}
                              >
                                表示
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs text-teal-300 transition-colors hover:text-teal-200"
                                onClick={() => {
                                  void window.sbm.credentials.restoreHistory(entry.id, item.index).then(() => {
                                    void window.sbm.credentials.list().then(setCredentials)
                                    setHistoryOf(null)
                                    setRevealed({})
                                    toast.push({ title: '以前のパスワードに戻しました', tone: 'success' })
                                  })
                                }}
                              >
                                <RotateCcw className="h-3 w-3" />
                                戻す
                              </button>
                              {revealed[`${entry.id}:${item.index}`] ? (
                                <span className="break-all font-mono text-xs text-teal-300">
                                  {revealed[`${entry.id}:${item.index}`]}
                                </span>
                              ) : null}
                            </li>
                          ))
                        )}
                      </ul>
                    ) : null}
                  </div>
                  {entry.historyCount > 0 ? (
                    <IconButton
                      label={`以前のパスワード（${entry.historyCount}件）`}
                      icon={<History className="h-3.5 w-3.5" />}
                      active={historyOf?.id === entry.id}
                      onClick={() => {
                        if (historyOf?.id === entry.id) {
                          setHistoryOf(null)
                          return
                        }
                        void window.sbm.credentials
                          .history(entry.id)
                          .then((entries) => setHistoryOf({ id: entry.id, entries }))
                      }}
                    />
                  ) : null}
                  <IconButton
                    label="パスワードを表示"
                    icon={<Eye className="h-3.5 w-3.5" />}
                    onClick={() => {
                      void window.sbm.credentials.reveal(entry.id).then((found) => {
                        if (found) setRevealed((current) => ({ ...current, [entry.id]: found.password }))
                      })
                    }}
                  />
                  <IconButton
                    label="削除"
                    tone="danger"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => {
                      void window.sbm.credentials.remove(entry.id).then(() => {
                        setCredentials((current) => current.filter((item) => item.id !== entry.id))
                        toast.push({ title: 'ログイン情報を削除しました' })
                      })
                    }}
                  />
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-xs text-slate-400">
            パスワードはマスターパスワードから導いた鍵で個別に暗号化され、ヴォールトの中でも
            そのままの文字列では保持されません。表示を選んだときだけ復号します。
          </p>
          <p className="mt-1.5 text-xs text-slate-400">
            同じサイトと利用者名で保存し直すと、新しいパスワードで置き換わります。
            置き換え前のものは最大 5 件まで履歴に残るため、打ち間違えても戻せます。
          </p>
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
            <ShieldCheck className="h-3.5 w-3.5 text-teal-300" />
            <span className="label-caps flex-1">ad blocker</span>
            {adblock ? (
              <span className="font-mono text-xs text-slate-400">
                {adblock.updating ? '更新中…' : adblock.ready ? `${adblock.listCount} リスト適用中` : '未取得'}
              </span>
            ) : null}
          </div>

          <div className="mt-1 divide-y divide-white/[0.06]">
            <SwitchRow
              label="広告とトラッカーをブロックする"
              description="内蔵ブラウザに対して、下記のフィルターリストを適用します。"
              checked={settings.adBlockEnabled}
              onChange={(checked) => {
                void onChange({ adBlockEnabled: checked })
                void window.sbm.adblock.setEnabled(checked).then(setAdblock)
              }}
            />
          </div>

          <ul className="mt-2 grid gap-1 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5">
            {lists.map((list) => (
              <li key={list.id} className="flex items-center gap-2 text-xs text-slate-300">
                <span className="h-1 w-1 shrink-0 rounded-full bg-teal-400" />
                <span className="truncate">{list.title}</span>
              </li>
            ))}
          </ul>

          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              {adblock?.updatedAt
                ? `最終更新: ${new Date(adblock.updatedAt).toLocaleString('ja-JP')}`
                : 'フィルターは初回起動時に取得し、3日ごとに更新します。'}
            </p>
            <Button
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              disabled={adblock?.updating}
              onClick={() => {
                toast.push({ title: 'フィルターを更新しています…' })
                void window.sbm.adblock.update().then((status) => {
                  setAdblock(status)
                  toast.push({ title: 'フィルターを更新しました', tone: 'success' })
                })
              }}
            >
              今すぐ更新
            </Button>
          </div>
        </section>

        <section>
          <span className="label-caps">browser &amp; download</span>
          <div className="mt-1 divide-y divide-white/[0.06]">
            <SwitchRow
              label="ブラウザの Cookie をヴォールトに保存する"
              description="内蔵ブラウザは痕跡をディスクに残さない設定で動きます。ログイン状態を保ちたい場合のみ、暗号化してヴォールト内に保存します。"
              checked={settings.saveBrowserCookies}
              onChange={(checked) => void onChange({ saveBrowserCookies: checked })}
            />
          </div>

          <div className="mt-3 grid gap-3">
            <Field label="home page" hint="内蔵ブラウザで新しいタブを開いたときに表示するページです。">
              <Input
                value={settings.browserHomeUrl}
                onChange={(event) => void onChange({ browserHomeUrl: event.target.value })}
                spellCheck={false}
                className="font-mono"
              />
            </Field>

            <div>
              <span className="label-caps">download folder</span>
              <div className="mt-1.5 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 font-mono text-xs text-slate-300">
                  {settings.downloadDir ?? '（OS の既定のダウンロードフォルダー）'}
                </p>
                <Button
                  size="sm"
                  icon={<FolderOpen className="h-3.5 w-3.5" />}
                  onClick={() => {
                    void window.sbm.downloads.chooseDir().then((next) => {
                      if (next) void onChange({ downloadDir: next.downloadDir })
                    })
                  }}
                >
                  選ぶ
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-slate-200">
                  ffmpeg{' '}
                  <span className={ffmpeg?.available ? 'text-emerald-300' : 'text-amber-300'}>
                    {ffmpeg?.available ? '利用できます' : '見つかりません'}
                  </span>
                </p>
                <p className="mt-1 truncate font-mono text-xs text-slate-400">
                  {ffmpeg?.path ?? 'ストリーミング動画（m3u8）の保存に必要です。'}
                </p>
              </div>
              <Button
                size="sm"
                icon={<Eraser className="h-3.5 w-3.5" />}
                onClick={() => {
                  void window.sbm.browser.clearData().then(() =>
                    toast.push({ title: '閲覧データを消しました', tone: 'success' }),
                  )
                }}
              >
                閲覧データを消す
              </Button>
            </div>
          </div>
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
