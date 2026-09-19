'use client';

import { FilesPreviewDialog } from '@/components/files/preview-dialog';
import { Button } from '@/components/ui/button';
import { ErrorAlert } from '@/components/ui/error-alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  Archive,
  Code,
  Download,
  Eye,
  FileIcon,
  FileText,
  Image as ImageIcon,
  Music,
  Trash2,
  Video,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { FileItem, formatFileSize } from './types';

function renderTypeIcon(mime: string) {
  const cls = 'h-4 w-4 text-muted-foreground';
  if (mime.startsWith('image/')) return <ImageIcon className={cls} />;
  if (mime.startsWith('video/')) return <Video className={cls} />;
  if (mime.startsWith('audio/')) return <Music className={cls} />;
  if (mime === 'application/pdf') return <FileText className={cls} />;
  if (/zip|tar|rar/.test(mime)) return <Archive className={cls} />;
  if (mime.startsWith('text/') || /json|xml|yaml|javascript/.test(mime))
    return <Code className={cls} />;
  return <FileIcon className={cls} />;
}

export function FilesTable({ files }: { files: FileItem[] }) {
  const router = useRouter();
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleDelete(fileId: number) {
    if (!confirm('确定要删除此文件吗？')) return;

    try {
      const res = await fetch(`/api/files/${fileId}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.message || '删除失败');
      }
      setError(null);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    }
  }

  return (
    <div className="space-y-3">
      {error && <ErrorAlert message={error} />}
      <div
        className={cn(
          'overflow-x-auto rounded-md border transition-opacity',
          isPending && 'pointer-events-none opacity-60'
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[220px]">文件名</TableHead>
              <TableHead className="w-28">类型</TableHead>
              <TableHead className="w-24">大小</TableHead>
              <TableHead className="w-32">上传时间</TableHead>
              <TableHead className="w-32">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground h-24 text-center">
                  暂无文件
                </TableCell>
              </TableRow>
            ) : (
              files.map(file => (
                <TableRow key={file.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {renderTypeIcon(file.mimeType)}
                      <div className="flex min-w-0 flex-col">
                        <span
                          className="max-w-[40ch] truncate font-medium"
                          title={file.originalName}
                        >
                          {file.originalName}
                        </span>
                        {file.description && (
                          <span className="text-muted-foreground text-xs">{file.description}</span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    <span className="inline-block max-w-[10ch] truncate" title={file.mimeType}>
                      {file.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{formatFileSize(file.size)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(file.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="预览"
                        onClick={() => setPreviewFile(file)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="下载/打开"
                        onClick={e => {
                          e.stopPropagation();
                          window.open(file.url, '_blank');
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="删除"
                        onClick={() => handleDelete(file.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <FilesPreviewDialog file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}
