import { useCallback, useEffect, useState } from 'react'
import type { Bookmark, BookmarkInput, DuplicateResolution } from '@shared/types'
import { dedupeTags } from '@shared/tags'
import { useToast } from '@/components/ui/Toast'
import { useVault } from '@/state/VaultProvider'

export interface CaptureDraft {
  id: string | null
  url: string
  title: string
  tags: string[]
  note: string
  group: string
  favorite: boolean
}

export interface DuplicatePrompt {
  input: BookmarkInput
  existing: Bookmark
}

const EMPTY_DRAFT: CaptureDraft = {
  id: null,
  url: '',
  title: '',
  tags: [],
  note: '',
  group: '',
  favorite: false,
}

function toInput(draft: CaptureDraft): BookmarkInput {
  return {
    url: draft.url.trim(),
    title: draft.title.trim(),
    tags: dedupeTags(draft.tags),
    note: draft.note,
    group: draft.group.trim() || null,
    favorite: draft.favorite,
  }
}

/**
 * 取り込み（追加・編集）ダイアログの開閉と、URL 重複時の確認フローをまとめる。
 * クリップボード検知とグローバルショートカットの受け口もここに集約する。
 */
export function useCaptureFlow() {
  const { phase, actions } = useVault()
  const toast = useToast()
  const [draft, setDraft] = useState<CaptureDraft | null>(null)
  const [duplicate, setDuplicate] = useState<DuplicatePrompt | null>(null)

  // タグはそのページから取得したものだけを入れる（他のブックマークからは引き継がない）。
  const openAdd = useCallback((url = '', title = '') => {
    setDraft({ ...EMPTY_DRAFT, url, title })
  }, [])

  const openEdit = useCallback((bookmark: Bookmark) => {
    setDraft({
      id: bookmark.id,
      url: bookmark.url,
      title: bookmark.title,
      tags: bookmark.tags,
      note: bookmark.note,
      group: bookmark.group,
      favorite: bookmark.favorite,
    })
  }, [])

  const close = useCallback(() => setDraft(null), [])

  const submit = useCallback(
    async (next: CaptureDraft) => {
      const input = toInput(next)
      if (next.id) {
        await actions.update(next.id, {
          url: input.url,
          title: input.title,
          tags: input.tags,
          note: input.note,
          group: input.group ?? '',
          favorite: input.favorite,
        })
        setDraft(null)
        toast.push({ title: '更新しました', tone: 'success' })
        return
      }

      const result = await actions.create(input, 'ask')
      if (result.status === 'duplicate') {
        setDraft(null)
        setDuplicate({ input, existing: result.existing })
        return
      }
      setDraft(null)
      toast.push({ title: '追加しました', description: input.title || input.url, tone: 'success' })
    },
    [actions, toast],
  )

  const resolveDuplicate = useCallback(
    async (resolution: DuplicateResolution) => {
      if (!duplicate) return
      if (resolution === 'skip') {
        setDuplicate(null)
        toast.push({ title: '取り込みを見送りました' })
        return
      }
      await actions.create(duplicate.input, resolution)
      setDuplicate(null)
      toast.push({
        title: resolution === 'merge' ? 'タグをマージしました' : '上書きしました',
        tone: 'success',
      })
    },
    [actions, duplicate, toast],
  )

  useEffect(() => {
    if (phase !== 'unlocked') return
    const unsubscribers = [
      window.sbm.events.onClipboardUrl((url) => openAdd(url)),
      window.sbm.events.onQuickAdd(() => openAdd()),
      window.sbm.events.onBrowserCapturePage(({ url, title }) => openAdd(url, title)),
    ]
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [openAdd, phase])

  return { draft, duplicate, openAdd, openEdit, close, submit, resolveDuplicate, dismissDuplicate: () => setDuplicate(null) }
}
