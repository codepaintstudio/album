import { requireAdmin } from '@/lib/auth-guards';
import { prisma } from '@/lib/db';
import { deleteUploadStorageKey } from '@/lib/storage';
import { cleanupExpiredUploadIntents } from '@/lib/upload-intent-cleanup';
import { NextResponse } from 'next/server';

const BATCH_SIZE = 100;

export async function POST() {
  const authCheck = await requireAdmin();
  if (!authCheck.ok) return authCheck.error;
  try {
    const intents = await prisma.uploadIntent.findMany({
      where: { expiresAt: { lte: new Date() }, photo: null },
      select: { id: true, storageKey: true, thumbnailKey: true },
      orderBy: { expiresAt: 'asc' },
      take: BATCH_SIZE,
    });
    const result = await cleanupExpiredUploadIntents(
      intents.map((intent: { id: string; storageKey: string; thumbnailKey: string | null }) => ({
        id: intent.id,
        storageKeys: [intent.storageKey, ...(intent.thumbnailKey ? [intent.thumbnailKey] : [])],
      })),
      {
        deleteObject: deleteUploadStorageKey,
        deleteIntent: async id => {
          await prisma.uploadIntent.delete({ where: { id } });
        },
      },
      BATCH_SIZE
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error('[upload cleanup] Failed to clean expired intents', error);
    return NextResponse.json({ error: '清理失败' }, { status: 500 });
  }
}
