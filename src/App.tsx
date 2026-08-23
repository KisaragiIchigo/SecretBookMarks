import { useState } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Loader2 } from 'lucide-react'
import { DownloadsDialog } from '@/components/Downloads'
import { TitleBar, type AppMode } from '@/components/TitleBar'
import { UnlockGate } from '@/components/UnlockGate'
import { Workspace } from '@/components/Workspace'
import { SettingsDialog } from '@/components/dialogs/SettingsDialog'
import { useBrowser } from '@/state/BrowserProvider'
import { useVault } from '@/state/VaultProvider'

export default function App() {
  const { phase, settings, vaultPath, updateSettings, lock } = useVault()
  const { activeDownloadCount } = useBrowser()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [downloadsOpen, setDownloadsOpen] = useState(false)
  const [mode, setMode] = useState<AppMode>('library')
  const unlocked = phase === 'unlocked' && settings !== null

  return (
    <Tooltip.Provider delayDuration={420}>
      <div className="flex h-full flex-col">
        <TitleBar
          unlocked={unlocked}
          mode={mode}
          onModeChange={setMode}
          downloadCount={activeDownloadCount}
          onOpenDownloads={() => setDownloadsOpen(true)}
          onLock={() => void lock()}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {phase === 'loading' ? (
          <div className="grid flex-1 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-teal-300" />
          </div>
        ) : unlocked && settings ? (
          <Workspace settings={settings} mode={mode} onOpenSettings={() => setSettingsOpen(true)} />
        ) : (
          <UnlockGate />
        )}
      </div>

      {unlocked && settings ? (
        <SettingsDialog
          open={settingsOpen}
          settings={settings}
          vaultPath={vaultPath}
          onClose={() => setSettingsOpen(false)}
          onChange={updateSettings}
        />
      ) : null}

      <DownloadsDialog open={downloadsOpen} onClose={() => setDownloadsOpen(false)} />
    </Tooltip.Provider>
  )
}
