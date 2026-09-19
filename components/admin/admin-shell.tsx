'use client';

import { ADMIN_TABS, type AdminTab } from '@/components/admin/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQueryParamWriter } from '@/lib/query-state';
import { LayoutDashboard } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * 只渲染当前 tab：页面上的每个 tab 由服务端按需取数（见 app/admin/_tab-content.tsx），
 * 所以这里不需要、也拿不到其他 tab 的数据。
 * value 完全由 ?tab= 决定，切换要等一次 RSC 往返，因此不会出现"标签高亮已变、内容还是旧的"。
 */
export function AdminShell({ tab, children }: { tab: AdminTab; children: ReactNode }) {
  const setParam = useQueryParamWriter();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="text-primary h-6 w-6" />
          <h1 className="text-2xl font-semibold tracking-tight">控制台</h1>
        </div>
        <p className="text-muted-foreground text-sm">管理分类、成员以及分享链接。</p>
      </div>

      <Tabs value={tab} onValueChange={value => setParam('tab', value)}>
        <TabsList className="grid w-full grid-cols-4">
          {ADMIN_TABS.map(item => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab} className="space-y-6">
          {children}
        </TabsContent>
      </Tabs>
    </div>
  );
}
