import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { Globe, KeyRound, Lock, ShieldCheck, Sliders } from 'lucide-react'
import type {
  AdblockStatusView,
  AppSettings,
  CredentialSummary,
  FilterListInfo,
} from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'
import { GeneralTab } from './GeneralTab'
import { BrowserTab } from './BrowserTab'
import { AdblockTab } from './AdblockTab'
import { LoginsTab } from './LoginsTab'
import { SecurityTab } from './SecurityTab'
import type { SettingsTabId } from './types'

export interface SettingsDialogProps {
  open: boolean
  settings: AppSettings
  vaultPath: string
  onClose: () => void
  onChange: (patch: Partial<AppSettings>) => Promise<void>
}

interface TabDefinition {
  id: SettingsTabId
  label: string
  icon: typeof Sliders
}

const TABS: TabDefinition[] = [
  { id: 'general', label: '一般・取り込み', icon: Sliders },
  { id: 'browser', label: 'ブラウザ & 保存', icon: Globe },
  { id: 'adblock', label: '広告ブロック', icon: ShieldCheck },
  { id: 'logins', label: 'ログイン情報', icon: KeyRound },
  { id: 'security', label: 'セキュリティ・データ', icon: Lock },
]

export function SettingsDialog({ open, settings, vaultPath, onClose, onChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general')
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

  useEffect(() => {
    if (!open) return
    void window.sbm.system.appInfo().then(setAppInfo)
    void window.sbm.downloads.ffmpegStatus().then(setFfmpeg)
    void window.sbm.adblock.status().then(setAdblock)
    void window.sbm.adblock.lists().then(setLists)
    void window.sbm.credentials.list().then(setCredentials)
  }, [open])

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !value && onClose()}
      title="設定"
      description="変更は即時に保存されます。"
      width="lg"
      footer={<Button onClick={onClose}>閉じる</Button>}
    >
      <div className="flex flex-col">
        {/* タブバー */}
        <div className="mb-4 flex items-center gap-1 border-b border-white/[0.06] pb-2.5 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isCurrent = activeTab === tab.id
            const badgeCount = tab.id === 'logins' ? credentials.length : undefined

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isCurrent}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors',
                  isCurrent ? 'text-teal-200' : 'text-slate-400 hover:text-slate-200',
                )}
              >
                {isCurrent && (
                  <m.span
                    layoutId="settings-tab-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-lg bg-teal-500/15 shadow-glow"
                  />
                )}
                <Icon className="relative h-3.5 w-3.5" />
                <span className="relative">{tab.label}</span>
                {badgeCount !== undefined && badgeCount > 0 && (
                  <span className="relative ml-0.5 rounded-full bg-teal-500/20 px-1.5 py-0.2 font-mono text-[10px] text-teal-300">
                    {badgeCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* タブパネル本体 */}
        <div className="min-h-[380px]">
          <AnimatePresence mode="wait">
            <m.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            >
              {activeTab === 'general' && (
                <GeneralTab settings={settings} onChange={onChange} />
              )}
              {activeTab === 'browser' && (
                <BrowserTab settings={settings} ffmpeg={ffmpeg} onChange={onChange} />
              )}
              {activeTab === 'adblock' && (
                <AdblockTab
                  settings={settings}
                  adblock={adblock}
                  lists={lists}
                  setAdblock={setAdblock}
                  onChange={onChange}
                />
              )}
              {activeTab === 'logins' && (
                <LoginsTab credentials={credentials} setCredentials={setCredentials} />
              )}
              {activeTab === 'security' && (
                <SecurityTab vaultPath={vaultPath} appInfo={appInfo} />
              )}
            </m.div>
          </AnimatePresence>
        </div>
      </div>
    </Modal>
  )
}
