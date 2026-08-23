/** タグ配列の正規化とマージ。大文字小文字を無視して重複を潰し、先に現れた表記を残す。 */

export function parseTags(input: string): string[] {
  return dedupeTags(
    (input ?? '')
      .split(/[,、]/)
      .map((t) => t.trim())
      .filter(Boolean),
  )
}

export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const tag of tags) {
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

export function joinTags(tags: string[]): string {
  return tags.join(', ')
}

export function mergeTags(current: string[], incoming: string[]): string[] {
  return dedupeTags([...current, ...incoming])
}

export function removeTags(current: string[], targets: string[]): string[] {
  const drop = new Set(targets.map((t) => t.toLowerCase()))
  return current.filter((t) => !drop.has(t.toLowerCase()))
}
