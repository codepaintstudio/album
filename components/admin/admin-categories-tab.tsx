'use client';

import type { CategoryItem } from '@/components/admin/types';
import { Badge } from '@/components/ui/badge';
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
import { Textarea } from '@/components/ui/textarea';
import type { CategoryVisibility } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

function VisibilityBadge({ visibility }: { visibility: CategoryVisibility }) {
  const config: Record<
    CategoryVisibility,
    { label: string; variant: 'destructive' | 'outline' | 'secondary' }
  > = {
    private: { label: '私有', variant: 'destructive' },
    internal: { label: '共有', variant: 'secondary' },
    public: { label: '公开', variant: 'outline' },
  };
  const { label, variant } = config[visibility];
  return <Badge variant={variant}>{label}</Badge>;
}

export function AdminCategoriesTab({ categories }: { categories: CategoryItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [categoryVisibility, setCategoryVisibility] = useState<CategoryVisibility>('internal');

  const resetCategoryForm = () => {
    setEditingCategoryId(null);
    setCategoryName('');
    setCategoryDescription('');
    setCategoryVisibility('internal');
  };

  const handleCategorySubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!categoryName.trim()) {
      setError('分类名称不能为空');
      return;
    }

    const payload = {
      name: categoryName.trim(),
      description: categoryDescription.trim() || undefined,
      visibility: categoryVisibility,
    };

    const isEditing = editingCategoryId !== null;
    const response = await fetch('/api/categories', {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isEditing ? { ...payload, id: editingCategoryId } : payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? '操作失败');
      return;
    }

    resetCategoryForm();
    startTransition(() => router.refresh());
  };

  const handleCategoryDelete = async (id: number) => {
    setError(null);
    if (!window.confirm('确认删除该分类？分类内的照片将一并删除。')) {
      return;
    }

    const response = await fetch('/api/categories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? '删除失败');
      return;
    }

    startTransition(() => router.refresh());
  };

  return (
    <>
      {error && <ErrorAlert title="操作失败" message={error} />}

      <form
        onSubmit={handleCategorySubmit}
        className="bg-card grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
      >
        <div className="space-y-2">
          <Label htmlFor="category-name">分类名称</Label>
          <Input
            id="category-name"
            value={categoryName}
            onChange={event => setCategoryName(event.target.value)}
            placeholder="例如：活动照片"
            required
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="category-description">描述</Label>
          <Textarea
            id="category-description"
            value={categoryDescription}
            onChange={event => setCategoryDescription(event.target.value)}
            placeholder="可选，用于说明该分类"
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category-visibility">可见范围</Label>
          <Select
            value={categoryVisibility}
            onValueChange={value => setCategoryVisibility(value as CategoryVisibility)}
          >
            <SelectTrigger id="category-visibility">
              <SelectValue placeholder="选择可见范围" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">私有（仅管理员）</SelectItem>
              <SelectItem value="internal">共有（系统用户可见）</SelectItem>
              <SelectItem value="public">公开（互联网访客可见）</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
          <Button type="submit" disabled={isPending}>
            {editingCategoryId ? '保存修改' : '添加分类'}
          </Button>
          {editingCategoryId && (
            <Button type="button" variant="ghost" onClick={resetCategoryForm}>
              取消编辑
            </Button>
          )}
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>描述</TableHead>
              <TableHead>可见范围</TableHead>
              <TableHead className="w-24 text-right">照片数</TableHead>
              <TableHead className="w-48">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map(category => (
              <TableRow key={category.id}>
                <TableCell className="font-medium">{category.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {category.description || '—'}
                </TableCell>
                <TableCell>
                  <VisibilityBadge visibility={category.visibility} />
                </TableCell>
                <TableCell className="text-right">{category.photoCount}</TableCell>
                <TableCell className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingCategoryId(category.id);
                      setCategoryName(category.name);
                      setCategoryDescription(category.description ?? '');
                      setCategoryVisibility(category.visibility);
                    }}
                  >
                    编辑
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleCategoryDelete(category.id)}
                  >
                    删除
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
