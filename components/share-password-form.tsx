'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export function SharePasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch('/api/share/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? '验证失败');
      }
      setError(null);
      setPassword('');
      // 解锁凭证写在 httpOnly cookie 里，因此由服务端重渲染来取内容
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '验证失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="share-password">访问密码</Label>
        <Input
          id="share-password"
          type="password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          placeholder="请输入访问密码"
          required
          autoComplete="off"
        />
      </div>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? '验证中...' : '提交'}
      </Button>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </form>
  );
}
