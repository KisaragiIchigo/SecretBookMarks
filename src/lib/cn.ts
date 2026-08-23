type ClassValue = string | number | null | undefined | false | ClassValue[]

/** クラス名の連結だけを担う最小ヘルパ。条件付きクラスの false / null を捨てる。 */
export function cn(...values: ClassValue[]): string {
  const out: string[] = []
  for (const value of values) {
    if (!value) continue
    if (Array.isArray(value)) {
      const nested = cn(...value)
      if (nested) out.push(nested)
    } else {
      out.push(String(value))
    }
  }
  return out.join(' ')
}
