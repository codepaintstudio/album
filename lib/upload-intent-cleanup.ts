export interface ExpiredUploadIntent {
  id: string;
  storageKeys: string[];
}

export async function cleanupExpiredUploadIntents(
  intents: ExpiredUploadIntent[],
  operations: {
    deleteObject: (storageKey: string) => Promise<void>;
    deleteIntent: (id: string) => Promise<void>;
  },
  limit = 100
) {
  let cleaned = 0;
  const failures: string[] = [];
  for (const intent of intents.slice(0, limit)) {
    try {
      for (const storageKey of intent.storageKeys) {
        await operations.deleteObject(storageKey);
      }
      await operations.deleteIntent(intent.id);
      cleaned += 1;
    } catch {
      failures.push(intent.id);
    }
  }
  return { cleaned, failures };
}
