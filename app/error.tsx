'use client';

import { ErrorState } from '@/components/error-state';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      detail={process.env.NODE_ENV === 'production' ? error?.digest : error?.message}
      reset={reset}
    />
  );
}
