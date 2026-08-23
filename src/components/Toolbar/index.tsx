import { forwardRef } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ArchiveRestore,
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  LayoutList,
  ListTree,
  Plus,
  RadioTower,
  Search,
  Tags,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import type { ExportFormat, SortMode, ViewMode } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import type { SmartView } from '@/lib/library'
import { formatCount } from '@/lib/format'

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'added-desc', label: '追加順 新→旧' },
  { value: 'added-asc', label: '追加順 旧→新' },
  { value: 'title-asc', label: 'タイトル 昇順' },
  { value: 'title-desc', label: 'タイトル 降順' },
  { value: 'opened-desc', label: '最近開いた順' },
  { value: 'opencount-desc', label: 'よく開く順' },
  { value: 'updated-desc', label: '更新順' },
]

const EXPORT_OPTIONS: { format: ExportFormat; label: string }[] = [
  { format: 'json', label: 'JSON（再取り込み用）' },
  { format: 'html', label: 'ブックマーク HTML' },
  { format: 'csv', label: 'CSV' },
]

const MENU_ITEM =
  'flex cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-slate-300 outline-none data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-slate-100'

export interface ToolbarProps {
  query: string
  onQueryChange: (value: string) => void
  sortMode: SortMode
  onSortChange: (mode: SortMode) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  groupsCollapsible: boolean
  allCollapsed: boolean
  onToggleAllGroups: () => void
  view: SmartView
  selectedCount: number
  checking: boolean
  onAdd: () => void
  onImport: () => void
  onExport: (format: ExportFormat) => void
  onBulkTags: () => void
  onCheckLinks: () => void
  onTrash: () => void
  onRestore: () => void
  onEmptyTrash: () => void
}

export const Toolbar = forwardRef<HTMLInputElement, ToolbarProps>(function Toolbar(
  {
    query,
    onQueryChange,
    sortMode,
    onSortChange,
    viewMode,
    onViewModeChange,
    groupsCollapsible,
    allCollapsed,
    onToggleAllGroups,
    view,
    selectedCount,
    checking,
    onAdd,
    onImport,
    onExport,
    onBulkTags,
    onCheckLinks,
    onTrash,
    onRestore,
    onEmptyTrash,
  },
  ref,
) {
  const hasSelection = selectedCount > 0
  const inTrash = view === 'trash'

  return (
    // 幅が足りないときはボタンを潰さず、右側のグループを次の行へ送る。
    <div className="flex min-h-[3.25rem] shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.06] px-3 py-2">
      <div className="flex min-w-[17rem] flex-1 items-center gap-2">
        <div className="relative min-w-0 max-w-xl flex-1">
          <Input
            ref={ref}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="検索　tag: site: is:favorite"
            leading={<Search className="h-3.5 w-3.5" />}
            trailing={
              query ? (
                <IconButton
                  label="検索条件をクリア"
                  icon={<X className="h-3.5 w-3.5" />}
                  onClick={() => onQueryChange('')}
                />
              ) : null
            }
            className="w-full"
          />
        </div>

        <Select
          value={sortMode}
          onChange={onSortChange}
          options={SORT_OPTIONS}
          ariaLabel="並び替え"
          className="w-[10.5rem] shrink-0"
        />

        {groupsCollapsible ? (
          <IconButton
            label={allCollapsed ? 'すべてのグループを開く' : 'すべてのグループをたたむ'}
            icon={
              allCollapsed ? <ChevronsUpDown className="h-4 w-4" /> : <ChevronsDownUp className="h-4 w-4" />
            }
            onClick={onToggleAllGroups}
          />
        ) : null}

        <IconButton
          label={viewMode === 'grouped' ? 'グループ表示（クリックで一覧表示）' : '一覧表示（クリックでグループ表示）'}
          icon={viewMode === 'grouped' ? <ListTree className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
          onClick={() => onViewModeChange(viewMode === 'grouped' ? 'flat' : 'grouped')}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {hasSelection ? (
          <div className="flex shrink-0 items-center gap-1 rounded-lg border border-teal-500/20 bg-teal-500/10 px-2 py-1">
            <span className="whitespace-nowrap font-mono text-xs text-teal-200">{formatCount(selectedCount)} 選択</span>
            {inTrash ? (
              <>
                <IconButton label="元に戻す" icon={<ArchiveRestore className="h-3.5 w-3.5" />} onClick={onRestore} />
                <IconButton
                  label="完全に削除"
                  tone="danger"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={onEmptyTrash}
                />
              </>
            ) : (
              <>
                <IconButton label="タグを一括編集" icon={<Tags className="h-3.5 w-3.5" />} onClick={onBulkTags} />
                <IconButton
                  label="リンク切れを検査"
                  icon={<RadioTower className="h-3.5 w-3.5" />}
                  onClick={onCheckLinks}
                  disabled={checking}
                />
                <IconButton
                  label="ゴミ箱へ移動 (Delete)"
                  tone="danger"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={onTrash}
                />
              </>
            )}
          </div>
        ) : null}

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button size="sm" icon={<Download className="h-3.5 w-3.5" />} aria-label="入出力">
              <span className="hidden xl:inline">入出力</span>
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="surface-panel z-[60] min-w-[14rem] rounded-lg bg-ink-850/95 p-1 shadow-panel animate-fade-in"
            >
              <DropdownMenu.Item onSelect={onImport} className={MENU_ITEM}>
                <Upload className="h-3.5 w-3.5 text-slate-400" />
                取り込む（HTML / JSON）
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-white/[0.06]" />
              {EXPORT_OPTIONS.map((option) => (
                <DropdownMenu.Item key={option.format} onSelect={() => onExport(option.format)} className={MENU_ITEM}>
                  <Download className="h-3.5 w-3.5 text-slate-400" />
                  {option.label}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={onAdd}>
          追加
        </Button>
      </div>
    </div>
  )
})
