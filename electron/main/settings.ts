import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import type { AppSettings } from '@shared/types'
import { settingsFilePath } from './paths'

const settingsSchema = z.object({
  window: z.object({
    x: z.number().nullable().default(null),
    y: z.number().nullable().default(null),
    width: z.number().int().min(720).max(10000).default(1180),
    height: z.number().int().min(480).max(10000).default(760),
    maximized: z.boolean().default(false),
  }),
  clipboardWatch: z.boolean().default(true),
  autoLockMinutes: z.number().int().min(0).max(720).default(15),
  fetchTitles: z.boolean().default(true),
  fetchFavicons: z.boolean().default(true),
  inheritDomainTags: z.boolean().default(true),
  minimizeToTray: z.boolean().default(true),
  sortMode: z
    .enum(['added-desc', 'added-asc', 'title-asc', 'title-desc', 'opened-desc', 'opencount-desc', 'updated-desc'])
    .default('added-desc'),
  viewMode: z.enum(['grouped', 'flat']).default('grouped'),
  trashRetentionDays: z.number().int().min(0).max(3650).default(30),
})

export const settingsPatchSchema = settingsSchema.deepPartial()

export const DEFAULT_SETTINGS: AppSettings = settingsSchema.parse({ window: {} })

let cache: AppSettings | null = null

function settingsPath(): string {
  return settingsFilePath()
}

export function loadSettings(): AppSettings {
  if (cache) return cache
  const path = settingsPath()
  if (!existsSync(path)) {
    cache = DEFAULT_SETTINGS
    return cache
  }
  try {
    const parsed = settingsSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
    cache = parsed.success ? parsed.data : DEFAULT_SETTINGS
  } catch {
    cache = DEFAULT_SETTINGS
  }
  return cache
}

export function saveSettings(patch: z.infer<typeof settingsPatchSchema>): AppSettings {
  const current = loadSettings()
  const next: AppSettings = {
    ...current,
    ...patch,
    window: { ...current.window, ...(patch.window ?? {}) },
  } as AppSettings
  cache = settingsSchema.parse(next)

  const path = settingsPath()
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8')
  renameSync(tmp, path)
  return cache
}
