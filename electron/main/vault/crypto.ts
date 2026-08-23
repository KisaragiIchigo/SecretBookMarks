import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'

/**
 * ヴォールトファイルのバイナリ形式（すべてビッグエンディアン）:
 *   0..3   magic "SBMV"
 *   4      format version
 *   5      kdf id (1 = scrypt)
 *   6..9   scrypt N
 *   10..13 scrypt r
 *   14..17 scrypt p
 *   18..33 salt (16 bytes)
 *   34..45 nonce (12 bytes)
 *   46..61 GCM auth tag (16 bytes)
 *   62..   ciphertext (gzip 圧縮した JSON)
 * ヘッダ 0..33（KDF パラメータとソルト）は AAD として認証に含める。
 */

const MAGIC = Buffer.from('SBMV', 'ascii')
const FORMAT_VERSION = 1
const KDF_SCRYPT = 1
const SALT_LEN = 16
const NONCE_LEN = 12
const TAG_LEN = 16
const HEADER_LEN = 62
const AAD_LEN = 34

export interface KdfParams {
  N: number
  r: number
  p: number
}

/** 約 64MB / 200ms 程度。総当たりコストを実用的に引き上げる水準。 */
export const DEFAULT_KDF: KdfParams = { N: 1 << 16, r: 8, p: 1 }

const SCRYPT_MAXMEM = 512 * 1024 * 1024

export class WrongPasswordError extends Error {
  constructor() {
    super('パスワードが違います。')
    this.name = 'WrongPasswordError'
  }
}

export class VaultFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultFormatError'
  }
}

export function createSalt(): Buffer {
  return randomBytes(SALT_LEN)
}

export function deriveKey(password: string, salt: Buffer, params: KdfParams = DEFAULT_KDF): Buffer {
  return scryptSync(password.normalize('NFKC'), salt, 32, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: SCRYPT_MAXMEM,
  })
}

export function seal(plaintext: string, key: Buffer, salt: Buffer, params: KdfParams = DEFAULT_KDF): Buffer {
  const header = Buffer.alloc(HEADER_LEN)
  MAGIC.copy(header, 0)
  header.writeUInt8(FORMAT_VERSION, 4)
  header.writeUInt8(KDF_SCRYPT, 5)
  header.writeUInt32BE(params.N, 6)
  header.writeUInt32BE(params.r, 10)
  header.writeUInt32BE(params.p, 14)
  salt.copy(header, 18)

  const nonce = randomBytes(NONCE_LEN)
  nonce.copy(header, 34)

  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(header.subarray(0, AAD_LEN))
  const body = Buffer.concat([cipher.update(gzipSync(Buffer.from(plaintext, 'utf8'))), cipher.final()])
  cipher.getAuthTag().copy(header, 46)

  return Buffer.concat([header, body])
}

export interface OpenedVault {
  plaintext: string
  key: Buffer
  salt: Buffer
  params: KdfParams
}

export function readHeader(file: Buffer): { salt: Buffer; params: KdfParams } {
  if (file.length < HEADER_LEN || !file.subarray(0, 4).equals(MAGIC)) {
    throw new VaultFormatError('ヴォールトファイルの形式が違います。')
  }
  if (file.readUInt8(4) !== FORMAT_VERSION) {
    throw new VaultFormatError('このバージョンのヴォールトは読み込めません。')
  }
  if (file.readUInt8(5) !== KDF_SCRYPT) {
    throw new VaultFormatError('未知の鍵導出方式です。')
  }
  return {
    salt: Buffer.from(file.subarray(18, 34)),
    params: { N: file.readUInt32BE(6), r: file.readUInt32BE(10), p: file.readUInt32BE(14) },
  }
}

export function open(file: Buffer, password: string): OpenedVault {
  const { salt, params } = readHeader(file)
  const nonce = file.subarray(34, 46)
  const tag = file.subarray(46, 46 + TAG_LEN)
  const body = file.subarray(HEADER_LEN)

  const key = deriveKey(password, salt, params)
  const decipher = createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAAD(file.subarray(0, AAD_LEN))
  decipher.setAuthTag(tag)
  try {
    const compressed = Buffer.concat([decipher.update(body), decipher.final()])
    return { plaintext: gunzipSync(compressed).toString('utf8'), key, salt, params }
  } catch {
    // GCM の認証失敗＝鍵違い。改竄検知もここに落ちる。
    throw new WrongPasswordError()
  }
}
