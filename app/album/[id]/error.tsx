'use client';

import { ErrorState } from '@/components/error-state';

export default function AlbumError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="相册加载失败"
      description="无法读取该相册的媒体列表，请重试。"
      detail={process.env.NODE_ENV === 'production' ? error?.digest : error?.message}
      reset={reset}
    />
  );
}
