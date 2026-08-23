import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir } from './paths'

const LOG_FILE = 'errors.log'
const MAX_SAME_ERROR = 3

const seen = new Map<string, number>()

function record(kind: string, error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
  const key = detail.slice(0, 200)
  const count = (seen.get(key) ?? 0) + 1
  seen.set(key, count)

  // 同じ内容を延々と書き続けないよう、数回で打ち切る。
  if (count > MAX_SAME_ERROR) return

  const line = `[${new Date().toISOString()}] ${kind}\n${detail}\n\n`
  try {
    const dir = dataDir()
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, LOG_FILE), line, 'utf8')
  } catch {
    // 記録に失敗しても、動作は続ける。
  }
  console.error(`[${kind}]`, detail)
}

export function errorLogPath(): string {
  return join(dataDir(), LOG_FILE)
}

/**
 * 主プロセスの予期しない例外でアプリごと落ちないようにする。
 *
 * 通信層（undici）は、応答本体を読み切る前に接続が切れると内部の表明に引っかかって
 * 例外を投げることがある。ブックマークの中身は保存のたびに書き切っているため、
 * この種の例外で全体を終了させるより、記録して動かし続ける方が実害が小さい。
 * 内容はデータフォルダーの errors.log に残す。
 */
export function installCrashGuard(): void {
  process.on('uncaughtException', (error) => {
    record('uncaughtException', error)
  })

  process.on('unhandledRejection', (reason) => {
    record('unhandledRejection', reason)
  })

  app.on('render-process-gone', (_event, _contents, details) => {
    record('render-process-gone', `${details.reason} (exitCode=${details.exitCode})`)
  })

  app.on('child-process-gone', (_event, details) => {
    record('child-process-gone', `${details.type}: ${details.reason}`)
  })
}
