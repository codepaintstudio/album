'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorAlert } from '@/components/ui/error-alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

interface AccountFormsProps {
  user: {
    id: number;
    username: string;
    role: string;
    createdAt: string;
  };
}

export function AccountForms({ user }: AccountFormsProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <UserInfoCard user={user} />
      <UpdateUsernameForm defaultUsername={user.username} />
      <UpdatePasswordForm />
    </div>
  );
}

function UserInfoCard({ user }: AccountFormsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>账号信息</CardTitle>
        <CardDescription>查看当前账号的基础信息。</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span>用户名</span>
          <span className="text-foreground font-medium">{user.username}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>角色</span>
          <span className="text-foreground capitalize">{user.role}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>创建时间</span>
          <span className="text-foreground">{new Date(user.createdAt).toLocaleString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function UpdateUsernameForm({ defaultUsername }: { defaultUsername: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(defaultUsername);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!username.trim()) {
      setError('用户名不能为空');
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'username', username: username.trim() }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error ?? '更新失败');
        }

        setMessage(payload.message ?? '用户名已更新');
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : '更新失败';
        setError(msg);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>修改用户名</CardTitle>
        <CardDescription>更新账号的登录名，需保证唯一。</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-username">新用户名</Label>
            <Input
              id="profile-username"
              value={username}
              onChange={event => setUsername(event.target.value)}
              placeholder="输入新的用户名"
              maxLength={32}
              required
            />
          </div>
          {message && (
            <Alert>
              <AlertTitle>修改成功</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          {error && <ErrorAlert title="修改失败" message={error} />}
          <Button type="submit" disabled={isPending}>
            {isPending ? '保存中...' : '保存'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function UpdatePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'password',
            currentPassword,
            newPassword,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error ?? '修改失败');
        }

        setMessage(payload.message ?? '密码已更新');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } catch (err) {
        const msg = err instanceof Error ? err.message : '修改失败';
        setError(msg);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>修改密码</CardTitle>
        <CardDescription>设置一个新的登录密码，至少 6 位。</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-current-password">当前密码</Label>
            <Input
              id="profile-current-password"
              type="password"
              toggleable
              value={currentPassword}
              onChange={event => setCurrentPassword(event.target.value)}
              placeholder="请输入当前密码"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-new-password">新密码</Label>
            <Input
              id="profile-new-password"
              type="password"
              toggleable
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              placeholder="至少 6 位"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-confirm-password">确认新密码</Label>
            <Input
              id="profile-confirm-password"
              type="password"
              toggleable
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              placeholder="再次输入新密码"
              required
            />
          </div>
          {message && (
            <Alert>
              <AlertTitle>修改成功</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          {error && <ErrorAlert title="修改失败" message={error} />}
          <Button type="submit" disabled={isPending}>
            {isPending ? '保存中...' : '保存'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
