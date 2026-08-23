import type { SbmApi } from '../../electron/preload'

declare global {
  interface Window {
    sbm: SbmApi
  }
}

export {}
