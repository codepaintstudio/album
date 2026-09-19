'use client';

import { ErrorState } from '@/components/error-state';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <ErrorState
          description="应用遇到了严重错误，请重试或联系管理员。"
          detail={process.env.NODE_ENV === 'production' ? error?.digest : error?.message}
          reset={reset}
        />
      </body>
    </html>
  );
}
