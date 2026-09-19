'use client';

import type { FileSetItem } from '@/components/admin/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { cn } from '@/lib/utils';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

interface AdminFileSetsProps {
  filesets: FileSetItem[];
}

export function AdminFileSets({ filesets }: AdminFileSetsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Create/Edit dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'internal' | 'public'>('internal');
  const [submitting, setSubmitting] = useState(false);

  function openCreateDialog() {
    setEditingId(null);
    setName('');
    setDescription('');
    setVisibility('internal');
    setShowDialog(true);
  }

  function openEditDialog(fileset: FileSetItem) {
    setEditingId(fileset.id);
    setName(fileset.name);
    setDescription(fileset.description || '');
    setVisibility(fileset.visibility);
    setShowDialog(true);
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError('请输入文件集名称');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const url = editingId ? `/api/filesets/${editingId}` : '/api/filesets';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          visibility,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.message || '操作失败');
      }

      setShowDialog(false);
      startTransition(() => router.refresh());
    } catch (e: any) {
      setError(e?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('确定要删除此文件分类吗？分类中的所有文件也将被删除。')) {
      return;
    }

    try {
      setError(null);
      const res = await fetch(`/api/filesets/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.message || '删除失败');
      }

      startTransition(() => router.refresh());
    } catch (e: any) {
      setError(e?.message || '删除失败');
    }
  }

  function getVisibilityBadge(vis: string) {
    switch (vis) {
      case 'private':
        return <Badge variant="secondary">私有</Badge>;
      case 'internal':
        return <Badge variant="outline">内部</Badge>;
      case 'public':
        return <Badge>公开</Badge>;
      default:
        return null;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">文件管理</h2>
          <p className="text-muted-foreground text-sm">管理文件分类，类似于相册分类</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          新建文件分类
        </Button>
      </div>

      {error && <ErrorAlert message={error} />}

      <div
        className={cn(
          'rounded-md border transition-opacity',
          isPending && 'pointer-events-none opacity-60'
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>描述</TableHead>
              <TableHead className="w-24">可见性</TableHead>
              <TableHead className="w-24">文件数</TableHead>
              <TableHead className="w-32">创建时间</TableHead>
              <TableHead className="w-32">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filesets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground h-24 text-center">
                  暂无文件分类
                </TableCell>
              </TableRow>
            ) : (
              filesets.map(fs => (
                <TableRow key={fs.id}>
                  <TableCell className="font-medium">{fs.name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-md truncate text-sm">
                    {fs.description || '-'}
                  </TableCell>
                  <TableCell>{getVisibilityBadge(fs.visibility)}</TableCell>
                  <TableCell className="text-center">{fs.fileCount}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(fs.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(fs)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(fs.id)}>
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

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={open => !open && setShowDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑文件分类' : '新建文件分类'}</DialogTitle>
            <DialogDescription>文件分类用于组织和管理文件，类似于相册分类</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">名称 *</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="例如：员工证件照、公司文档等"
                disabled={submitting}
              />
            </div>
            <div>
              <Label htmlFor="description">描述</Label>
              <Textarea
                id="description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="简要描述文件分类用途（可选）"
                rows={3}
                disabled={submitting}
              />
            </div>
            <div>
              <Label htmlFor="visibility">可见性</Label>
              <Select
                value={visibility}
                onValueChange={val => setVisibility(val as typeof visibility)}
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">私有（仅管理员）</SelectItem>
                  <SelectItem value="internal">内部（所有认证用户）</SelectItem>
                  <SelectItem value="public">公开（所有人）</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground mt-1 text-xs">控制谁可以查看此分类中的文件</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || !name.trim()}>
              {submitting ? '处理中...' : editingId ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
