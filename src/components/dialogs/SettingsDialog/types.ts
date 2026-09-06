import type { AppSettings } from '@shared/types'

export type SettingsTabId = 'general' | 'browser' | 'adblock' | 'logins' | 'security'

export interface SettingsTabProps {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => Promise<void>
}
