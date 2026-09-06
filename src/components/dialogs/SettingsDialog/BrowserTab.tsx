import { Eraser, FolderOpen } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SwitchRow } from '@/components/ui/Switch'
import { useToast } from '@/components/ui/Toast'

export interface BrowserTabProps {
  settings: AppSettings
  ffmpeg: { available: boolean; path: string | null } | null
  onChange: (patch: Partial<AppSettings>) => Promise<void>
}

export function BrowserTab({ settings, ffmpeg, onChange }: BrowserTabProps) {
  const toast = useToast()

  return (
    <div className="space-y-6">
      <section>
        <span className="label-caps">browser settings</span>
        <div className="mt-1 divide-y divide-white/[0.06]">
          <SwitchRow
            label="ブラウザの Cookie をヴォールトに保存する"
            description="内蔵ブラウザは痕跡をディスクに残さない設定で動きます。ログイン状態を保ちたい場合のみ、暗号化してヴォールト内に保存します。"
            checked={settings.saveBrowserCookies}
            onChange={(checked) => void onChange({ saveBrowserCookies: checked })}
          />
        </div>

        <div className="mt-3">
          <Field label="home page" hint="内蔵ブラウザで新しいタブを開いたときに表示するページです。">
            <Input
              value={settings.browserHomeUrl}
              onChange={(event) => void onChange({ browserHomeUrl: event.target.value })}
              spellCheck={false}
              className="font-mono"
            />
          </Field>
        </div>
      </section>

      <section className="border-t border-white/[0.06] pt-4">
        <span className="label-caps">download folder &amp; tools</span>
        <div className="mt-2 space-y-3">
          <div>
            <div className="flex items-center gap-2">
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
                {ffmpeg?.path ?? 'ストリーミング動画（m3u8）の保存や結合に必要です。'}
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

      <section className="border-t border-white/[0.06] pt-4">
        <span className="label-caps">album download options</span>
        <div className="mt-1 divide-y divide-white/[0.06]">
          <SwitchRow
            label="動画は動画で全部くっつけてからDLする"
            description="アルバム内の動画ファイルを1本の動画（MP4）に結合してアルバムフォルダー内に保存します。"
            checked={settings.albumConcatVideos}
            onChange={(checked) => {
              const nextConcat = checked
              const nextSlideshow = settings.albumCreateSlideshow
              void onChange({
                albumConcatVideos: nextConcat,
                albumGenerateBoth: nextConcat && nextSlideshow,
              })
            }}
          />
          <SwitchRow
            label="画像だけくっつけた動画にする（1コマ3秒）"
            description="アルバム内の静止画を1枚3秒のスライドショー動画（MP4・1080p）にまとめて保存します。"
            checked={settings.albumCreateSlideshow}
            onChange={(checked) => {
              const nextSlideshow = checked
              const nextConcat = settings.albumConcatVideos
              void onChange({
                albumCreateSlideshow: nextSlideshow,
                albumGenerateBoth: nextConcat && nextSlideshow,
              })
            }}
          />
          <SwitchRow
            label="その両方を生成する"
            description="動画の結合と静止画スライドショー動画の両方を同時に生成します。"
            checked={settings.albumGenerateBoth}
            onChange={(checked) => {
              void onChange({
                albumConcatVideos: checked,
                albumCreateSlideshow: checked,
                albumGenerateBoth: checked,
              })
            }}
          />
        </div>
        <div className="mt-3">
          <Field label="slideshow duration" hint="スライドショー動画の1コマあたりの表示秒数です。">
            <Select
              value={String(settings.albumSlideshowDuration ?? 3)}
              onChange={(value) => void onChange({ albumSlideshowDuration: Number(value) })}
              options={[
                { value: '1', label: '1 秒' },
                { value: '2', label: '2 秒' },
                { value: '3', label: '3 秒（既定）' },
                { value: '5', label: '5 秒' },
                { value: '10', label: '10 秒' },
              ]}
              ariaLabel="スライドショーの1コマ表示秒数"
              className="w-full"
            />
          </Field>
        </div>
      </section>
    </div>
  )
}
