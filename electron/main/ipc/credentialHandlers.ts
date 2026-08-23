import { IPC } from '@shared/ipc'
import type { CredentialSummary } from '@shared/types'
import { fillCredential, readLoginFields } from '../browser/credentialFill'
import {
  credentialHistory,
  credentialsForOrigin,
  deleteCredential,
  listCredentials,
  normalizeOrigin,
  restoreCredentialHistory,
  revealCredential,
  revealCredentialHistory,
  saveCredential,
} from '../vault/credentials'
import { register, registerVoid } from './register'
import {
  contentsIdSchema,
  credentialFillSchema,
  credentialHistorySchema,
  credentialIdSchema,
  credentialSaveSchema,
  originSchema,
} from './schemas'

/**
 * ログイン情報の IPC。
 * 復号したパスワードを返すのは credentialReveal だけで、
 * それ以外の経路では画面へ渡さない（自動入力は Main 側で完結する）。
 */
export function registerCredentialHandlers(): void {
  registerVoid<CredentialSummary[]>(IPC.credentialList, () => listCredentials())

  register(IPC.credentialForOrigin, originSchema, ({ origin }): CredentialSummary[] =>
    credentialsForOrigin(normalizeOrigin(origin)),
  )

  register(IPC.credentialSave, credentialSaveSchema, (input): CredentialSummary => saveCredential(input))

  register(IPC.credentialDelete, credentialIdSchema, ({ id }) => deleteCredential(id))

  // 利用者が明示的に「表示」を選んだときだけ呼ばれる。
  register(IPC.credentialReveal, credentialIdSchema, ({ id }) => revealCredential(id))

  register(IPC.credentialFill, credentialFillSchema, ({ contentsId, id }) => fillCredential(contentsId, id))

  // 自動検知が働かない画面から、利用者の操作で読み取る。
  register(IPC.credentialReadForm, contentsIdSchema, ({ contentsId }) => readLoginFields(contentsId))

  register(IPC.credentialHistory, credentialIdSchema, ({ id }) => credentialHistory(id))

  register(IPC.credentialHistoryReveal, credentialHistorySchema, ({ id, index }) =>
    revealCredentialHistory(id, index),
  )

  register(IPC.credentialHistoryRestore, credentialHistorySchema, ({ id, index }) =>
    restoreCredentialHistory(id, index),
  )
}
