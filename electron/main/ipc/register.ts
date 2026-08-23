import { ipcMain } from 'electron'
import { z } from 'zod'
import type { IpcResult } from '@shared/ipc'
import { session } from '../vault/session'

function toMessage(error: unknown): string {
  if (error instanceof z.ZodError) return '入力値が不正です。'
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * IPC ハンドラの共通ラッパ。Zod 検証 → 実処理 → Result 化 を1か所に集約する。
 * requireUnlock を指定したハンドラはロック中に呼ばれても実処理へ落とさない。
 */
export function register<S extends z.ZodTypeAny, R>(
  channel: string,
  schema: S,
  handler: (payload: z.infer<S>) => R | Promise<R>,
  options: { requireUnlock?: boolean } = {},
): void {
  ipcMain.handle(channel, async (_event, raw): Promise<IpcResult<R>> => {
    try {
      if (options.requireUnlock !== false && !session.isUnlocked) {
        throw new Error('ヴォールトがロックされています。')
      }
      const payload = schema.parse(raw) as z.infer<S>
      return { ok: true, data: await handler(payload) }
    } catch (error) {
      return { ok: false, error: toMessage(error) }
    }
  })
}

/** 引数を取らないハンドラ用のショートハンド。 */
export function registerVoid<R>(
  channel: string,
  handler: () => R | Promise<R>,
  options: { requireUnlock?: boolean } = {},
): void {
  register(channel, z.undefined().or(z.null()).or(z.void()), () => handler(), options)
}
