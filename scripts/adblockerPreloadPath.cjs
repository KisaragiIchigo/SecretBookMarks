// adblocker が参照する preload スクリプトの場所。
// バンドル後は dist/main/index.cjs から見た相対位置に置かれる（asar 内でも解決できる）。
const { join } = require('node:path')

exports.PRELOAD_PATH = join(__dirname, '..', 'preload', 'adblocker-preload.cjs')
