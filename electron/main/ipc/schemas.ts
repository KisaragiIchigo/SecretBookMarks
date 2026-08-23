import { z } from 'zod'

/** IPC 境界のバリデーション。Renderer から届く値はすべてここを通す。 */

export const passwordSchema = z.object({
  password: z.string().min(1).max(1024),
})

export const changePasswordSchema = z.object({
  current: z.string().min(1).max(1024),
  next: z.string().min(8).max(1024),
})

export const httpUrlSchema = z
  .string()
  .trim()
  .max(4096)
  .refine((value) => /^https?:\/\//i.test(value), { message: 'http(s) の URL を指定してください。' })

export const tagListSchema = z.array(z.string().trim().min(1).max(64)).max(64)

export const idSchema = z.string().uuid()
export const idListSchema = z.array(idSchema).min(1).max(20000)

export const bookmarkInputSchema = z.object({
  url: httpUrlSchema,
  title: z.string().max(1024).default(''),
  tags: tagListSchema.default([]),
  note: z.string().max(20000).default(''),
  group: z.string().trim().max(256).nullable().default(null),
  favorite: z.boolean().default(false),
})

export const createBookmarkSchema = z.object({
  input: bookmarkInputSchema,
  resolution: z.enum(['ask', 'merge', 'overwrite', 'skip']).default('ask'),
})

export const updateBookmarkSchema = z.object({
  id: idSchema,
  patch: z
    .object({
      url: httpUrlSchema.optional(),
      title: z.string().max(1024).optional(),
      tags: tagListSchema.optional(),
      note: z.string().max(20000).optional(),
      group: z.string().trim().max(256).optional(),
      favorite: z.boolean().optional(),
    })
    .refine((patch) => Object.keys(patch).length > 0, { message: '更新内容が空です。' }),
})

export const bulkTagsSchema = z.object({
  ids: idListSchema,
  mode: z.enum(['add', 'remove', 'replace']),
  tags: tagListSchema,
})

export const setFavoriteSchema = z.object({ ids: idListSchema, favorite: z.boolean() })
export const setGroupSchema = z.object({ ids: idListSchema, group: z.string().trim().max(256) })
export const renameTagSchema = z.object({ from: z.string().trim().min(1).max(64), to: z.string().trim().max(64) })
export const purgeSchema = z.object({ ids: z.union([idListSchema, z.literal('trash')]) })
export const checkLinksSchema = z.object({ ids: idListSchema.max(500) })
export const collapsedGroupsSchema = z.object({ keys: z.array(z.string().max(256)).max(5000) })
export const fetchPageMetaSchema = z.object({ url: httpUrlSchema })
export const exportSchema = z.object({
  format: z.enum(['json', 'html', 'csv']),
  includeTrashed: z.boolean().default(false),
})
export const copyTextSchema = z.object({ text: z.string().max(8192) })
export const openExternalSchema = z.object({ url: httpUrlSchema })
export const openBookmarkSchema = z.object({ id: idSchema, external: z.boolean().default(false) })

// ===== 内蔵ブラウザ / ダウンロード =====

export const contentsIdSchema = z.object({ contentsId: z.number().int().nonnegative() })

export const navigateSchema = z.object({
  contentsId: z.number().int().nonnegative(),
  direction: z.enum(['back', 'forward', 'reload', 'stop']),
})

export const startDownloadSchema = z.object({
  url: httpUrlSchema,
  kind: z.enum(['file', 'hls']),
  pageUrl: z.string().trim().max(4096).default(''),
  fileName: z.string().trim().max(200).optional(),
  pageTitle: z.string().trim().max(300).optional(),
  contentsId: z.number().int().nonnegative().optional(),
  saveAs: z.boolean().optional(),
})

export const downloadIdSchema = z.object({ id: idSchema })

export const adblockToggleSchema = z.object({ enabled: z.boolean() })

// ===== ログイン情報 =====

export const credentialSaveSchema = z.object({
  origin: httpUrlSchema,
  username: z.string().max(256),
  password: z.string().min(1).max(1024),
})

export const credentialIdSchema = z.object({ id: idSchema })
export const credentialHistorySchema = z.object({ id: idSchema, index: z.number().int().min(0).max(20) })
export const originSchema = z.object({ origin: z.string().trim().max(2048) })
export const credentialFillSchema = z.object({
  contentsId: z.number().int().nonnegative(),
  id: idSchema,
})
