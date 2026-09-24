'use client';

import type { UserItem } from '@/components/admin/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorAlert } from '@/components/ui/error-alert';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEffect, useState } from 'react';

/** 与 DELETE /api/users 的请求体同形。 */
export type UserDeletePayload = {
  id: number;
  photoDecision?: 'transfer';
  driveDecision?: 'transfer';
  transferToUserId?: number;
};

type Props = {
  /** null 表示关闭。 */
  user: UserItem | null;
  candidates: UserItem[];
  busy?: boolean;
  onClose: () => void;
  onConfirm: (payload: UserDeletePayload) => Promise<void> | void;
};

function summarize(user: UserItem): string[] {
  const lines: string[] = [];
  if (user.photoCount > 0) {
    lines.push(`${user.photoCount} 张照片`);
  }
  const drive: string[] = [];
  if (user.fileSetCount > 0) {
    drive.push(`${user.fileSetCount} 个文件集`);
  }
  if (user.fileCount > 0) {
    drive.push(`${user.fileCount} 个文件`);
  }
  if (drive.length > 0) {
    lines.push(drive.join('、'));
  }
  return lines;
}

/**
 * 删除成员前处置其资产的地方。
 *
 * 只做转移：用户删除不销毁任何对象，所以这里没有"直接删除"这个选项——
 * 一个后端会拒绝的开关留在界面上，只是把 400 换个位置出现。
 *
 * 决定仍由服务端逐条校验（lib/asset-deletion.ts 的 planUserDelete）：这个组件是
 * 让管理员**看见**后果，不是替代那道闸。
 */
export function UserDeleteDialog({ user, candidates, busy = false, onClose, onConfirm }: Props) {
  const [targetId, setTargetId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 对话框在父组件里常驻，换一个用户时必须把上一次的选择清掉。
  useEffect(() => {
    setTargetId(null);
    setError(null);
  }, [user?.id]);

  const lines = user ? summarize(user) : [];
  const needsTarget = lines.length > 0;
  const receiver = candidates.find(candidate => candidate.id === targetId) ?? null;

  const confirm = async () => {
    if (!user) return;
    if (needsTarget && targetId === null) {
      setError('请先选择接收这些资产的用户');
      return;
    }

    const payload: UserDeletePayload = { id: user.id };
    if (user.photoCount > 0) payload.photoDecision = 'transfer';
    if (user.fileCount > 0 || user.fileSetCount > 0) payload.driveDecision = 'transfer';
    if (needsTarget && targetId !== null) payload.transferToUserId = targetId;

    setError(null);
    await onConfirm(payload);
  };

  return (
    <Dialog open={user !== null} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除用户</DialogTitle>
          <DialogDescription>
            {needsTarget && user
              ? `该用户拥有 ${lines.join(' 与 ')}，删除前必须指定接收方。`
              : '确认删除该用户？'}
          </DialogDescription>
        </DialogHeader>

        {needsTarget ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="transfer-user">资产转移给</Label>
              <Select
                value={targetId === null ? '' : String(targetId)}
                onValueChange={value => setTargetId(Number(value))}
              >
                <SelectTrigger id="transfer-user">
                  <SelectValue placeholder="选择用户" />
                </SelectTrigger>
                <SelectContent>
                  {candidates
                    .filter(candidate => candidate.id !== user?.id)
                    .map(candidate => (
                      <SelectItem key={candidate.id} value={String(candidate.id)}>
                        {candidate.username}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-muted-foreground text-sm">
              {receiver
                ? `${receiver.username} 将成为这些相册与文件的上传者与所有者；资产不会被删除。`
                : '这些相册与文件不会被删除，只是换一个人归属。'}
            </p>
            {user && user.fileSetCount > 0 ? (
              <p className="text-muted-foreground text-sm">
                其中 internal 与 public 的文件集对其他成员仍然可见，转移后由{' '}
                {receiver?.username ?? '接收方'} 管理。
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">该用户没有相册与云盘资产，可直接删除。</p>
        )}

        {error ? <ErrorAlert title="无法删除" message={error} /> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy ? '处理中…' : '确认删除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
