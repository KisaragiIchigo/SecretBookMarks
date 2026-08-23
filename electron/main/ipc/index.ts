import { registerBookmarkHandlers } from './bookmarkHandlers'
import { registerBrowserHandlers } from './browserHandlers'
import { registerCredentialHandlers } from './credentialHandlers'
import { registerIoHandlers } from './ioHandlers'
import { registerSystemHandlers } from './systemHandlers'
import { registerVaultHandlers } from './vaultHandlers'

/** アプリ起動時に1度だけ呼ぶ。ハンドラの登録順に依存関係は無い。 */
export function registerIpcHandlers(): void {
  registerVaultHandlers()
  registerBookmarkHandlers()
  registerBrowserHandlers()
  registerCredentialHandlers()
  registerIoHandlers()
  registerSystemHandlers()
}
