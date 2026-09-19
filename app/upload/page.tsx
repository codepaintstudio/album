import { getViewer } from '@/lib/access';
import { redirect } from 'next/navigation';

export default async function UploadPage() {
  const viewer = await getViewer();
  if (!viewer) {
    redirect('/login');
  }

  redirect('/');
}
