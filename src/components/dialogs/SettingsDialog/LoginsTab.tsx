import { useState } from 'react'
import { Eye, History, KeyRound, RotateCcw, Trash2 } from 'lucide-react'
import type { CredentialHistoryView, CredentialSummary } from '@shared/types'
import { IconButton } from '@/components/ui/IconButton'
import { useToast } from '@/components/ui/Toast'
import { formatDateTime } from '@/lib/format'

export interface LoginsTabProps {
  credentials: CredentialSummary[]
  setCredentials: React.Dispatch<React.SetStateAction<CredentialSummary[]>>
}

export function LoginsTab({ credentials, setCredentials }: LoginsTabProps) {
  const toast = useToast()
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [historyOf, setHistoryOf] = useState<{ id: string; entries: CredentialHistoryView[] } | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-3.5 w-3.5 text-teal-300" />
        <span className="label-caps flex-1">saved logins</span>
        <span className="font-mono text-xs text-slate-400">{credentials.length} 件</span>
      </div>

      {credentials.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-6 text-center">
          <p className="text-sm text-slate-400">
            保存されたログイン情報はありません。
          </p>
          <p className="mt-1 text-xs text-slate-500">
            内蔵ブラウザでログインすると、保存するかを確認します。
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
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

      <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3 text-xs text-slate-400 space-y-1.5">
        <p>
          パスワードはマスターパスワードから導いた鍵で個別に暗号化され、ヴォールトの中でも
          そのままの文字列では保持されません。表示を選んだときだけ復号します。
        </p>
        <p>
          同じサイトと利用者名で保存し直すと新しいパスワードで置き換わりますが、
          置き換え前のものは最大 5 件まで履歴に残るため、打ち間違えても戻せます。
        </p>
      </div>
    </div>
  )
}
