'use client';

import { Button } from '@/components/ui/button';
import { useQueryParamWriter } from '@/lib/query-state';

/**
 * 页窗口分页器，写入 ?p=。标记沿用控制台原有的"第 N 页 / 共 M 页"样式。
 */
export function PaginationControls({
  page,
  total,
  pageSize,
}: {
  page: number;
  total: number;
  pageSize: number;
}) {
  const setParam = useQueryParamWriter();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  if (pageCount <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-muted-foreground text-sm">
        第 {page} 页 / 共 {pageCount} 页 · {total} 条
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => setParam('p', String(Math.max(page - 1, 1)))}
        >
          上一页
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => setParam('p', String(Math.min(page + 1, pageCount)))}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
