import { build } from 'esbuild'
import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/** Main / Preload 共通のバンドル設定。electron 本体だけ external にする。 */
/**
 * esbuild は「import 構文で書かれているか」で exports の条件を選ぶため、出力が CJS でも
 * 依存の ESM 実装を取り込む。adblocker の ESM 版は createRequire(import.meta.url) を使い、
 * CJS へ変換される際に import.meta が空オブジェクトへ潰れて起動時に落ちる。
 * そこで該当パッケージだけ CJS 実装へ明示的に向ける。
 */
const forceCommonJs = {
  name: 'force-commonjs-adblocker',
  setup(build) {
    build.onResolve({ filter: /^@ghostery\/adblocker-electron$/ }, () => ({
      path: `${root}node_modules/@ghostery/adblocker-electron/dist/commonjs/index.js`,
    }))
    // 要素非表示用の preload は実行時に require.resolve で探されるが、配布物に
    // node_modules は含めない。dist へ複製したファイルを指す実装へ差し替える。
    build.onResolve({ filter: /preload_path(\.js)?$/ }, (args) => {
      if (!args.importer.includes('adblocker-electron')) return null
      return { path: `${root}scripts/adblockerPreloadPath.cjs` }
    })
  },
}

/** adblocker の preload スクリプトを dist へ複製する。 */
export function copyAdblockerPreload() {
  const from = `${root}node_modules/@ghostery/adblocker-electron-preload/dist/index.cjs`
  const to = `${root}dist/preload/adblocker-preload.cjs`
  mkdirSync(`${root}dist/preload`, { recursive: true })
  copyFileSync(from, to)
  return to
}

export const baseOptions = {
  bundle: true,
  plugins: [forceCommonJs],
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
  copyAdblockerPreload()
  const define = { 'process.env.NODE_ENV': '"production"' }
  await Promise.all(entries.map((e) => build({ ...baseOptions, ...e, define, minify: true })))
}
