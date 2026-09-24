import { cleanupExpiredUploadIntents } from '@/lib/upload-intent-cleanup';
import { describe, expect, it, vi } from 'vitest';

describe('cleanupExpiredUploadIntents', () => {
  it('deletes storage before intent rows and respects batch bound', async () => {
    const order: string[] = [];
    const result = await cleanupExpiredUploadIntents(
      Array.from({ length: 3 }, (_, index) => ({
        id: `id-${index}`,
        storageKeys: [`key-${index}`],
      })),
      {
        deleteObject: async key => {
          order.push(`object:${key}`);
        },
        deleteIntent: async id => {
          order.push(`intent:${id}`);
        },
      },
      2
    );
    expect(result).toEqual({ cleaned: 2, failures: [] });
    expect(order).toEqual(['object:key-0', 'intent:id-0', 'object:key-1', 'intent:id-1']);
  });

  it('removes image and thumbnail objects before deleting the intent row', async () => {
    const order: string[] = [];
    const result = await cleanupExpiredUploadIntents(
      [{ id: 'image-intent', storageKeys: ['uploads/photo.png', 'thumbs/thumb-photo.png'] }],
      {
        deleteObject: async key => {
          order.push(`object:${key}`);
        },
        deleteIntent: async id => {
          order.push(`intent:${id}`);
        },
      }
    );
    expect(result).toEqual({ cleaned: 1, failures: [] });
    expect(order).toEqual([
      'object:uploads/photo.png',
      'object:thumbs/thumb-photo.png',
      'intent:image-intent',
    ]);
  });

  it('keeps an intent discoverable when storage deletion fails', async () => {
    const deleteIntent = vi.fn();
    const result = await cleanupExpiredUploadIntents([{ id: 'retry', storageKeys: ['key'] }], {
      deleteObject: async () => {
        throw new Error('storage unavailable');
      },
      deleteIntent,
    });
    expect(result).toEqual({ cleaned: 0, failures: ['retry'] });
    expect(deleteIntent).not.toHaveBeenCalled();
  });
});
