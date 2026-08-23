import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import type { BookmarkInput, ImportSummary } from '@shared/types'
import { dedupeTags } from '@shared/tags'
import { isHttpUrl } from '@shared/url'
import { createBookmark } from '../vault/repository'

interface ParsedEntry {
  url: string
  title: string
  tags: string[]
  group: string | null
  note: string
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => named[name.toLowerCase()] ?? whole)
}

/**
 * Netscape 形式（各ブラウザの「ブックマークをHTMLにエクスポート」）を読む。
 * <H3> のフォルダ階層を追いかけて、最も内側のフォルダ名をグループに採用する。
 */
export function parseNetscapeHtml(html: string): ParsedEntry[] {
  const tokenPattern = /<H3[^>]*>([\s\S]*?)<\/H3>|<\/DL>|<A\s+([^>]*)>([\s\S]*?)<\/A>/gi
  const folders: string[] = []
  const entries: ParsedEntry[] = []

  for (const match of html.matchAll(tokenPattern)) {
    const [whole, folderName, anchorAttrs, anchorText] = match
    if (folderName !== undefined) {
      folders.push(decodeEntities(folderName).replace(/<[^>]+>/g, '').trim())
      continue
    }
    if (/^<\/DL>/i.test(whole)) {
      folders.pop()
      continue
    }
    if (anchorAttrs === undefined) continue

    const href = /href=["']([^"']+)["']/i.exec(anchorAttrs)?.[1]
    if (!href || !isHttpUrl(href)) continue
    const tagAttr = /tags=["']([^"']*)["']/i.exec(anchorAttrs)?.[1] ?? ''
    const title = decodeEntities(anchorText).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

    entries.push({
      url: decodeEntities(href),
      title: title || href,
      tags: dedupeTags(tagAttr.split(',').map((t) => t.trim()).filter(Boolean)),
      group: folders.length > 0 ? folders[folders.length - 1] : null,
      note: '',
    })
  }
  return entries
}

/** 本アプリの JSON エクスポート、および移行スクリプトが吐く配列 JSON を読む。 */
export function parseJsonExport(text: string): ParsedEntry[] {
  const data = JSON.parse(text) as unknown
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { bookmarks?: unknown }).bookmarks)
      ? ((data as { bookmarks: unknown[] }).bookmarks)
      : []

  const entries: ParsedEntry[] = []
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const record = row as Record<string, unknown>
    const url = typeof record.url === 'string' ? record.url : ''
    if (!isHttpUrl(url)) continue
    const rawTags = record.tags
    const tags = Array.isArray(rawTags)
      ? rawTags.filter((t): t is string => typeof t === 'string')
      : typeof rawTags === 'string'
        ? rawTags.split(',').map((t) => t.trim()).filter(Boolean)
        : []
    entries.push({
      url,
      title: typeof record.title === 'string' && record.title.trim() ? record.title : url,
      tags: dedupeTags(tags),
      group: typeof record.group === 'string' && record.group.trim() ? record.group : null,
      note: typeof record.note === 'string' ? record.note : '',
    })
  }
  return entries
}

export function importFromFile(filePath: string): ImportSummary {
  const text = readFileSync(filePath, 'utf8')
  const ext = extname(filePath).toLowerCase()
  const entries = ext === '.json' ? parseJsonExport(text) : parseNetscapeHtml(text)

  let imported = 0
  let merged = 0
  let skipped = 0

  for (const entry of entries) {
    const input: BookmarkInput = {
      url: entry.url,
      title: entry.title,
      tags: entry.tags,
      note: entry.note,
      group: entry.group,
      favorite: false,
    }
    const result = createBookmark(input, 'merge')
    if (result.status === 'created') imported += 1
    else if (result.status === 'merged') merged += 1
    else skipped += 1
  }

  return { fileName: basename(filePath), imported, merged, skipped }
}
