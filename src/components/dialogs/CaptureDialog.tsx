import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Star } from 'lucide-react'
import { isHttpUrl, extractDomain } from '@shared/url'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { TagInput } from '@/components/ui/TagInput'
import { TagSuggestions } from '@/components/ui/TagSuggestions'
import { cn } from '@/lib/cn'
import { buildSuggestions, completeTag, inheritedDomainTags } from '@/lib/tagSuggest'
import type { CaptureDraft } from '@/hooks/useCaptureFlow'
import { useVault } from '@/state/VaultProvider'

export interface CaptureDialogProps {
  draft: CaptureDraft | null
  onClose: () => void
  onSubmit: (draft: CaptureDraft) => Promise<void>
}

export function CaptureDialog({ draft, onClose, onSubmit }: CaptureDialogProps) {
  const { bookmarks, settings } = useVault()
  const [form, setForm] = useState<CaptureDraft | null>(draft)
  const [keywords, setKeywords] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoFetchedRef = useRef<string | null>(null)

  useEffect(() => {
    setForm(draft)
    setKeywords([])
    setError(null)
    autoFetchedRef.current = null
  }, [draft])

  const fetchMeta = useCallback(async (url: string) => {
    if (!isHttpUrl(url)) return
    setFetching(true)
    try {
      const meta = await window.sbm.meta.fetchPage(url)
      setKeywords(meta.keywords)
      if (meta.title) setForm((current) => (current ? { ...current, title: meta.title as string } : current))
    } catch {
      // タイトル取得の失敗は致命的ではないので、URL のまま保存させる。
    } finally {
      setFetching(false)
    }
  }, [])

  // クリップボード取り込みのように URL だけ埋まって開いた場合は、その場でタイトルとタグ候補を引く。
  useEffect(() => {
    if (!draft || draft.id || !draft.url || draft.title) return
    if (autoFetchedRef.current === draft.url) return
    autoFetchedRef.current = draft.url
    void fetchMeta(draft.url)
  }, [draft, fetchMeta])

  const domain = form ? extractDomain(form.url) : ''

  const suggestions = useMemo(
    () => (form ? buildSuggestions({ bookmarks, domain, keywords, current: form.tags }) : []),
    [bookmarks, domain, form, keywords],
  )

  const getCompletions = useCallback(
    (input: string) => (form ? completeTag(input, bookmarks, form.tags) : []),
    [bookmarks, form],
  )

  if (!form) return null

  const isEdit = form.id !== null
  const urlValid = isHttpUrl(form.url)

  /** 手入力で URL を確定したときも、タグが空なら同ドメインの実績を引き継ぐ。 */
  const applyUrlDerivedTags = () => {
    if (isEdit || form.tags.length > 0 || !urlValid) return
    if (!(settings?.inheritDomainTags ?? true)) return
    const inherited = inheritedDomainTags(bookmarks, extractDomain(form.url))
    if (inherited.length > 0) setForm({ ...form, tags: inherited })
  }

  const submit = async () => {
    if (!urlValid) {
      setError('http:// または https:// で始まる URL を入力してください。')
      return
    }
    setBusy(true)
    try {
      await onSubmit(form)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={isEdit ? 'ブックマークを編集' : 'ブックマークを追加'}
      description={
        isEdit
          ? '内容を書き換えて保存します。URL を変えると分類も追従します。'
          : 'URL を入力すると、タイトルとファビコン、タグの候補を自動で取得します。'
      }
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !urlValid}>
            {busy ? '保存中…' : '保存'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field label="url">
          <Input
            autoFocus={!form.url}
            value={form.url}
            onChange={(event) => setForm({ ...form, url: event.target.value })}
            onBlur={applyUrlDerivedTags}
            placeholder="https://example.com/article"
            spellCheck={false}
            className="font-mono"
          />
        </Field>

        <Field label="title">
          <div className="flex gap-2">
            <Input
              autoFocus={Boolean(form.url)}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="空欄のままだと URL を表示します"
            />
            <Button
              type="button"
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => void fetchMeta(form.url)}
              disabled={!urlValid || fetching}
              className="shrink-0"
            >
              {fetching ? '取得中…' : '取得'}
            </Button>
          </div>
        </Field>

        <div>
          <span className="label-caps">tags</span>
          <div className="mt-1.5 space-y-2">
            <TagInput
              value={form.tags}
              onChange={(tags) => setForm({ ...form, tags })}
              getCompletions={getCompletions}
              placeholder="Enter またはカンマで確定します"
            />
            <TagSuggestions
              suggestions={suggestions}
              onPick={(tag) => setForm({ ...form, tags: [...form.tags, tag] })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="group" hint="空欄ならドメイン名で分類します。">
            <Input
              value={form.group}
              onChange={(event) => setForm({ ...form, group: event.target.value })}
              placeholder="例）リサーチ"
            />
          </Field>
          <div className="flex items-end pb-0.5">
            <button
              type="button"
              onClick={() => setForm({ ...form, favorite: !form.favorite })}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors',
                form.favorite
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-white/[0.08] bg-white/[0.02] text-slate-400 hover:text-slate-200',
              )}
            >
              <Star className={cn('h-3.5 w-3.5', form.favorite && 'fill-amber-300')} />
              お気に入り
            </button>
          </div>
        </div>

        <Field label="note">
          <Textarea
            rows={3}
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            placeholder="後から検索できるよう、残した理由を書いておくと便利です。"
          />
        </Field>

        {error ? (
          <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>
        ) : null}
      </form>
    </Modal>
  )
}
