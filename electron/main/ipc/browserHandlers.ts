import { dialog } from 'electron'
import { IPC } from '@shared/ipc'
import type { AppSettings, DownloadTask, MediaCandidate } from '@shared/types'
import { clearBrowserData } from '../browser/session'
import { clearMediaFor, mediaCandidates } from '../browser/mediaSniffer'
import { downloads } from '../download/manager'
import { ffmpegStatus } from '../download/ffmpeg'
import { saveSettings } from '../settings'
import { getMainWindow } from '../window'
import { register, registerVoid } from './register'
import { contentsIdSchema, downloadIdSchema, startDownloadSchema } from './schemas'

export function registerBrowserHandlers(): void {
  register(IPC.browserMediaList, contentsIdSchema, ({ contentsId }): MediaCandidate[] =>
    mediaCandidates(contentsId),
  )

  register(IPC.browserMediaClear, contentsIdSchema, ({ contentsId }) => {
    clearMediaFor(contentsId)
    return true
  })

  registerVoid(IPC.browserClearData, async () => {
    await clearBrowserData()
    return true
  })

  register(IPC.downloadStart, startDownloadSchema, (input): Promise<DownloadTask> => downloads.start(input))

  register(IPC.downloadCancel, downloadIdSchema, ({ id }) => {
    downloads.cancel(id)
    return true
  })

  register(IPC.downloadReveal, downloadIdSchema, ({ id }) => {
    downloads.reveal(id)
    return true
  })

  registerVoid<DownloadTask[]>(IPC.downloadList, () => downloads.list())
  registerVoid(IPC.downloadClearHistory, () => downloads.clearHistory())

  registerVoid(IPC.downloadFfmpegStatus, () => ffmpegStatus(), { requireUnlock: false })

  registerVoid<AppSettings | null>(IPC.downloadChooseDir, async () => {
    const window = getMainWindow()
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      title: '保存先のフォルダーを選ぶ',
      defaultPath: downloads.downloadDir(),
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return saveSettings({ downloadDir: result.filePaths[0] })
  })
}
