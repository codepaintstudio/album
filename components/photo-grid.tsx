'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ErrorAlert } from '@/components/ui/error-alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useShallowIdParam, useShallowParam } from '@/lib/query-state';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Play } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useMemo, useState, useTransition } from 'react';

interface PhotoItem {
  id: number;
  filename: string;
  originalName: string | null;
  description: string | null;
  createdAt: string;
  uploader: string;
  thumbnailUrl: string | null;
  mediaType: 'image' | 'video';
  fileUrl: string;
  isOwner: boolean;
}

interface PhotoGridProps {
  photos: PhotoItem[];
  canManageAll?: boolean;
  allowOwnActions?: boolean;
  downloadStrategy?: 'api' | 'public';
}

export function PhotoGrid({
  photos,
  canManageAll = false,
  allowOwnActions = false,
  downloadStrategy = 'api',
}: PhotoGridProps) {
  const router = useRouter();
  // router.refresh() 本身没有视觉反馈，用一次 transition 让列表在刷新时变暗
  const [isPending, startTransition] = useTransition();
  // 灯箱由 ?photo= 驱动：打开时 pushState，浏览器返回键先关灯箱而不离开页面
  const [activePhotoId, setActivePhotoId] = useShallowIdParam('photo');
  const activePhoto = useMemo(
    () => photos.find(photo => String(photo.id) === activePhotoId) ?? null,
    [photos, activePhotoId]
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [viewMode, setViewMode] = useShallowParam<'grid' | 'list'>(
    'view',
    ['grid', 'list'],
    'grid'
  );
  const [zoomLevel, setZoomLevel] = useShallowParam<'day' | 'month' | 'year'>(
    'group',
    ['day', 'month', 'year'],
    'day'
  );
  const [pinchDistance, setPinchDistance] = useState<number | null>(null);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        items: PhotoItem[];
      }
    >();

    photos.forEach(photo => {
      const date = new Date(photo.createdAt);
      let key: string;
      let label: string;

      switch (zoomLevel) {
        case 'year':
          key = format(date, 'yyyy');
          label = format(date, 'yyyy年', { locale: zhCN });
          break;
        case 'month':
          key = format(date, 'yyyy-MM');
          label = format(date, 'yyyy年MM月', { locale: zhCN });
          break;
        case 'day':
        default:
          key = format(date, 'yyyy-MM-dd');
          label = format(date, 'yyyy年MM月dd日 EEEE', { locale: zhCN });
          break;
      }

      if (!map.has(key)) {
        map.set(key, { key, label, items: [] });
      }
      map.get(key)!.items.push(photo);
    });

    return Array.from(map.values());
  }, [photos, zoomLevel]);

  const selectedPhotos = useMemo(
    () => photos.filter(photo => selectedIds.has(photo.id)),
    [photos, selectedIds]
  );

  const selectedCount = selectedPhotos.length;

  const canManagePhoto = useCallback(
    (photo: PhotoItem) => canManageAll || (allowOwnActions && photo.isOwner),
    [allowOwnActions, canManageAll]
  );

  const allSelectedManageable =
    selectedCount > 0 && selectedPhotos.every(photo => canManagePhoto(photo));

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
    setActionError(null);
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectionMode(true);
    setSelectedIds(new Set(photos.map(photo => photo.id)));
  }, [photos]);

  const handleDelete = useCallback(async () => {
    if (selectedCount === 0 || !allSelectedManageable) {
      setActionError('请选择可删除的媒体');
      return;
    }

    if (!window.confirm(`确认删除已选中的 ${selectedCount} 张照片？`)) {
      return;
    }

    setIsProcessing(true);
    setActionError(null);
    try {
      const response = await fetch('/api/photos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedPhotos.map(photo => photo.id) }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? '删除失败');
      }
      clearSelection();
      startTransition(() => router.refresh());
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除失败';
      setActionError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [allSelectedManageable, clearSelection, router, selectedCount, selectedPhotos]);

  const handleRename = useCallback(() => {
    if (selectedCount !== 1) {
      setActionError('请选择一个媒体进行重命名');
      return;
    }

    const target = selectedPhotos[0];
    if (!canManagePhoto(target)) {
      setActionError('仅可修改自己上传或有权限的媒体');
      return;
    }

    setRenameValue(target.description ?? '');
    setRenameOpen(true);
  }, [canManagePhoto, selectedCount, selectedPhotos]);

  const submitRename = useCallback(async () => {
    if (selectedPhotos.length !== 1) {
      return;
    }

    const target = selectedPhotos[0];
    setIsProcessing(true);
    setActionError(null);
    try {
      const response = await fetch('/api/photos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: target.id, description: renameValue }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? '重命名失败');
      }
      setRenameOpen(false);
      clearSelection();
      startTransition(() => router.refresh());
    } catch (error) {
      const message = error instanceof Error ? error.message : '重命名失败';
      setActionError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [clearSelection, renameValue, router, selectedPhotos]);

  const handleDownload = useCallback(async () => {
    if (selectedCount === 0) {
      setActionError('请选择需要下载的媒体');
      return;
    }

    setIsProcessing(true);
    setActionError(null);
    try {
      if (downloadStrategy === 'api') {
        const response = await fetch('/api/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selectedPhotos.map(photo => photo.id) }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error ?? '下载失败');
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `photos-${Date.now()}.zip`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } else {
        selectedPhotos.forEach(photo => {
          const link = document.createElement('a');
          link.href = photo.fileUrl;
          link.download = photo.originalName ?? photo.filename;
          link.rel = 'noopener';
          document.body.appendChild(link);
          link.click();
          link.remove();
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '下载失败';
      setActionError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [downloadStrategy, selectedCount, selectedPhotos]);

  const handleRowClick = useCallback(
    (photo: PhotoItem) => {
      if (selectionMode) {
        toggleSelection(photo.id);
      } else {
        setActivePhotoId(String(photo.id));
      }
    },
    [selectionMode, toggleSelection, setActivePhotoId]
  );

  const handleCopyLink = useCallback((photo: PhotoItem) => {
    navigator.clipboard
      .writeText(photo.fileUrl)
      .catch(() => setActionError('复制失败，请手动复制'));
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoomLevel(prev => {
      if (prev === 'year') return 'month';
      if (prev === 'month') return 'day';
      return 'day';
    });
  }, [setZoomLevel]);

  const handleZoomOut = useCallback(() => {
    setZoomLevel(prev => {
      if (prev === 'day') return 'month';
      if (prev === 'month') return 'year';
      return 'year';
    });
  }, [setZoomLevel]);

  const handleWheel = useCallback(
    (event: React.WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (event.deltaY < 0) {
          handleZoomIn();
        } else if (event.deltaY > 0) {
          handleZoomOut();
        }
      }
    },
    [handleZoomIn, handleZoomOut]
  );

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    if (event.touches.length === 2) {
      const distance = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY
      );
      setPinchDistance(distance);
    }
  }, []);

  const handleTouchMove = useCallback(
    (event: React.TouchEvent) => {
      if (event.touches.length === 2 && pinchDistance !== null) {
        const distance = Math.hypot(
          event.touches[0].clientX - event.touches[1].clientX,
          event.touches[0].clientY - event.touches[1].clientY
        );
        const delta = distance - pinchDistance;

        if (Math.abs(delta) > 50) {
          if (delta > 0) {
            handleZoomIn();
          } else {
            handleZoomOut();
          }
          setPinchDistance(distance);
        }
      }
    },
    [pinchDistance, handleZoomIn, handleZoomOut]
  );

  const handleTouchEnd = useCallback(() => {
    setPinchDistance(null);
  }, []);

  const gridColsClass = useMemo(() => {
    switch (zoomLevel) {
      case 'year':
        return 'sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8';
      case 'month':
        return 'sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6';
      case 'day':
      default:
        return 'sm:grid-cols-2 lg:grid-cols-3';
    }
  }, [zoomLevel]);

  const cardPaddingClass = useMemo(() => {
    switch (zoomLevel) {
      case 'year':
        return 'p-1.5';
      case 'month':
        return 'p-2';
      case 'day':
      default:
        return 'p-3';
    }
  }, [zoomLevel]);

  const textSizeClass = useMemo(() => {
    switch (zoomLevel) {
      case 'year':
        return 'text-xs';
      case 'month':
        return 'text-xs';
      case 'day':
      default:
        return 'text-sm';
    }
  }, [zoomLevel]);

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="text-muted-foreground text-sm">
            {selectionMode
              ? selectedCount > 0
                ? `已选择 ${selectedCount} 个媒体`
                : '点击媒体以选择'
              : '点击媒体查看详情，或开启选择模式进行批量操作'}
          </div>
          {!selectionMode && (
            <div className="text-muted-foreground/70 text-xs">Ctrl+滚轮 或 双指捏合 可缩放视图</div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="border-border flex items-center rounded-md border p-1">
            <Button
              type="button"
              variant={zoomLevel === 'day' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setZoomLevel('day')}
              title="按天显示"
            >
              天
            </Button>
            <Button
              type="button"
              variant={zoomLevel === 'month' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setZoomLevel('month')}
              title="按月显示"
            >
              月
            </Button>
            <Button
              type="button"
              variant={zoomLevel === 'year' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setZoomLevel('year')}
              title="按年显示"
            >
              年
            </Button>
          </div>
          <div className="border-border flex items-center rounded-md border p-1">
            <Button
              type="button"
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              网格
            </Button>
            <Button
              type="button"
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              列表
            </Button>
          </div>
          {selectionMode && selectedCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              取消选择
            </Button>
          ) : null}
          <Button
            variant={selectionMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              if (selectionMode) {
                clearSelection();
              } else {
                setSelectionMode(true);
              }
            }}
          >
            {selectionMode ? '退出选择' : '开始选择'}
          </Button>
        </div>
      </div>

      {actionError ? <ErrorAlert title="操作失败" message={actionError} className="mb-4" /> : null}

      {selectionMode && selectedCount > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" onClick={handleDownload} disabled={isProcessing}>
            下载所选
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            disabled={selectedCount === photos.length}
          >
            全选
          </Button>
          {canManageAll || allowOwnActions ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={isProcessing || !allSelectedManageable}
                onClick={handleRename}
              >
                重命名
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isProcessing || !allSelectedManageable}
              >
                删除所选
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {viewMode === 'grid' ? (
        <div
          className={cn(
            'space-y-6',
            isPending && 'pointer-events-none opacity-60 transition-opacity'
          )}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {groups.map(group => (
            <div key={group.key} className="space-y-3">
              <h3 className="text-muted-foreground text-sm font-medium">{group.label}</h3>
              <div className={cn('grid gap-4', gridColsClass)}>
                {group.items.map(photo => {
                  const isSelected = selectedIds.has(photo.id);
                  return (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => handleRowClick(photo)}
                      className={cn(
                        'group border-border focus-visible:outline-primary relative flex flex-col overflow-hidden rounded-xl border text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                        isSelected ? 'border-primary ring-primary/40 ring-2' : 'hover:shadow-lg'
                      )}
                    >
                      {selectionMode ? (
                        <span className="absolute top-2 left-2 z-10">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelection(photo.id)}
                            onClick={event => event.stopPropagation()}
                            className="border-input accent-primary h-4 w-4 rounded border"
                            aria-label={isSelected ? '取消选择' : '选择'}
                          />
                        </span>
                      ) : null}
                      <div className="relative aspect-square w-full overflow-hidden bg-black/60">
                        {photo.mediaType === 'video' ? (
                          <>
                            <video
                              src={photo.fileUrl}
                              poster={photo.thumbnailUrl ?? undefined}
                              className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                              muted
                              playsInline
                              preload="metadata"
                            />
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                              <Play className="h-10 w-10 drop-shadow" />
                            </div>
                          </>
                        ) : (
                          <Image
                            src={photo.thumbnailUrl ?? photo.fileUrl}
                            alt={photo.description ?? photo.filename}
                            fill
                            sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                            className="object-cover transition duration-200 group-hover:scale-105"
                            unoptimized
                          />
                        )}
                        <div className="absolute top-2 right-2 z-10">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="rounded-md bg-black/50 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100"
                                onClick={e => e.stopPropagation()}
                              >
                                操作
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={() => {
                                  const link = document.createElement('a');
                                  link.href = photo.fileUrl;
                                  link.download = photo.originalName ?? photo.filename;
                                  document.body.appendChild(link);
                                  link.click();
                                  link.remove();
                                }}
                              >
                                下载
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => handleCopyLink(photo)}>
                                复制链接
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className={cn('space-y-1', cardPaddingClass)}>
                        {zoomLevel === 'day' && (
                          <p className={cn('text-muted-foreground line-clamp-2', textSizeClass)}>
                            {photo.description || '无描述'}
                          </p>
                        )}
                        <div
                          className={cn(
                            'text-muted-foreground flex items-center justify-between',
                            zoomLevel === 'year' ? 'text-[10px]' : 'text-xs'
                          )}
                        >
                          {zoomLevel !== 'year' && (
                            <span className="truncate">{photo.uploader}</span>
                          )}
                          <span className={zoomLevel === 'year' ? 'mx-auto' : 'ml-auto'}>
                            {format(
                              new Date(photo.createdAt),
                              zoomLevel === 'day' ? 'HH:mm' : 'MM-dd',
                              { locale: zhCN }
                            )}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className={cn(
            'overflow-hidden rounded-lg border',
            isPending && 'pointer-events-none opacity-60 transition-opacity'
          )}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[220px]">预览</TableHead>
                <TableHead>描述</TableHead>
                <TableHead className="w-[200px]">上传信息</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map(group => (
                <Fragment key={group.key}>
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="bg-muted text-muted-foreground text-sm font-medium"
                    >
                      {group.label}
                    </TableCell>
                  </TableRow>
                  {group.items.map(photo => {
                    const isSelected = selectedIds.has(photo.id);
                    return (
                      <TableRow
                        key={photo.id}
                        onClick={() => handleRowClick(photo)}
                        className={cn(
                          'hover:bg-muted/60 cursor-pointer transition',
                          isSelected ? 'bg-primary/10' : undefined
                        )}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {selectionMode ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelection(photo.id)}
                                onClick={event => event.stopPropagation()}
                                className="border-input accent-primary h-4 w-4 rounded border"
                                aria-label={isSelected ? '取消选择' : '选择'}
                              />
                            ) : null}
                            <div className="relative h-16 w-24 overflow-hidden rounded-md border bg-black/60">
                              {photo.mediaType === 'video' ? (
                                <>
                                  <video
                                    src={photo.fileUrl}
                                    poster={photo.thumbnailUrl ?? undefined}
                                    className="h-full w-full object-cover"
                                    muted
                                    playsInline
                                    preload="metadata"
                                  />
                                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                                    <Play className="h-6 w-6" />
                                  </div>
                                </>
                              ) : (
                                <Image
                                  src={photo.thumbnailUrl ?? photo.fileUrl}
                                  alt={photo.description ?? photo.filename}
                                  fill
                                  sizes="120px"
                                  className="object-cover"
                                  unoptimized
                                />
                              )}
                              <div className="absolute top-1 right-1 z-10">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className="rounded bg-black/50 px-2 py-1 text-[10px] text-white"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      操作
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onSelect={() => {
                                        const link = document.createElement('a');
                                        link.href = photo.fileUrl;
                                        link.download = photo.originalName ?? photo.filename;
                                        document.body.appendChild(link);
                                        link.click();
                                        link.remove();
                                      }}
                                    >
                                      下载
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => handleCopyLink(photo)}>
                                      复制链接
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-xl space-y-1">
                            <p className="text-foreground text-sm font-medium">
                              {photo.description || photo.originalName || photo.filename}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              文件：{photo.originalName ?? photo.filename}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          <div className="space-y-1">
                            <p>上传者：{photo.uploader}</p>
                            <p>
                              {format(new Date(photo.createdAt), 'yyyy-MM-dd HH:mm', {
                                locale: zhCN,
                              })}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={!!activePhoto}
        onOpenChange={open => {
          if (!open) {
            setActivePhotoId(null);
          }
        }}
      >
        <DialogContent
          className="!fixed !inset-0 !top-0 !left-0 !h-screen !w-screen !max-w-none !translate-x-0 !translate-y-0 rounded-none border-none bg-black/90 p-4 text-white sm:p-6"
          showCloseButton={false}
        >
          {activePhoto && (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-4">
                <DialogHeader className="flex-1">
                  <DialogTitle className="text-base font-semibold text-white md:text-lg">
                    {activePhoto.description || activePhoto.filename}
                  </DialogTitle>
                </DialogHeader>
                <Button
                  variant="ghost"
                  className="text-white hover:text-white"
                  onClick={() => setActivePhotoId(null)}
                >
                  关闭
                </Button>
              </div>
              <div className="relative mt-4 flex flex-1 items-center justify-center overflow-hidden">
                {activePhoto.mediaType === 'video' ? (
                  <video
                    src={activePhoto.fileUrl}
                    poster={activePhoto.thumbnailUrl ?? undefined}
                    className="h-full max-h-full w-full max-w-full object-contain"
                    controls
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <Image
                    src={activePhoto.fileUrl}
                    alt={activePhoto.description ?? activePhoto.filename}
                    fill
                    sizes="100vw"
                    className="object-contain"
                    unoptimized
                  />
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-white/80 sm:text-sm">
                <Badge variant="secondary">上传者：{activePhoto.uploader}</Badge>
                <Badge variant="outline" className="border-white/40 text-white">
                  上传时间：
                  {format(new Date(activePhoto.createdAt), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                </Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = activePhoto.fileUrl;
                    link.download = activePhoto.originalName ?? activePhoto.filename;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                  }}
                >
                  下载当前
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameOpen}
        onOpenChange={open => {
          setRenameOpen(open);
          if (!open) {
            setRenameValue('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>重命名媒体</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="photo-new-name">媒体描述</Label>
              <Input
                id="photo-new-name"
                placeholder="输入新的描述"
                value={renameValue}
                onChange={event => setRenameValue(event.target.value)}
                maxLength={300}
              />
              <p className="text-muted-foreground text-xs">留空则移除描述。</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRenameOpen(false)}>
                取消
              </Button>
              <Button onClick={submitRename} disabled={isProcessing}>
                保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
