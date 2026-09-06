import { useState } from 'react'
import { Ban, Plus, RefreshCw, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react'
import type { AdblockStatusView, AppSettings, FilterListInfo } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SwitchRow } from '@/components/ui/Switch'
import { useToast } from '@/components/ui/Toast'

export interface AdblockTabProps {
  settings: AppSettings
  adblock: AdblockStatusView | null
  lists: FilterListInfo[]
  setAdblock: (status: AdblockStatusView | null) => void
  onChange: (patch: Partial<AppSettings>) => Promise<void>
}

export function AdblockTab({ settings, adblock, lists, setAdblock, onChange }: AdblockTabProps) {
  const toast = useToast()
  const [allowInput, setAllowInput] = useState('')
  const [blockInput, setBlockInput] = useState('')

  return (
    <div className="space-y-6">
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

        <ul className="mt-2 grid grid-cols-2 gap-1.5 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5">
          {lists.map((list) => (
            <li key={list.id} className="flex items-center gap-2 text-xs text-slate-300">
              <span className="h-1 w-1 shrink-0 rounded-full bg-teal-400" />
              <span className="truncate">{list.title}</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center justify-between gap-3">
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

      <section className="border-t border-white/[0.06] pt-4">
        <div className="flex items-center gap-2">
          <ShieldOff className="h-3.5 w-3.5 text-amber-300" />
          <span className="label-caps flex-1">除外するサイト</span>
          <span className="font-mono text-xs text-slate-400">{settings.adBlockAllowlist.length}</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          ここに入れたサイトでは広告ブロックを適用しません。ログインが通らない場合などに追加してください。
        </p>

        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const value = allowInput.trim()
            if (!value) return
            void window.sbm.adblock
              .setAllowlist([...settings.adBlockAllowlist, value])
              .then((next) => {
                void onChange({ adBlockAllowlist: next })
                setAllowInput('')
                void window.sbm.adblock.status().then(setAdblock)
              })
          }}
        >
          <Input
            value={allowInput}
            onChange={(event) => setAllowInput(event.target.value)}
            placeholder="example.com または https://example.com/..."
            spellCheck={false}
            className="font-mono"
          />
          <Button type="submit" size="md" icon={<Plus className="h-3.5 w-3.5" />} className="shrink-0">
            追加
          </Button>
        </form>

        {settings.adBlockAllowlist.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {settings.adBlockAllowlist.map((host) => (
              <li
                key={host}
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 py-1 pl-2 pr-1 text-xs text-amber-300"
              >
                <span className="font-mono">{host}</span>
                <button
                  type="button"
                  aria-label={`${host} を除外から外す`}
                  className="text-amber-400/70 transition-colors hover:text-rose-300"
                  onClick={() => {
                    void window.sbm.adblock
                      .setAllowlist(settings.adBlockAllowlist.filter((entry) => entry !== host))
                      .then((next) => {
                        void onChange({ adBlockAllowlist: next })
                        void window.sbm.adblock.status().then(setAdblock)
                      })
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="border-t border-white/[0.06] pt-4">
        <div className="flex items-center gap-2">
          <Ban className="h-3.5 w-3.5 text-rose-300" />
          <span className="label-caps flex-1">常にブロックするドメイン</span>
          <span className="font-mono text-xs text-slate-400">{settings.adBlockUserBlocklist.length}</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          フィルターに載っていない配信元を自分で止められます。除外サイトより優先されます。
        </p>

        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const value = blockInput.trim()
            if (!value) return
            void window.sbm.adblock
              .setUserBlocklist([...settings.adBlockUserBlocklist, value])
              .then((next) => {
                void onChange({ adBlockUserBlocklist: next })
                setBlockInput('')
                void window.sbm.adblock.status().then(setAdblock)
              })
          }}
        >
          <Input
            value={blockInput}
            onChange={(event) => setBlockInput(event.target.value)}
            placeholder="ads.example.com"
            spellCheck={false}
            className="font-mono"
          />
          <Button type="submit" size="md" icon={<Plus className="h-3.5 w-3.5" />} className="shrink-0">
            追加
          </Button>
        </form>

        {settings.adBlockUserBlocklist.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {settings.adBlockUserBlocklist.map((host) => (
              <li
                key={host}
                className="inline-flex items-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/10 py-1 pl-2 pr-1 text-xs text-rose-300"
              >
                <span className="font-mono">{host}</span>
                <button
                  type="button"
                  aria-label={`${host} のブロックを解除`}
                  className="text-rose-400/70 transition-colors hover:text-slate-200"
                  onClick={() => {
                    void window.sbm.adblock
                      .setUserBlocklist(settings.adBlockUserBlocklist.filter((entry) => entry !== host))
                      .then((next) => {
                        void onChange({ adBlockUserBlocklist: next })
                        void window.sbm.adblock.status().then(setAdblock)
                      })
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  )
}
