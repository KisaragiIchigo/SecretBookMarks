import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface SelectionApi {
  selected: string[]
  selectedSet: Set<string>
  isSelected: (id: string) => boolean
  select: (id: string, modifiers: { ctrl: boolean; shift: boolean }) => void
  replace: (ids: string[]) => void
  selectAll: () => void
  clear: () => void
}

/** 一覧の複数選択。表示順（orderedIds）を基準に Shift 範囲選択を解決する。 */
export function useSelection(orderedIds: string[]): SelectionApi {
  const [selected, setSelected] = useState<string[]>([])
  const anchorRef = useRef<string | null>(null)

  // 絞り込みや削除で消えた項目は選択から外す。
  useEffect(() => {
    const visible = new Set(orderedIds)
    setSelected((current) => {
      const alive = current.filter((id) => visible.has(id))
      return alive.length === current.length ? current : alive
    })
  }, [orderedIds])

  const selectedSet = useMemo(() => new Set(selected), [selected])

  const select = useCallback<SelectionApi['select']>(
    (id, modifiers) => {
      if (modifiers.shift && anchorRef.current) {
        const from = orderedIds.indexOf(anchorRef.current)
        const to = orderedIds.indexOf(id)
        if (from !== -1 && to !== -1) {
          const [start, end] = from <= to ? [from, to] : [to, from]
          setSelected(orderedIds.slice(start, end + 1))
          return
        }
      }
      if (modifiers.ctrl) {
        anchorRef.current = id
        setSelected((current) =>
          current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
        )
        return
      }
      anchorRef.current = id
      setSelected([id])
    },
    [orderedIds],
  )

  const replace = useCallback((ids: string[]) => {
    anchorRef.current = ids[ids.length - 1] ?? null
    setSelected(ids)
  }, [])

  const selectAll = useCallback(() => {
    anchorRef.current = orderedIds[orderedIds.length - 1] ?? null
    setSelected(orderedIds)
  }, [orderedIds])

  const clear = useCallback(() => {
    anchorRef.current = null
    setSelected([])
  }, [])

  const isSelected = useCallback((id: string) => selectedSet.has(id), [selectedSet])

  return { selected, selectedSet, isSelected, select, replace, selectAll, clear }
}
