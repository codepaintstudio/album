export type AdminTab = 'categories' | 'filesets' | 'users' | 'share';

export const ADMIN_TABS: Array<{ value: AdminTab; label: string }> = [
  { value: 'categories', label: '相册' },
  { value: 'filesets', label: '文件' },
  { value: 'users', label: '成员' },
  { value: 'share', label: '分享' },
];

export interface CategoryItem {
  id: number;
  name: string;
  description: string | null;
  photoCount: number;
  createdAt: string;
  visibility: 'private' | 'internal' | 'public';
}

export interface UserItem {
  id: number;
  username: string;
  role: string;
  status: 'pending' | 'active' | 'rejected';
  photoCount: number;
  createdAt: string;
}

export interface ShareLinkItem {
  id: number;
  token: string;
  categoryId: number;
  categoryName: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface FileSetItem {
  id: number;
  name: string;
  description: string | null;
  visibility: 'private' | 'internal' | 'public';
  fileCount: number;
  createdAt: string;
}
