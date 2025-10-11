"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface UploadFormProps {
  categories: Array<{ id: number; name: string }>;
  defaultCategoryId?: number;
  onSuccess?: (count: number) => void;
}

interface UploadedPhoto {
  id: number;
  filename: string;
  description: string | null;
  thumbnail: string;
}

export function UploadForm({ categories, defaultCategoryId, onSuccess }: UploadFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [categoryId, setCategoryId] = useState<string | undefined>(
    defaultCategoryId ? String(defaultCategoryId) : undefined,
  );
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<UploadedPhoto[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (defaultCategoryId && categories.some((category) => category.id === defaultCategoryId)) {
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
      inputRef.current.value = "";
    }
    setFiles(null);
    setDescription("");
    setProgress(0);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);

    if (!files || files.length === 0) {
      setError("请选择至少一张图片");
      return;
    }

    if (!categoryId) {
      setError("请选择分类");
      return;
    }

    setIsSubmitting(true);
    setProgress(0);

    const total = files.length;
    const uploads: UploadedPhoto[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files.item(index);
      if (!file) continue;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("categoryId", categoryId);
      if (description.trim()) {
        formData.append("description", description.trim());
      }

      try {
        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: "上传失败" }));
          throw new Error(payload.error ?? "上传失败");
        }

        const payload = (await response.json()) as UploadedPhoto;
        uploads.push(payload);
        setProgress(Math.round(((index + 1) / total) * 100));
      } catch (err) {
        const message = err instanceof Error ? err.message : "上传失败";
        setError(message);
        break;
      }
    }

    if (uploads.length === total) {
      setStatus("上传成功");
      setUploaded((prev) => [...uploads, ...prev]);
      resetForm();
      router.refresh();
      onSuccess?.(uploads.length);
    }

    setIsSubmitting(false);
  };

  if (categories.length === 0) {
    return (
      <div className="space-y-4 text-sm text-muted-foreground">
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
              {categories.map((category) => (
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
            onChange={(event) => setDescription(event.target.value)}
            placeholder="简单描述照片信息"
            rows={4}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>上传图片</Label>
        <div
          className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/50 bg-muted/40 text-center"
          onClick={() => inputRef.current?.click()}
        >
          <Input
            ref={inputRef}
            id="files"
            type="file"
            multiple
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={handleSelectFiles}
          />
          <p className="text-sm font-medium">点击或拖拽文件到此处</p>
          <p className="text-xs text-muted-foreground">支持 JPG / PNG，单个文件不超过 10MB。</p>
          {files && files.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              已选择 {files.length} 个文件
            </p>
          )}
        </div>
      </div>

      {progress > 0 && (
        <div>
          <Label>上传进度</Label>
          <div className="mt-2 h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{progress}%</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "正在上传..." : "开始上传"}
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

      {error && (
        <Alert variant="destructive">
          <AlertTitle>上传失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {uploaded.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">最近上传</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {uploaded.map((photo) => (
              <div key={photo.id} className="overflow-hidden rounded-lg border">
                <Image
                  src={`/uploads/${photo.thumbnail}`}
                  alt={photo.description ?? photo.filename}
                  width={300}
                  height={200}
                  className="h-32 w-full object-cover"
                />
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {photo.description ?? "无描述"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
