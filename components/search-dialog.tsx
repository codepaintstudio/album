'use client';

import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId?: number;
}

export function SearchDialog({ open, onOpenChange, categoryId }: SearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  interface CategoryResult {
    id: number;
    name: string;
    description: string | null;
    photoCount: number;
  }

  interface PhotoResult {
    id: number;
    categoryId: number;
    categoryName: string;
    filename: string;
    originalName: string | null;
    description: string | null;
    thumbnailUrl: string | null;
    fileUrl: string;
    mediaType: 'image' | 'video';
  }

  const [results, setResults] = useState<{ categories: CategoryResult[]; photos: PhotoResult[] }>({
    categories: [],
    photos: [],
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    if (!debounced) {
      setResults({ categories: [], photos: [] });
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ q: debounced });
    if (categoryId) params.set('categoryId', String(categoryId));
    fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? '搜索失败');
        }
        return res.json();
      })
      .then((data: { categories: CategoryResult[]; photos: PhotoResult[] }) => {
        const normalizedCategories: CategoryResult[] = (data.categories ?? []).map(c => ({
          id: c.id,
          name: c.name,
          description: c.description,
          photoCount: c.photoCount,
        }));

        const normalizedPhotos: PhotoResult[] = (data.photos ?? []).map(p => ({
          id: p.id,
          categoryId: p.categoryId,
          categoryName: p.categoryName,
          filename: p.filename,
          originalName: p.originalName,
          description: p.description,
          thumbnailUrl: p.thumbnailUrl ?? null,
          fileUrl: p.fileUrl ?? p.thumbnailUrl ?? '',
          mediaType: (p.mediaType as PhotoResult['mediaType']) ?? 'image',
        }));

        setResults({ categories: normalizedCategories, photos: normalizedPhotos });
      })
      .catch(err => setError(err instanceof Error ? err.message : '搜索失败'))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [debounced, open, categoryId]);

  const hasResults = useMemo(
    () => results.categories.length > 0 || results.photos.length > 0,
    [results]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-2xl overflow-hidden p-0">
        <div className="bg-card sticky top-0 z-10 flex items-center gap-2 border-b p-3 sm:p-4">
          <div className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              autoFocus
              placeholder="搜索相册名称、描述，或媒体文件名/描述"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <span className="text-muted-foreground hidden text-xs sm:inline">Esc 关闭</span>
        </div>
        <div className="max-h-[70vh] space-y-6 overflow-y-auto p-3 sm:p-4">
          {loading && <p className="text-muted-foreground text-sm">搜索中...</p>}
          {error && <p className="text-destructive text-sm">{error}</p>}
          {!loading && !error && !hasResults && debounced && (
            <EmptyState className="p-6" title="没有匹配结果" />
          )}

          {results.categories.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-muted-foreground text-xs font-medium uppercase">匹配的相册</h3>
                <Badge variant="outline">{results.categories.length}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {results.categories.map(c => (
                  <Link
                    key={c.id}
                    href={`/album/${c.id}`}
                    className="hover:bg-muted rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{c.name}</span>
                      <Badge variant="outline">{c.photoCount} 张</Badge>
                    </div>
                    {c.description && (
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                        {c.description}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {results.photos.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-muted-foreground text-xs font-medium uppercase">匹配的媒体</h3>
                <Badge variant="outline">{results.photos.length}</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>预览</TableHead>
                    <TableHead>描述 / 文件名</TableHead>
                    <TableHead>所属相册</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.photos.map(p => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/album/${p.categoryId}`)}
                    >
                      <TableCell>
                        <div className="relative h-16 w-24 overflow-hidden rounded">
                          {p.mediaType === 'video' ? (
                            <>
                              <video
                                src={p.fileUrl}
                                poster={p.thumbnailUrl ?? undefined}
                                className="h-full w-full object-cover"
                                muted
                                playsInline
                                preload="metadata"
                              />
                              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                                <Search className="h-5 w-5" />
                              </div>
                            </>
                          ) : (
                            <Image
                              src={p.thumbnailUrl ?? p.fileUrl}
                              alt={p.description ?? p.filename}
                              fill
                              sizes="96px"
                              className="object-cover"
                              unoptimized
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="max-w-lg">
                          <p className="font-medium">
                            {p.description || p.originalName || p.filename}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            文件：{p.originalName ?? p.filename}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {p.categoryName}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
