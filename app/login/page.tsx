import { LoginTabs } from '@/components/profile/login-tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getViewer } from '@/lib/access';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  // 用 getViewer 而不是 auth()：被拒绝/待审核的账号可能仍持有旧 JWT，
  // 若按会话存在就跳回首页，会与 /profile 等地的 requireViewer 形成重定向死循环。
  const viewer = await getViewer();
  if (viewer) {
    redirect('/');
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <Card>
        <CardHeader className="text-center">
          <CardTitle>工作室相册系统</CardTitle>
          <CardDescription>登录后即可上传与管理图片；首次注册的用户将成为管理员。</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginTabs />
        </CardContent>
      </Card>
    </div>
  );
}
