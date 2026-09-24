'use client';

import { LoadingButton } from '@/components/loading-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ErrorAlert } from '@/components/ui/error-alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LOGIN_FEEDBACK_TEXT, classifySignInError, isAccountBlocked } from '@/lib/login-feedback';
import type { LoginFeedback } from '@/lib/login-feedback';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';

export function LoginForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<LoginFeedback | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setIsLoading(true);
    try {
      // 不再在登录前先探测一次账户状态：那需要一个未鉴权的接口回答"这个用户名存在吗、
      // 审核过了吗"，任何人都能拿它枚举账号；而 signIn 在密码正确时本来就会带回同一个
      // 结论（lib/auth.ts 的 authorize 抛出待审核/已拒绝）。代价是一次 bcrypt.compare。
      const response = await signIn('credentials', {
        username,
        password,
        redirect: false,
        callbackUrl,
      });

      if (response?.error) {
        setFeedback(classifySignInError(response.error));
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
      {feedback === 'invalid' ? (
        <ErrorAlert title="登录失败" message={LOGIN_FEEDBACK_TEXT.invalid} />
      ) : null}
      {feedback && isAccountBlocked(feedback) ? (
        <Alert>
          <AlertTitle>登录受限</AlertTitle>
          <AlertDescription>{LOGIN_FEEDBACK_TEXT[feedback]}</AlertDescription>
        </Alert>
      ) : null}
      <LoadingButton type="submit" className="w-full" loading={isLoading}>
        登录
      </LoadingButton>
    </form>
  );
}
