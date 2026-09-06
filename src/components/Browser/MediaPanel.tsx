import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  Download,
  Film,
  FolderDown,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  PenLine,
  Radio,
  RefreshCw,
  X,
} from 'lucide-react'
import type { AlbumBundle, AlbumDownloadProgress, AlbumMediaItem, MediaCandidate } from '@shared/types'
import { isAlbumUrl } from '@shared/url'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { formatCount, truncateUrl } from '@/lib/format'
import { useVault } from '@/state/VaultProvider'

export interface AlbumDownloadOptions {
  concatVideos?: boolean
  createSlideshow?: boolean
  slideshowDuration?: number
}

export interface MediaPanelProps {
  candidates: MediaCandidate[]
  album: AlbumBundle | null
  albumProgress: AlbumDownloadProgress | null
  pageUrl: string
  ffmpegAvailable: boolean
  scanning: boolean
  onClose: () => void
  onRescan: () => void
  onSave: (candidate: MediaCandidate, saveAs: boolean) => void
  onSaveAlbumItem?: (item: AlbumMediaItem, saveAs: boolean) => void
  onDownloadAlbum: (
    album: AlbumBundle,
    title: string,
    saveAs: boolean,
    withIndexPrefix: boolean,
    options?: AlbumDownloadOptions,
  ) => void
  onCancelAlbumDownload?: (taskId: string) => void
  onRevealAlbum?: (taskId: string) => void
}

function formatSize(bytes: number | null): string {
  if (!bytes) return 'サイズ不明'
  const mb = bytes / 1048576
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`
}

type TabFilter = 'all' | 'video' | 'image'

export function MediaPanel({
  candidates,
  album,
  albumProgress,
  pageUrl,
  ffmpegAvailable,
  scanning,
  onClose,
  onRescan,
  onSave,
  onSaveAlbumItem,
  onDownloadAlbum,
  onCancelAlbumDownload,
  onRevealAlbum,
}: MediaPanelProps) {
  const { settings, updateSettings } = useVault()
  const [albumTitle, setAlbumTitle] = useState(album?.title ?? '')
  const [withIndexPrefix, setWithIndexPrefix] = useState(true)
  const [tabFilter, setTabFilter] = useState<TabFilter>('all')

  const isAlbumPage = isAlbumUrl(pageUrl)

  useEffect(() => {
    if (album?.title) {
      setAlbumTitle(album.title)
    }
  }, [album?.title])

  const [concatVideos, setConcatVideos] = useState(settings?.albumConcatVideos ?? false)
  const [createSlideshow, setCreateSlideshow] = useState(settings?.albumCreateSlideshow ?? false)
  const [generateBoth, setGenerateBoth] = useState(settings?.albumGenerateBoth ?? false)

  useEffect(() => {
    if (settings) {
      setConcatVideos(settings.albumConcatVideos ?? false)
      setCreateSlideshow(settings.albumCreateSlideshow ?? false)
      setGenerateBoth(settings.albumGenerateBoth ?? false)
    }
  }, [settings?.albumConcatVideos, settings?.albumCreateSlideshow, settings?.albumGenerateBoth])

  const toggleConcatVideos = (checked: boolean) => {
    const nextConcat = checked
    const nextSlideshow = createSlideshow
    const nextBoth = nextConcat && nextSlideshow
    setConcatVideos(nextConcat)
    setGenerateBoth(nextBoth)
    void updateSettings({ albumConcatVideos: nextConcat, albumGenerateBoth: nextBoth })
  }

  const toggleCreateSlideshow = (checked: boolean) => {
    const nextSlideshow = checked
    const nextConcat = concatVideos
    const nextBoth = nextConcat && nextSlideshow
    setCreateSlideshow(nextSlideshow)
    setGenerateBoth(nextBoth)
    void updateSettings({ albumCreateSlideshow: nextSlideshow, albumGenerateBoth: nextBoth })
  }

  const toggleGenerateBoth = (checked: boolean) => {
    setConcatVideos(checked)
    setCreateSlideshow(checked)
    setGenerateBoth(checked)
    void updateSettings({
      albumConcatVideos: checked,
      albumCreateSlideshow: checked,
      albumGenerateBoth: checked,
    })
  }

  useEffect(() => {
    if (album?.title) setAlbumTitle(album.title)
  }, [album?.title])

  const filteredAlbumItems = useMemo(() => {
    if (!album) return []
    if (tabFilter === 'video') return album.items.filter((item) => item.kind === 'video')
    if (tabFilter === 'image') return album.items.filter((item) => item.kind === 'image')
    return album.items
  }, [album, tabFilter])

  const isDownloading = albumProgress?.status === 'running'
  const isCompleted = albumProgress?.status === 'completed'
  const progressPercent =
    albumProgress && albumProgress.totalCount > 0
      ? Math.round((albumProgress.completedCount / albumProgress.totalCount) * 100)
      : 0

  return (
    <aside className="flex w-[26rem] shrink-0 flex-col border-l border-white/[0.06] bg-ink-900/95 shadow-panel">
      <header className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
        <Film className="h-4 w-4 text-teal-300" />
        <span className="label-caps flex-1">
          {album ? `${album.site} album` : 'detected media'}
        </span>
        <span className="font-mono text-xs text-slate-400">
          {formatCount(album ? album.items.length : candidates.length)}
        </span>
        <IconButton
          label="ページを調べ直す"
          icon={<RefreshCw className={cn('h-3.5 w-3.5', scanning && 'animate-spin')} />}
          onClick={onRescan}
          disabled={scanning}
        />
        <IconButton label="閉じる" icon={<X className="h-3.5 w-3.5" />} onClick={onClose} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {album ? (
          <section className="mb-3 rounded-xl border border-teal-500/25 bg-gradient-to-b from-teal-500/[0.08] to-emerald-500/[0.03] p-3 shadow-glow">
            <div className="flex items-center gap-2">
              <FolderDown className="h-4 w-4 text-teal-300" />
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-200">
                アルバム一括保存
              </span>
              <span className="ml-auto rounded bg-teal-500/15 px-1.5 py-0.5 text-xs font-medium text-teal-300">
                {album.site}
              </span>
            </div>

            {/* 最上部メインアクションボタン（スクロールせず即座に保存可能） */}
            {!isDownloading && !isCompleted && (
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                <Button
                  size="md"
                  variant="primary"
                  icon={<FolderDown className="h-4 w-4" />}
                  onClick={() =>
                    onDownloadAlbum(album, albumTitle, false, withIndexPrefix, {
                      concatVideos,
                      createSlideshow,
                      slideshowDuration: settings?.albumSlideshowDuration ?? 3,
                    })
                  }
                  className="col-span-2 shadow-glow text-xs font-semibold"
                >
                  フォルダーとして保存
                </Button>
                <Button
                  size="md"
                  onClick={() =>
                    onDownloadAlbum(album, albumTitle, true, withIndexPrefix, {
                      concatVideos,
                      createSlideshow,
                      slideshowDuration: settings?.albumSlideshowDuration ?? 3,
                    })
                  }
                  className="text-xs"
                >
                  保存先を選ぶ
                </Button>
              </div>
            )}

            <div className="mt-3">
              <label className="text-[11px] font-medium text-slate-400">保存フォルダー名</label>
              <Input
                value={albumTitle}
                onChange={(e) => setAlbumTitle(e.target.value)}
                placeholder="フォルダー名を入力"
                spellCheck={false}
                className="mt-1 w-full text-xs"
                disabled={isDownloading}
              />
            </div>

            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
                  <ImageIcon className="h-3 w-3 text-teal-300" />
                  画像 {album.imageCount}
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
                  <Film className="h-3 w-3 text-emerald-300" />
                  動画 {album.videoCount}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setWithIndexPrefix((v) => !v)}
                disabled={isDownloading}
                className="flex items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-slate-200"
              >
                <span
                  className={cn(
                    'grid h-3.5 w-3.5 place-items-center rounded border transition-colors',
                    withIndexPrefix
                      ? 'border-teal-500 bg-teal-500/20 text-teal-300'
                      : 'border-white/20 bg-black/40',
                  )}
                >
                  {withIndexPrefix && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                </span>
                連番プレフィックス
              </button>
            </div>

            <div className="mt-2.5 border-t border-white/[0.06] pt-2">
              <div className="text-[10px] font-medium tracking-wider text-slate-400">
                結合・動画化オプション
              </div>
              <div className="mt-1.5 space-y-1.5">
                <button
                  type="button"
                  onClick={() => toggleConcatVideos(!concatVideos)}
                  disabled={isDownloading || !ffmpegAvailable}
                  className="flex items-center gap-1.5 text-[11px] text-slate-300 transition-colors hover:text-white disabled:opacity-50"
                >
                  <span
                    className={cn(
                      'grid h-3.5 w-3.5 shrink-0 place-items-center rounded border transition-colors',
                      concatVideos
                        ? 'border-teal-500 bg-teal-500/20 text-teal-300'
                        : 'border-white/20 bg-black/40',
                    )}
                  >
                    {concatVideos && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                  </span>
                  <span>動画は動画で全部くっつけてからDLする</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleCreateSlideshow(!createSlideshow)}
                  disabled={isDownloading || !ffmpegAvailable}
                  className="flex items-center gap-1.5 text-[11px] text-slate-300 transition-colors hover:text-white disabled:opacity-50"
                >
                  <span
                    className={cn(
                      'grid h-3.5 w-3.5 shrink-0 place-items-center rounded border transition-colors',
                      createSlideshow
                        ? 'border-teal-500 bg-teal-500/20 text-teal-300'
                        : 'border-white/20 bg-black/40',
                    )}
                  >
                    {createSlideshow && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                  </span>
                  <span>画像だけくっつけた動画にする（1コマ{settings?.albumSlideshowDuration ?? 3}秒）</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleGenerateBoth(!generateBoth)}
                  disabled={isDownloading || !ffmpegAvailable}
                  className="flex items-center gap-1.5 text-[11px] text-slate-300 transition-colors hover:text-white disabled:opacity-50"
                >
                  <span
                    className={cn(
                      'grid h-3.5 w-3.5 shrink-0 place-items-center rounded border transition-colors',
                      generateBoth
                        ? 'border-teal-500 bg-teal-500/20 text-teal-300'
                        : 'border-white/20 bg-black/40',
                    )}
                  >
                    {generateBoth && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                  </span>
                  <span>その両方を生成する</span>
                </button>
              </div>
            </div>

            {isDownloading && albumProgress ? (
              <div className="mt-3 rounded-lg border border-teal-500/20 bg-black/40 p-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-teal-300">取得中...</span>
                  <span className="font-mono text-slate-300">
                    {albumProgress.completedCount} / {albumProgress.totalCount} 件 ({progressPercent}%)
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-200"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {albumProgress.currentFileName && (
                  <p className="mt-1.5 truncate font-mono text-[11px] text-slate-400">
                    {albumProgress.currentFileName}
                  </p>
                )}
                {onCancelAlbumDownload && (
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => onCancelAlbumDownload(albumProgress.taskId)}
                    >
                      保存を中止
                    </Button>
                  </div>
                )}
              </div>
            ) : isCompleted ? (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs">
                <span className="text-emerald-300">
                  ✓ 保存完了（{albumProgress?.completedCount} 件）
                </span>
                {onRevealAlbum && albumProgress && (
                  <Button
                    size="sm"
                    icon={<FolderOpen className="h-3.5 w-3.5" />}
                    onClick={() => onRevealAlbum(albumProgress.taskId)}
                  >
                    フォルダーを開く
                  </Button>
                )}
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    onDownloadAlbum(album, albumTitle, true, withIndexPrefix, {
                      concatVideos,
                      createSlideshow,
                      slideshowDuration: settings?.albumSlideshowDuration ?? 3,
                    })
                  }
                >
                  保存先を選ぶ
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<FolderDown className="h-3.5 w-3.5" />}
                  onClick={() =>
                    onDownloadAlbum(album, albumTitle, false, withIndexPrefix, {
                      concatVideos,
                      createSlideshow,
                      slideshowDuration: settings?.albumSlideshowDuration ?? 3,
                    })
                  }
                >
                  フォルダーとして保存
                </Button>
              </div>
            )}
          </section>
        ) : isAlbumPage ? (
          <section className="mb-3 rounded-xl border border-teal-500/25 bg-gradient-to-b from-teal-500/[0.08] to-emerald-500/[0.03] p-3 shadow-glow">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-teal-300" />
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-200">
                アルバムメディアを解析中...
              </span>
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              ページ内の画像と動画を検出しています。解析が完了すると一括保存オプションが表示されます。
            </p>
            <div className="mt-2.5">
              <Button
                size="sm"
                variant="primary"
                onClick={onRescan}
                disabled={scanning}
                icon={<RefreshCw className={cn('h-3.5 w-3.5', scanning && 'animate-spin')} />}
                className="text-xs"
              >
                {scanning ? '解析中...' : '今すぐ再検出'}
              </Button>
            </div>
          </section>
        ) : null}

        {album ? (
          <div>
            <div className="mb-2 flex items-center gap-1 border-b border-white/[0.06] pb-1.5">
              <button
                type="button"
                onClick={() => setTabFilter('all')}
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                  tabFilter === 'all'
                    ? 'bg-teal-500/15 text-teal-300'
                    : 'text-slate-400 hover:text-slate-200',
                )}
              >
                すべて ({album.items.length})
              </button>
              <button
                type="button"
                onClick={() => setTabFilter('image')}
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                  tabFilter === 'image'
                    ? 'bg-teal-500/15 text-teal-300'
                    : 'text-slate-400 hover:text-slate-200',
                )}
              >
                画像 ({album.imageCount})
              </button>
              <button
                type="button"
                onClick={() => setTabFilter('video')}
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                  tabFilter === 'video'
                    ? 'bg-teal-500/15 text-teal-300'
                    : 'text-slate-400 hover:text-slate-200',
                )}
              >
                動画 ({album.videoCount})
              </button>
            </div>

            <div className="space-y-1.5">
              {filteredAlbumItems.map((item) => {
                const isVideo = item.kind === 'video'
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5 hover:bg-white/[0.04]"
                  >
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt={item.fileName}
                        className="h-9 w-9 shrink-0 rounded object-cover border border-white/[0.08]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded bg-black/40 border border-white/[0.08]">
                        {isVideo ? (
                          <Film className="h-4 w-4 text-emerald-300" />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-teal-300" />
                        )}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-slate-300" title={item.fileName}>
                        {item.fileName}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span
                          className={cn(
                            'rounded px-1 text-[10px] uppercase font-mono',
                            isVideo ? 'bg-emerald-500/10 text-emerald-300' : 'bg-teal-500/10 text-teal-300',
                          )}
                        >
                          {isVideo ? 'video' : 'image'}
                        </span>
                        <span className="truncate font-mono text-[10px] text-slate-500" title={item.url}>
                          {truncateUrl(item.url, 48)}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {onSaveAlbumItem && (
                        <>
                          <IconButton
                            label="名前を付けて保存"
                            icon={<PenLine className="h-3.5 w-3.5" />}
                            onClick={() => onSaveAlbumItem(item, true)}
                          />
                          <IconButton
                            label="保存"
                            tone="accent"
                            icon={<Download className="h-3.5 w-3.5" />}
                            onClick={() => onSaveAlbumItem(item, false)}
                          />
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : candidates.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-slate-400">
            まだ何も見つかっていません。動画を再生してから、上の更新ボタンでページを調べ直してください。
          </p>
        ) : (
          candidates.map((candidate) => {
            const isStream = candidate.kind === 'hls'
            const blocked = isStream && !ffmpegAvailable
            return (
              <div
                key={candidate.id}
                className="mb-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs',
                      isStream ? 'bg-emerald-500/10 text-emerald-300' : 'bg-teal-500/10 text-teal-300',
                    )}
                  >
                    {isStream ? <Radio className="h-3 w-3" /> : <Film className="h-3 w-3" />}
                    {isStream ? 'ストリーム' : 'ファイル'}
                  </span>
                  <span className="flex-1 truncate font-mono text-xs text-slate-400">
                    {candidate.mimeType ?? '種類不明'}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-slate-400">
                    {formatSize(candidate.sizeBytes)}
                  </span>
                </div>

                <p className="mt-1.5 break-all font-mono text-xs text-slate-300" title={candidate.url}>
                  {truncateUrl(candidate.url, 96)}
                </p>

                <div className="mt-2 flex items-center justify-between gap-2">
                  {blocked ? (
                    <span className="text-xs text-amber-300">ffmpeg が必要です</span>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                      {isStream ? '結合して mp4 で保存' : '直接保存'}
                    </span>
                  )}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      size="sm"
                      icon={<PenLine className="h-3.5 w-3.5" />}
                      disabled={blocked}
                      onClick={() => onSave({ ...candidate, pageUrl }, true)}
                    >
                      名前を付けて
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Download className="h-3.5 w-3.5" />}
                      disabled={blocked}
                      onClick={() => onSave({ ...candidate, pageUrl }, false)}
                    >
                      保存
                    </Button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
