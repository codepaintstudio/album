'use client';

import { ErrorState } from '@/components/error-state';

export default function FilesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="文件管理加载失败"
      description="无法读取文件列表，请重试。"
      detail={process.env.NODE_ENV === 'production' ? error?.digest : error?.message}
      reset={reset}
    />
  );
}
