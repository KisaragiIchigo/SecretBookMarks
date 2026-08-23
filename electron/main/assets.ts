import { join } from 'node:path'

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)

/**
 * アイコン等の静的アセットの絶対パス。
 * 本番は asar 内の dist/renderer（Vite が public/ をコピーした場所）、
 * dev は Vite が配信中でディスクに実体が無いためプロジェクトの public/ を直接見る。
 */
export function assetPath(fileName: string): string {
  return isDev ? join(process.cwd(), 'public', fileName) : join(__dirname, '../renderer', fileName)
}
