import { writeFileSync } from 'node:fs'
import type { Bookmark, ExportFormat } from '@shared/types'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function toIso(ms: number | null): string {
  return ms === null ? '' : new Date(ms).toISOString()
}

function buildJson(bookmarks: Bookmark[]): string {
  return JSON.stringify(
    { app: 'SecretBookMarks', version: 1, exportedAt: new Date().toISOString(), bookmarks },
    null,
    2,
  )
}

function buildCsv(bookmarks: Bookmark[]): string {
  const header = ['url', 'title', 'tags', 'group', 'note', 'favorite', 'createdAt', 'lastOpenedAt', 'openCount']
  const rows = bookmarks.map((b) =>
    [
      b.url,
      b.title,
      b.tags.join(' '),
      b.group,
      b.note,
      b.favorite ? '1' : '0',
      toIso(b.createdAt),
      toIso(b.lastOpenedAt),
      String(b.openCount),
    ]
      .map(escapeCsv)
      .join(','),
  )
  // Excel が UTF-8 と判別できるよう BOM を付ける。
  return `﻿${[header.join(','), ...rows].join('\r\n')}\r\n`
}

/** ブラウザが読み込める Netscape 形式。グループをフォルダとして書き出す。 */
function buildNetscapeHtml(bookmarks: Bookmark[]): string {
  const groups = new Map<string, Bookmark[]>()
  for (const bookmark of bookmarks) {
    const list = groups.get(bookmark.group) ?? []
    list.push(bookmark)
    groups.set(bookmark.group, list)
  }

  const body = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'ja'))
    .map(([group, items]) => {
      const links = items
        .map((b) => {
          const add = Math.floor(b.createdAt / 1000)
          const tags = escapeHtml(b.tags.join(','))
          return `        <DT><A HREF="${escapeHtml(b.url)}" ADD_DATE="${add}" TAGS="${tags}">${escapeHtml(b.title)}</A>`
        })
        .join('\n')
      return `    <DT><H3>${escapeHtml(group)}</H3>\n    <DL><p>\n${links}\n    </DL><p>`
    })
    .join('\n')

  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>SecretBookMarks</H1>
<DL><p>
${body}
</DL><p>
`
}

export function exportBookmarks(filePath: string, format: ExportFormat, bookmarks: Bookmark[]): number {
  const content =
    format === 'json' ? buildJson(bookmarks) : format === 'csv' ? buildCsv(bookmarks) : buildNetscapeHtml(bookmarks)
  writeFileSync(filePath, content, 'utf8')
  return bookmarks.length
}
