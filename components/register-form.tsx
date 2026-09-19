'use client';

import { LoadingButton } from '@/components/loading-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ErrorAlert } from '@/components/ui/error-alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormEvent, useState } from 'react';

export function RegisterForm({
  onSuccess,
}: { onSuccess?: (payload: { role: string }) => void } = {}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? '注册失败');
      }

      if (payload.status === 'pending') {
        setMessage('注册成功，请等待管理员审核通过后登录');
      } else if (payload.role === 'admin') {
        setMessage('注册成功，已创建管理员账户，请使用该账号登录');
      } else {
        setMessage('注册成功，请使用新账号登录');
      }

      setUsername('');
      setPassword('');
      setConfirmPassword('');
      onSuccess?.(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : '注册失败';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="register-username">用户名</Label>
        <Input
          id="register-username"
          value={username}
          onChange={event => setUsername(event.target.value)}
          placeholder="设置用户名"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="register-password">密码</Label>
        <Input
          id="register-password"
          type="password"
          toggleable
          value={password}
          onChange={event => setPassword(event.target.value)}
          placeholder="至少 6 位"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="register-password-confirm">确认密码</Label>
        <Input
          id="register-password-confirm"
          type="password"
          toggleable
          value={confirmPassword}
          onChange={event => setConfirmPassword(event.target.value)}
          placeholder="再次输入密码"
          required
        />
      </div>
      {message && (
        <Alert>
          <AlertTitle>注册成功</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      {error && <ErrorAlert title="注册失败" message={error} />}
      <LoadingButton type="submit" className="w-full" loading={isSubmitting}>
        注册
      </LoadingButton>
    </form>
  );
}
