import type { AppSettings } from '@shared/types'
import { Field } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SwitchRow } from '@/components/ui/Switch'

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

export interface GeneralTabProps {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => Promise<void>
}

export function GeneralTab({ settings, onChange }: GeneralTabProps) {
  return (
    <div className="space-y-6">
      <section>
        <span className="label-caps">capture &amp; behavior</span>
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
            label="最小化でタスクトレイに入れる"
            description="最小化したときにタスクバーから消し、トレイに常駐させます。クリップボード監視は続きます。閉じるボタンでは常にアプリを終了します。"
            checked={settings.minimizeToTray}
            onChange={(checked) => void onChange({ minimizeToTray: checked })}
          />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-4">
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
    </div>
  )
}
