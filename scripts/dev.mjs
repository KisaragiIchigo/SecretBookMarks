import { spawn } from 'node:child_process'
import { context } from 'esbuild'
import { createServer } from 'vite'
import electronPath from 'electron'
import { baseOptions, entries } from './build-main.mjs'

const server = await createServer({ configFile: 'vite.config.ts' })
await server.listen()
const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5173/'
server.printUrls()

let child = null
let restartTimer = null

function launchElectron() {
  if (child) {
    child.removeAllListeners('exit')
    child.kill()
  }
  child = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: url, NODE_ENV: 'development' },
  })
  child.on('exit', () => {
    child = null
    shutdown(0)
  })
}

function scheduleRestart() {
  clearTimeout(restartTimer)
  restartTimer = setTimeout(launchElectron, 120)
}

async function shutdown(code) {
  await server.close()
  process.exit(code)
}

const rebuildNotifier = {
  name: 'restart-electron',
  setup(b) {
    b.onEnd((result) => {
      if (result.errors.length > 0) return
      scheduleRestart()
    })
  },
}

const define = { 'process.env.NODE_ENV': '"development"' }
const contexts = await Promise.all(
  entries.map((e) => context({ ...baseOptions, ...e, define, plugins: [rebuildNotifier] })),
)
await Promise.all(contexts.map((c) => c.watch()))

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
