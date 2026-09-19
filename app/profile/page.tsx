import { AccountForms } from '@/components/profile/account-forms';
import { getViewer } from '@/lib/access';
import { prisma } from '@/lib/db';
import { UserCircle } from 'lucide-react';
import { redirect } from 'next/navigation';

export default async function ProfilePage() {
  const viewer = await getViewer();
  if (!viewer) {
    redirect('/login?callbackUrl=/profile');
  }

  const user = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: {
      id: true,
      username: true,
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="text-foreground flex items-center gap-2">
          <UserCircle className="text-primary h-6 w-6" />
          <h1 className="text-2xl font-semibold tracking-tight">个人资料</h1>
        </div>
        <p className="text-muted-foreground text-sm">修改用户名或密码，仅对当前账号生效。</p>
      </header>
      <AccountForms
        user={{
          id: user.id,
          username: user.username,
          role: user.role,
          createdAt: user.createdAt.toISOString(),
        }}
      />
    </div>
  );
}
