'use client';

import { ErrorState } from '@/components/error-state';

export default function ShareError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="分享加载失败"
      description="无法读取分享内容，请重试。"
      detail={process.env.NODE_ENV === 'production' ? error?.digest : error?.message}
      reset={reset}
    />
  );
}
