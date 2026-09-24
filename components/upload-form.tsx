'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ErrorAlert } from '@/components/ui/error-alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';

interface UploadFormProps {
  categories: Array<{ id: number; name: string }>;
  defaultCategoryId?: number;
  onSuccess?: (count: number) => void;
}

interface UploadedPhoto {
  id: number;
  filename: string;
  description: string | null;
  thumbnailUrl: string | null;
  mediaType: 'image' | 'video';
  fileUrl: string;
}

export function UploadForm({ categories, defaultCategoryId, onSuccess }: UploadFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [categoryId, setCategoryId] = useState<string | undefined>(
    defaultCategoryId ? String(defaultCategoryId) : undefined
  );
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<UploadedPhoto[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (defaultCategoryId && categories.some(category => category.id === defaultCategoryId)) {
      setCategoryId(String(defaultCategoryId));
    }
  }, [defaultCategoryId, categories]);

  useEffect(() => {
    if (!defaultCategoryId && categories.length > 0 && !categoryId) {
      setCategoryId(String(categories[0].id));
    }
  }, [categories, categoryId, defaultCategoryId]);

  const handleSelectFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(event.target.files);
  };

  const resetForm = () => {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    setFiles(null);
    setDescription('');
    setProgress(0);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);

    if (!files || files.length === 0) {
      setError('请选择至少一个文件');
      return;
    }

    if (!categoryId) {
      setError('请选择分类');
      return;
    }

    setIsSubmitting(true);
    setProgress(0);

    const total = files.length;
    const uploads: UploadedPhoto[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files.item(index);
      if (!file) continue;

      try {
        const tokenResponse = await fetch('/api/upload/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryId: Number(categoryId),
            name: file.name,
            description: description.trim() || undefined,
            mimeType: file.type,
            size: file.size,
          }),
        });
        const token = await tokenResponse.json();
        if (!tokenResponse.ok) throw new Error(token.error ?? '无法创建上传凭证');

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', token.uploadUrl);
          xhr.setRequestHeader('Content-Type', token.headers['Content-Type']);
          xhr.upload.onprogress = progressEvent => {
            if (progressEvent.lengthComputable) {
              const percent = (progressEvent.loaded / progressEvent.total) * 100;
              setProgress(Math.round(((index + percent / 100) / total) * 100));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`对象存储上传失败 (${xhr.status})`));
          };
          xhr.onerror = () => reject(new Error('对象存储连接失败'));
          xhr.onabort = () => reject(new Error('上传已取消'));
          xhr.send(file);
        });

        const completeResponse = await fetch('/api/upload/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intentId: token.intentId }),
        });
        const payload = await completeResponse.json();
        if (!completeResponse.ok) throw new Error(payload.error ?? '上传完成处理失败');
        uploads.push(payload as UploadedPhoto);
        setProgress(Math.round(((index + 1) / total) * 100));
      } catch (err) {
        const message = err instanceof Error ? err.message : '上传失败';
        setError(message);
        break;
      }
    }

    if (uploads.length === total) {
      setStatus('上传成功');
      setUploaded(prev => [...uploads, ...prev]);
      resetForm();
      router.refresh();
      onSuccess?.(uploads.length);
    }

    setIsSubmitting(false);
  };

  if (categories.length === 0) {
    return (
      <div className="text-muted-foreground space-y-4 text-sm">
        <p>暂无可用分类，请联系管理员先创建分类后再上传。</p>
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="categoryId">选择分类</Label>
          <Select onValueChange={setCategoryId} value={categoryId}>
            <SelectTrigger id="categoryId">
              <SelectValue placeholder="选择分类" />
            </SelectTrigger>
            <SelectContent>
              {categories.map(category => (
                <SelectItem key={category.id} value={String(category.id)}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">描述（可选）</Label>
          <Textarea
            id="description"
            value={description}
            onChange={event => setDescription(event.target.value)}
            placeholder="简单描述媒体信息"
            rows={4}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>上传媒体</Label>
        <div
          className="border-muted-foreground/50 bg-muted/40 flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed text-center"
          onClick={() => inputRef.current?.click()}
        >
          <Input
            ref={inputRef}
            id="files"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={handleSelectFiles}
          />
          <p className="text-sm font-medium">点击或拖拽文件到此处</p>
          <p className="text-muted-foreground text-xs">
            支持 JPG / PNG / GIF / WebP（≤10MB）及 MP4 / WebM / MOV（≤512MB）。
          </p>
          {files && files.length > 0 && (
            <p className="text-muted-foreground mt-2 text-sm">已选择 {files.length} 个文件</p>
          )}
        </div>
      </div>

      {progress > 0 && (
        <div>
          <Label>上传进度</Label>
          <div className="bg-muted mt-2 h-2 w-full rounded-full">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-muted-foreground mt-1 text-xs">{progress}%</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '正在上传...' : '开始上传'}
        </Button>
        <Button type="button" variant="ghost" disabled={isSubmitting} onClick={resetForm}>
          重置
        </Button>
      </div>

      {status && (
        <Alert variant="default">
          <AlertTitle>提示</AlertTitle>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      )}

      {error && <ErrorAlert title="上传失败" message={error} />}

      {uploaded.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-muted-foreground text-sm font-medium">最近上传</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {uploaded.map(photo => (
              <div key={photo.id} className="overflow-hidden rounded-lg border">
                {photo.mediaType === 'video' ? (
                  <div className="relative h-32 w-full overflow-hidden bg-black/60">
                    <video
                      src={photo.fileUrl}
                      poster={photo.thumbnailUrl ?? undefined}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                      <span className="rounded-full bg-black/60 px-2 py-1 text-xs">视频</span>
                    </div>
                  </div>
                ) : (
                  <Image
                    src={photo.thumbnailUrl ?? photo.fileUrl}
                    alt={photo.description ?? photo.filename}
                    width={300}
                    height={200}
                    className="h-32 w-full object-cover"
                    unoptimized
                  />
                )}
                <div className="text-muted-foreground px-3 py-2 text-xs">
                  {photo.description ?? '无描述'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
