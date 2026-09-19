'use client';

import type { CategoryItem, ShareLinkItem } from '@/components/admin/types';
import { PaginationControls } from '@/components/pagination-controls';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Copy, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function AdminShareTab({
  shareLinks,
  categories,
  shareBaseUrl,
  total,
  page,
  pageSize,
}: {
  shareLinks: ShareLinkItem[];
  categories: Pick<CategoryItem, 'id' | 'name'>[];
  shareBaseUrl: string;
  total: number;
  page: number;
  pageSize: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [shareCategoryId, setShareCategoryId] = useState<number | null>(null);
  const [sharePassword, setSharePassword] = useState('');
  const [expireHours, setExpireHours] = useState('24');
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [copySuccessMessage, setCopySuccessMessage] = useState<string | null>(null);

  const handleShareCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setShareMessage(null);
    setError(null);

    if (!shareCategoryId) {
      setError('请选择分类');
      return;
    }

    const response = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: shareCategoryId,
        password: sharePassword.trim() || undefined,
        expireInHours: Number.parseInt(expireHours, 10) || undefined,
      }),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(body.error ?? '分享链接创建失败');
      return;
    }

    setShareMessage(`${shareBaseUrl}${body.token}`);
    setSharePassword('');
    setExpireHours('24');
    startTransition(() => router.refresh());
  };

  const handleCopyShareLink = async (token: string) => {
    const fullUrl = `${shareBaseUrl}${token}`;
    setCopySuccessMessage(null);
    setError(null);
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopySuccessMessage('链接已复制到剪贴板');
      setTimeout(() => setCopySuccessMessage(null), 3000);
    } catch {
      setError('复制失败，请手动复制链接');
    }
  };

  const handleDeleteShareLink = async (id: number) => {
    setError(null);
    if (!window.confirm('确认删除该分享链接？')) {
      return;
    }

    const response = await fetch('/api/share', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? '删除分享链接失败');
      return;
    }

    startTransition(() => router.refresh());
  };

  return (
    <>
      {error && <ErrorAlert title="操作失败" message={error} />}

      <form
        onSubmit={handleShareCreate}
        className="bg-card grid gap-4 rounded-lg border p-4 md:grid-cols-2"
      >
        <div className="space-y-2">
          <Label htmlFor="share-category">选择分类</Label>
          <Select onValueChange={value => setShareCategoryId(Number(value))}>
            <SelectTrigger id="share-category">
              <SelectValue placeholder="选择需要分享的分类" />
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
          <Label htmlFor="share-password">访问密码（可选）</Label>
          <Input
            id="share-password"
            type="password"
            value={sharePassword}
            onChange={event => setSharePassword(event.target.value)}
            placeholder="留空则不设置密码"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="share-expire">过期时间 (小时)</Label>
          <Input
            id="share-expire"
            type="number"
            min={1}
            max={720}
            value={expireHours}
            onChange={event => setExpireHours(event.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={isPending}>
            生成分享链接
          </Button>
        </div>
      </form>

      {shareMessage && (
        <Alert>
          <AlertTitle>分享链接创建成功</AlertTitle>
          <AlertDescription className="break-all">{shareMessage}</AlertDescription>
        </Alert>
      )}

      {copySuccessMessage && (
        <Alert>
          <AlertTitle>操作成功</AlertTitle>
          <AlertDescription>{copySuccessMessage}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>分类</TableHead>
              <TableHead>链接</TableHead>
              <TableHead>过期时间</TableHead>
              <TableHead className="w-32">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shareLinks.map(link => (
              <TableRow key={link.id}>
                <TableCell>{link.categoryName}</TableCell>
                <TableCell className="text-primary text-sm break-all">
                  {shareBaseUrl}
                  {link.token}
                </TableCell>
                <TableCell>
                  {link.expiresAt ? new Date(link.expiresAt).toLocaleString() : '不限'}
                </TableCell>
                <TableCell className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyShareLink(link.token)}
                    title="复制链接"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteShareLink(link.id)}
                    title="删除链接"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PaginationControls page={page} total={total} pageSize={pageSize} />
    </>
  );
}
