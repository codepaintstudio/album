'use client';

import { FilesUploadDialog } from '@/components/files/upload-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebouncedParam } from '@/lib/query-state';
import { Search, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function FilesToolbar({
  initialQuery,
  activeFileSetId,
}: {
  initialQuery: string;
  activeFileSetId: number | null;
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useDebouncedParam('q', searchQuery);

  async function handleUpload(file: File) {
    if (activeFileSetId === null) {
      setUploadError('请先选择文件分类');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('filesetId', String(activeFileSetId));

      const res = await fetch('/api/files', { method: 'POST', body: formData });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.message || '上传失败');
      }

      setUploadError(null);
      setShowUpload(false);
      router.refresh();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '上传失败');
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
          <Input
            placeholder="搜索文件..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-64 pl-8"
          />
        </div>
        <Button onClick={() => setShowUpload(true)} variant="outline" size="sm">
          <Upload className="mr-2 h-4 w-4" />
          上传文件
        </Button>
      </div>
      <FilesUploadDialog
        open={showUpload}
        error={uploadError}
        onClose={() => {
          setShowUpload(false);
          setUploadError(null);
        }}
        onUpload={handleUpload}
      />
    </>
  );
}
