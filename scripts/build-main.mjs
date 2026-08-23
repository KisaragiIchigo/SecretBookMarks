import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/** Main / Preload 共通のバンドル設定。electron 本体だけ external にする。 */
export const baseOptions = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron'],
  alias: { '@shared': `${root}shared` },
  logLevel: 'info',
}

export const entries = [
  { entryPoints: [`${root}electron/main/index.ts`], outfile: `${root}dist/main/index.cjs` },
  { entryPoints: [`${root}electron/preload/index.ts`], outfile: `${root}dist/preload/index.cjs` },
]

// 直接実行されたときだけビルドする（dev.mjs からは設定だけを import する）。
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const define = { 'process.env.NODE_ENV': '"production"' }
  await Promise.all(entries.map((e) => build({ ...baseOptions, ...e, define, minify: true })))
}
