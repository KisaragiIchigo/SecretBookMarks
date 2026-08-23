import { useCallback, useMemo, useRef, useState } from 'react'
import type { AppSettings, ExportFormat } from '@shared/types'
import { BookmarkList } from '@/components/BookmarkList'
import { Browser } from '@/components/Browser'
import { CommandPalette, type PaletteCommand } from '@/components/CommandPalette'
import { Inspector } from '@/components/Inspector'
import { Sidebar } from '@/components/Sidebar'
import { StatusBar } from '@/components/StatusBar'
import { Toolbar } from '@/components/Toolbar'
import { BulkTagDialog } from '@/components/dialogs/BulkTagDialog'
import { CaptureDialog } from '@/components/dialogs/CaptureDialog'
import { DuplicateDialog } from '@/components/dialogs/DuplicateDialog'
import { useToast } from '@/components/ui/Toast'
import { useAppHotkeys } from '@/hooks/useAppHotkeys'
import { useCaptureFlow } from '@/hooks/useCaptureFlow'
import { useLibrary } from '@/hooks/useLibrary'
import { useSelection } from '@/hooks/useSelection'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'
import type { LibraryFilter, SmartView } from '@/lib/library'
import { useVault } from '@/state/VaultProvider'

const LINK_CHECK_LIMIT = 500

export interface WorkspaceProps {
  settings: AppSettings
  mode: 'library' | 'browser'
  onOpenSettings: () => void
  /** 内蔵ブラウザで開く。ブラウザ画面への切り替えも行う */
  onNavigate: (url: string) => void
}

export function Workspace({ settings, mode, onOpenSettings, onNavigate }: WorkspaceProps) {
  const { bookmarks, favicons, saveState, actions, updateSettings, refresh, lock } = useVault()
  const toast = useToast()
  const searchRef = useRef<HTMLInputElement>(null)

  const [filter, setFilter] = useState<LibraryFilter>({ view: 'all', tags: [], query: '' })
  const [bulkOpen, setBulkOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [checking, setChecking] = useState(false)

  const library = useLibrary(bookmarks, filter, settings.sortMode, settings.viewMode)
  const selection = useSelection(library.orderedIds)
  const capture = useCaptureFlow()

  const inTrash = filter.view === 'trash'
  const focused = useMemo(
    () => (selection.selected.length === 1 ? bookmarks.find((b) => b.id === selection.selected[0]) ?? null : null),
    [bookmarks, selection.selected],
  )

  /** ブックマークを内蔵ブラウザで開く。開いた回数の記録も同時に行う。 */
  const openBookmark = useCallback(
    (id: string) => {
      const bookmark = bookmarks.find((entry) => entry.id === id)
      if (!bookmark) return
      onNavigate(bookmark.url)
      void actions.open(id)
    },
    [actions, bookmarks, onNavigate],
  )

  const targetIds = useCallback(
    () => (selection.selected.length > 0 ? selection.selected : library.visible.map((b) => b.id)),
    [library.visible, selection.selected],
  )

  const handleTrash = useCallback(async () => {
    if (selection.selected.length === 0) return
    if (inTrash) {
      const count = await actions.purge(selection.selected)
      toast.push({ title: `${formatCount(count)} 件を完全に削除しました`, tone: 'danger' })
      return
    }
    const count = await actions.trash(selection.selected)
    toast.push({ title: `${formatCount(count)} 件をゴミ箱へ移動しました` })
  }, [actions, inTrash, selection.selected, toast])

  const handleCheckLinks = useCallback(async () => {
    const ids = targetIds().slice(0, LINK_CHECK_LIMIT)
    if (ids.length === 0) return
    setChecking(true)
    toast.push({ title: `${formatCount(ids.length)} 件のリンクを検査しています…` })
    try {
      const broken = await actions.checkLinks(ids)
      toast.push({
        title: broken > 0 ? `${formatCount(broken)} 件のリンク切れを検出しました` : 'リンク切れはありませんでした',
        tone: broken > 0 ? 'danger' : 'success',
      })
    } finally {
      setChecking(false)
    }
  }, [actions, targetIds, toast])

  const handleImport = useCallback(async () => {
    const summary = await window.sbm.io.importFile()
    if (!summary) return
    await refresh()
    toast.push({
      title: `${summary.fileName} を取り込みました`,
      description: `新規 ${formatCount(summary.imported)} 件 / マージ ${formatCount(summary.merged)} 件`,
      tone: 'success',
    })
  }, [refresh, toast])

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      const summary = await window.sbm.io.exportFile(format, false)
      if (!summary) return
      toast.push({
        title: `${formatCount(summary.count)} 件を書き出しました`,
        description: summary.filePath,
        tone: 'success',
      })
    },
    [toast],
  )

  const handleCopy = useCallback(
    async (url: string) => {
      await window.sbm.system.copyText(url)
      toast.push({ title: 'URL をコピーしました' })
    },
    [toast],
  )

  const commands = useMemo<PaletteCommand[]>(
    () => [
      { id: 'add', label: 'ブックマークを追加', hint: 'Ctrl+N', run: () => capture.openAdd() },
      { id: 'import', label: 'ブックマークを取り込む', hint: 'HTML / JSON', run: () => void handleImport() },
      { id: 'export', label: 'JSON で書き出す', hint: 'export', run: () => void handleExport('json') },
      { id: 'check', label: '表示中のリンク切れを検査', hint: 'check', run: () => void handleCheckLinks() },
      {
        id: 'empty-trash',
        label: 'ゴミ箱を空にする',
        hint: 'trash',
        run: () => {
          void actions.purge('trash').then((count) => toast.push({ title: `${formatCount(count)} 件を削除しました`, tone: 'danger' }))
        },
      },
      { id: 'settings', label: '設定を開く', hint: 'settings', run: onOpenSettings },
      { id: 'lock', label: 'ヴォールトをロック', hint: 'Ctrl+L', run: () => void lock() },
    ],
    [actions, capture, handleCheckLinks, handleExport, handleImport, lock, onOpenSettings, toast],
  )

  useAppHotkeys(
    useMemo(
      () => ({
        onPalette: () => setPaletteOpen(true),
        onAdd: () => capture.openAdd(),
        onSearch: () => searchRef.current?.focus(),
        onSelectAll: selection.selectAll,
        onDelete: () => void handleTrash(),
        onLock: () => void lock(),
        onEscape: () => {
          setPaletteOpen(false)
          selection.clear()
        },
      }),
      [capture, handleTrash, lock, selection],
    ),
    true,
  )

  const emptyMessage = inTrash
    ? 'ゴミ箱は空です。'
    : filter.query || filter.tags.length > 0
      ? '条件に一致するブックマークがありません。検索語やタグの絞り込みを見直してください。'
      : 'URL をコピーするか、Ctrl+N で最初のブックマークを追加してください。'

  return (
    <>
      {/* ブラウザは常にマウントしたままにして、ライブラリへ戻ってもページを保つ。 */}
      <div className={cn('min-h-0 flex-1', mode === 'library' ? 'flex' : 'hidden')}>
        <Sidebar
          filter={filter}
          counts={library.counts}
          tagCounts={library.tagCounts}
          onChangeView={(view: SmartView) => setFilter((current) => ({ ...current, view }))}
          onToggleTag={(tag) =>
            setFilter((current) => ({
              ...current,
              tags: current.tags.includes(tag) ? current.tags.filter((t) => t !== tag) : [...current.tags, tag],
            }))
          }
          onClearTags={() => setFilter((current) => ({ ...current, tags: [] }))}
          onRenameTag={(from, to) => {
            void actions.renameTag(from, to).then((count) => {
              setFilter((current) => ({ ...current, tags: current.tags.map((t) => (t === from ? to : t)) }))
              toast.push({ title: `${formatCount(count)} 件のタグを変更しました` })
            })
          }}
          onRemoveTag={(tag) => {
            void actions.renameTag(tag, '').then((count) => {
              setFilter((current) => ({ ...current, tags: current.tags.filter((t) => t !== tag) }))
              toast.push({ title: `${formatCount(count)} 件からタグを外しました` })
            })
          }}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <Toolbar
            ref={searchRef}
            query={filter.query}
            onQueryChange={(query) => setFilter((current) => ({ ...current, query }))}
            sortMode={settings.sortMode}
            onSortChange={(sortMode) => void updateSettings({ sortMode })}
            viewMode={settings.viewMode}
            onViewModeChange={(viewMode) => void updateSettings({ viewMode })}
            view={filter.view}
            selectedCount={selection.selected.length}
            checking={checking}
            onAdd={() => capture.openAdd()}
            onImport={() => void handleImport()}
            onExport={(format) => void handleExport(format)}
            onBulkTags={() => setBulkOpen(true)}
            onCheckLinks={() => void handleCheckLinks()}
            onTrash={() => void handleTrash()}
            onRestore={() => {
              void actions.restore(selection.selected).then((count) =>
                toast.push({ title: `${formatCount(count)} 件を元に戻しました`, tone: 'success' }),
              )
            }}
            onEmptyTrash={() => void handleTrash()}
          />

          <BookmarkList
            groups={library.groups}
            favicons={favicons}
            selectedSet={selection.selectedSet}
            emptyMessage={emptyMessage}
            onSelect={selection.select}
            onOpen={openBookmark}
            onToggleFavorite={(id, favorite) => void actions.setFavorite([id], favorite)}
            onClearSelection={selection.clear}
          />
        </main>

        <Inspector
          bookmark={focused}
          selectedCount={selection.selected.length}
          onUpdate={(id, patch) => void actions.update(id, patch)}
          onOpen={openBookmark}
          onCopy={(url) => void handleCopy(url)}
          onEdit={capture.openEdit}
          onTrash={() => void handleTrash()}
          onCheckLinks={() => void handleCheckLinks()}
        />
      </div>

      <Browser
        visible={mode === 'browser'}
        homeUrl={settings.browserHomeUrl}
        onBookmarkPage={(url, title, contentsId) => capture.openAdd(url, title, contentsId)}
      />

      <StatusBar
        visibleCount={library.visible.length}
        totalCount={library.counts.all}
        selectedCount={selection.selected.length}
        settings={settings}
        saveState={saveState}
      />

      <CaptureDialog draft={capture.draft} onClose={capture.close} onSubmit={capture.submit} />
      <DuplicateDialog
        prompt={capture.duplicate}
        onResolve={capture.resolveDuplicate}
        onDismiss={capture.dismissDuplicate}
      />
      <BulkTagDialog
        open={bulkOpen}
        targetCount={selection.selected.length}
        onClose={() => setBulkOpen(false)}
        onApply={async (mode, tags) => {
          const count = await actions.bulkTags(selection.selected, mode, tags)
          setBulkOpen(false)
          toast.push({ title: `${formatCount(count)} 件のタグを更新しました`, tone: 'success' })
        }}
      />
      <CommandPalette
        open={paletteOpen}
        bookmarks={bookmarks}
        favicons={favicons}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
        onOpenBookmark={openBookmark}
      />
    </>
  )
}
