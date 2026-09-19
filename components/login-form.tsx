'use client';

import { LoadingButton } from '@/components/loading-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ErrorAlert } from '@/components/ui/error-alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';

export function LoginForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingHint, setPendingHint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      setPendingHint(null);
      // 先检查账户状态，避免不必要的登录尝试
      const check = await fetch('/api/users/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
        .then(r => r.json())
        .catch(() => ({}));

      if (check?.status === 'pending') {
        setPendingHint('账户待审核，请等待管理员通过');
        setIsLoading(false);
        return;
      }

      const response = await signIn('credentials', {
        username,
        password,
        redirect: false,
        callbackUrl,
      });

      if (response?.error) {
        if (response.error.includes('待审核') || response.error.includes('审核')) {
          setError(null);
          setPendingHint('账户待审核，请等待管理员通过');
        } else {
          setError('用户名或密码错误');
        }
        setIsLoading(false);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
      onSuccess?.();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="username">用户名</Label>
        <Input
          id="username"
          value={username}
          onChange={event => setUsername(event.target.value)}
          placeholder="请输入用户名"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          type="password"
          toggleable
          value={password}
          onChange={event => setPassword(event.target.value)}
          placeholder="请输入密码"
          required
        />
      </div>
      {error && <ErrorAlert title="登录失败" message={error} />}
      {pendingHint && (
        <Alert>
          <AlertTitle>登录受限</AlertTitle>
          <AlertDescription>{pendingHint}</AlertDescription>
        </Alert>
      )}
      <LoadingButton type="submit" className="w-full" loading={isLoading}>
        登录
      </LoadingButton>
    </form>
  );
}
