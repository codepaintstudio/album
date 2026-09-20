'use client';

import type { UserItem } from '@/components/admin/types';
import type { UserDeletePayload } from '@/components/admin/user-delete-dialog';
import { UserDeleteDialog } from '@/components/admin/user-delete-dialog';
import { PaginationControls } from '@/components/pagination-controls';
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
import { useDebouncedParam, useQueryParamWriter } from '@/lib/query-state';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

const ROLE_ALL = '__all__';

export function AdminUsersTab({
  users,
  pendingUsers,
  total,
  page,
  pageSize,
  query,
  role,
}: {
  users: UserItem[];
  pendingUsers: UserItem[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  role: string;
}) {
  const router = useRouter();
  const setParam = useQueryParamWriter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 输入框持有草稿，落进 URL 后由服务端筛选：不再需要"搜索"按钮
  const [userQuery, setUserQuery] = useState(query);
  useDebouncedParam('q', userQuery);

  const [selectedUserRole, setSelectedUserRole] = useState<Record<number, string>>({});

  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [resettingPasswordUserId, setResettingPasswordUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const allUsers = [...pendingUsers, ...users];
  const deletingUser = allUsers.find(user => user.id === deletingUserId) ?? null;
  const resettingUser = allUsers.find(user => user.id === resettingPasswordUserId) ?? null;

  const handleUserRoleChange = async (id: number, nextRole: string) => {
    setError(null);

    const response = await fetch('/api/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, role: nextRole }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? '角色更新失败');
      return;
    }

    setSelectedUserRole(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    startTransition(() => router.refresh());
  };

  const handleUserStatusChange = async (id: number, status: 'pending' | 'active' | 'rejected') => {
    setError(null);

    const response = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? '状态更新失败');
      return;
    }

    startTransition(() => router.refresh());
  };

  const resetPasswordDialog = () => {
    setResettingPasswordUserId(null);
    setNewPassword('');
    setConfirmNewPassword('');
  };

  const handlePasswordReset = async () => {
    if (!resettingPasswordUserId) return;
    setError(null);

    if (!newPassword || !confirmNewPassword) {
      setError('请输入新密码');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (newPassword.length < 6) {
      setError('密码至少 6 位');
      return;
    }

    const response = await fetch('/api/users/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: resettingPasswordUserId, newPassword: newPassword }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? '密码重置失败');
      return;
    }

    resetPasswordDialog();
    alert('密码重置成功');
  };

  const resetDeleteDialog = () => {
    setDeletingUserId(null);
    setDeleting(false);
  };

  const handleUserDelete = async (payload: UserDeletePayload) => {
    setError(null);
    setDeleting(true);

    try {
      const response = await fetch('/api/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        // 服务端的 planUserDelete 会把所有违规一次返回，error 已是拼接好的一句。
        setError(body.error ?? '删除用户失败');
        return;
      }

      resetDeleteDialog();
      startTransition(() => router.refresh());
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {error && <ErrorAlert title="操作失败" message={error} />}

      {pendingUsers.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-medium">待审核用户</h3>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户名</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="w-48">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUsers.map(user => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleUserStatusChange(user.id, 'active')}
                      >
                        通过
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleUserStatusChange(user.id, 'rejected')}
                      >
                        拒绝
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-lg font-medium">已激活成员</h3>
        <div className="bg-card flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Input
              placeholder="搜索用户名"
              value={userQuery}
              onChange={e => setUserQuery(e.target.value)}
              className="w-64"
            />
            <Select
              value={role || ROLE_ALL}
              onValueChange={value => setParam('role', value === ROLE_ALL ? null : value)}
            >
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue placeholder="角色筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROLE_ALL}>全部角色</SelectItem>
                <SelectItem value="admin">管理员</SelectItem>
                <SelectItem value="member">成员</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground text-sm">每页</label>
            <Select value={String(pageSize)} onValueChange={value => setParam('pageSize', value)}>
              <SelectTrigger className="h-8 w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-muted-foreground text-sm">共 {total} 条</div>
          </div>
        </div>
        <div
          className={
            isPending ? 'pointer-events-none opacity-60 transition-opacity' : 'transition-opacity'
          }
        >
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">用户名</TableHead>
                  <TableHead className="min-w-[170px]">角色</TableHead>
                  <TableHead className="min-w-[170px]">上传数</TableHead>
                  <TableHead className="min-w-[180px]">创建时间</TableHead>
                  <TableHead className="min-w-[380px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(user => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>{user.photoCount}</TableCell>
                    <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="p-0">
                      <div className="flex items-center gap-2 px-4 py-3">
                        <Select
                          value={selectedUserRole[user.id] ?? user.role}
                          onValueChange={value =>
                            setSelectedUserRole(prev => ({
                              ...prev,
                              [user.id]: value,
                            }))
                          }
                        >
                          <SelectTrigger className="h-8 w-[90px]">
                            <SelectValue placeholder="角色" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">管理员</SelectItem>
                            <SelectItem value="member">成员</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() =>
                            handleUserRoleChange(user.id, selectedUserRole[user.id] ?? user.role)
                          }
                        >
                          保存
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8"
                          onClick={() => setResettingPasswordUserId(user.id)}
                        >
                          重置
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8"
                          onClick={() => setDeletingUserId(user.id)}
                        >
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        <PaginationControls page={page} total={total} pageSize={pageSize} />
      </div>

      <UserDeleteDialog
        user={deletingUser}
        candidates={users}
        busy={deleting}
        onClose={resetDeleteDialog}
        onConfirm={handleUserDelete}
      />

      <Dialog
        open={resettingPasswordUserId !== null}
        onOpenChange={open => {
          if (!open) {
            resetPasswordDialog();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>
              为用户 <strong>{resettingUser?.username}</strong> 设置新密码
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">新密码</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="至少 6 位"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-new-password">确认新密码</Label>
              <Input
                id="confirm-new-password"
                type="password"
                value={confirmNewPassword}
                onChange={e => setConfirmNewPassword(e.target.value)}
                placeholder="再次输入新密码"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={resetPasswordDialog}>
              取消
            </Button>
            <Button variant="default" onClick={handlePasswordReset}>
              确认重置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
