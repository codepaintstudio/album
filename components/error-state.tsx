'use client';

import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowLeft, Home, RotateCcw } from 'lucide-react';
import Link from 'next/link';

export function ErrorState({
  title = '出了点问题',
  description = '页面加载失败，请重试。',
  detail,
  reset,
}: {
  title?: string;
  description?: string;
  detail?: string;
  reset?: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
      <div className="max-w-md space-y-6 text-center">
        <div className="flex justify-center">
          <div className="bg-destructive/10 rounded-full p-6">
            <AlertTriangle className="text-destructive h-16 w-16" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
          {detail ? (
            <p className="text-muted-foreground font-mono text-xs break-all">{detail}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          {reset ? (
            <Button onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              重试
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/">
              <Home className="h-4 w-4" />
              返回首页
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/help">
              <ArrowLeft className="h-4 w-4" />
              帮助中心
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
