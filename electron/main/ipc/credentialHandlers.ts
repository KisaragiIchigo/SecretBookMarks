import { IPC } from '@shared/ipc'
import type { CredentialSummary } from '@shared/types'
import { fillCredential } from '../browser/credentialFill'
import {
  credentialsForOrigin,
  deleteCredential,
  listCredentials,
  normalizeOrigin,
  revealCredential,
  saveCredential,
} from '../vault/credentials'
import { register, registerVoid } from './register'
import { credentialFillSchema, credentialIdSchema, credentialSaveSchema, originSchema } from './schemas'

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
}
