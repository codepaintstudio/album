'use client';

import { ErrorState } from '@/components/error-state';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="控制台加载失败"
      description="无法读取管理数据，请重试。"
      detail={process.env.NODE_ENV === 'production' ? error?.digest : error?.message}
      reset={reset}
    />
  );
}
