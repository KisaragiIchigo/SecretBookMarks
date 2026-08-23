import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// layoutId による Magic Motion を使うため domMax を読み込む（domAnimation にレイアウト機能は含まれない）。
import { LazyMotion, domMax } from 'framer-motion'
import '@fontsource-variable/space-grotesk'
import '@fontsource/ibm-plex-sans-jp/400.css'
import '@fontsource/ibm-plex-sans-jp/500.css'
import '@fontsource/ibm-plex-sans-jp/600.css'
import '@fontsource/ibm-plex-sans-jp/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import App from './App'
import { ToastProvider } from './components/ui/Toast'
import { VaultProvider } from './state/VaultProvider'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LazyMotion features={domMax} strict>
      <ToastProvider>
        <VaultProvider>
          <App />
        </VaultProvider>
      </ToastProvider>
    </LazyMotion>
  </StrictMode>,
)
