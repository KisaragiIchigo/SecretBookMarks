import { dialog, type FileFilter } from 'electron'
import { IPC } from '@shared/ipc'
import type { ExportFormat, ExportSummary, ImportSummary } from '@shared/types'
import { exportBookmarks } from '../io/exportFile'
import { importFromFile } from '../io/importFile'
import { enqueueMissingFavicons } from '../metadata/faviconQueue'
import { loadSettings } from '../settings'
import { listBookmarks } from '../vault/repository'
import { getMainWindow } from '../window'
import { register, registerVoid } from './register'
import { exportSchema } from './schemas'

const EXPORT_FILTERS: Record<ExportFormat, FileFilter> = {
  json: { name: 'JSON', extensions: ['json'] },
  html: { name: 'ブックマーク HTML', extensions: ['html'] },
  csv: { name: 'CSV', extensions: ['csv'] },
}

export function registerIoHandlers(): void {
  registerVoid<ImportSummary | null>(IPC.ioImport, async () => {
    const window = getMainWindow()
    if (!window) return null

    const result = await dialog.showOpenDialog(window, {
      title: 'ブックマークを取り込む',
      properties: ['openFile'],
      filters: [
        { name: 'ブックマーク（HTML / JSON）', extensions: ['html', 'htm', 'json'] },
        { name: 'すべてのファイル', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const summary = importFromFile(result.filePaths[0])
    if (loadSettings().fetchFavicons) {
      const seen = new Set<string>()
      const targets: string[] = []
      for (const bookmark of listBookmarks()) {
        if (bookmark.deletedAt !== null || seen.has(bookmark.domain)) continue
        seen.add(bookmark.domain)
        targets.push(bookmark.url)
      }
      enqueueMissingFavicons(targets)
    }
    return summary
  })

  register(IPC.ioExport, exportSchema, async ({ format, includeTrashed }): Promise<ExportSummary | null> => {
    const window = getMainWindow()
    if (!window) return null

    const stamp = new Date().toISOString().slice(0, 10)
    const result = await dialog.showSaveDialog(window, {
      title: 'ブックマークを書き出す',
      defaultPath: `secretbookmarks-${stamp}.${format}`,
      filters: [EXPORT_FILTERS[format]],
    })
    if (result.canceled || !result.filePath) return null

    const bookmarks = listBookmarks().filter((b) => includeTrashed || b.deletedAt === null)
    const count = exportBookmarks(result.filePath, format, bookmarks)
    return { filePath: result.filePath, count }
  })
}
