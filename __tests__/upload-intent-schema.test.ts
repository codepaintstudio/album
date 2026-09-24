import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync('prisma/schema.prisma', 'utf8').replace(/\r\n/g, '\n');

describe('upload intent persistence', () => {
  it('uses a unique Photo-to-intent relation as the atomic completion claim', () => {
    expect(schema).toMatch(/^  uploadIntentId\s+String\?\s+@unique\s+@db\.VarChar\(36\)$/m);
    expect(schema).toMatch(
      /^  uploadIntent\s+UploadIntent\?\s+@relation\(fields: \[uploadIntentId\], references: \[id\], onDelete: SetNull\)$/m
    );
  });

  it('persists expiry, expected byte size, and object key for bounded cleanup and verification', () => {
    const intent = /^model UploadIntent \{([\s\S]*?)^\}/m.exec(schema)?.[1];
    expect(intent).toBeDefined();
    expect(intent).toMatch(/^  storageKey\s+String\s+@unique\s+@db\.VarChar\(512\)$/m);
    expect(intent).toMatch(/^  thumbnailKey\s+String\?\s+@db\.VarChar\(512\)$/m);
    expect(intent).toMatch(/^  expectedSize\s+Int$/m);
    expect(intent).toMatch(/^  expiresAt\s+DateTime$/m);
    expect(intent).toMatch(/^  completedAt\s+DateTime\?$/m);
    expect(intent).toMatch(/^  photo\s+Photo\?$/m);
  });
});
