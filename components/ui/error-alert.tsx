import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/** 错误就地显示在受影响的内容旁边，不引入 toast 依赖 */
export function ErrorAlert({
  title,
  message,
  className,
}: {
  title?: string;
  message: ReactNode;
  className?: string;
}) {
  return (
    <Alert variant="destructive" className={cn(className)}>
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
