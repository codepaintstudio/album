import { canTouchFileSet } from '@/lib/access-rules';
import { requireAuth } from '@/lib/auth-guards';
import { prisma } from '@/lib/db';
import { getFileBuffer, guessMimeFromFilename } from '@/lib/storage';
import { idStringSchema } from '@/lib/validation';
import { NextResponse } from 'next/server';

/**
 * GET /api/files/preview-proxy?fileId=123
 * Streams file bytes with inline Content-Disposition and proper Content-Type
 * to encourage the browser to preview inline rather than download.
 */
export async function GET(req: Request) {
  try {
    const authCheck = await requireAuth();
    if (!authCheck.ok) return authCheck.error;
    const { viewer } = authCheck;

    const url = new URL(req.url);
    const fileIdStr = url.searchParams.get('fileId');
    const parsedFileId = fileIdStr === null ? undefined : idStringSchema.safeParse(fileIdStr);
    if (!parsedFileId?.success) {
      return NextResponse.json({ message: 'fileId 错误' }, { status: 400 });
    }
    const fileId = parsedFileId.data;

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        filename: true,
        originalName: true,
        mimeType: true,
        filesetId: true,
        fileSet: { select: { visibility: true, createdBy: true } },
      },
    });

    if (!file) {
      return NextResponse.json({ message: '文件不存在' }, { status: 404 });
    }

    if (!canTouchFileSet(viewer, file.fileSet)) {
      return NextResponse.json({ message: '无权限' }, { status: 403 });
    }

    const raw = (await getFileBuffer(file.filename)) as Buffer | Uint8Array | ArrayBuffer;
    const mime = file.mimeType || guessMimeFromFilename(file.originalName);

    // Some browsers and the Fetch headers implementation require ASCII-only header values.
    // When originalName contains non-ASCII (e.g., Chinese), use RFC 5987/6266 filename* with UTF-8
    // and provide an ASCII-safe fallback for filename.
    const asciiFallback = buildAsciiFilenameFallback(file.originalName);
    const encodedUTF8 = encodeURIComponent(file.originalName);

    // Ensure body conforms to BodyInit by using ArrayBuffer
    const arrayBuffer: ArrayBuffer =
      raw instanceof ArrayBuffer
        ? raw
        : raw instanceof Uint8Array
          ? (raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer)
          : ((raw as Buffer).buffer.slice(
              (raw as Buffer).byteOffset,
              (raw as Buffer).byteOffset + (raw as Buffer).byteLength
            ) as ArrayBuffer);
    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': mime,
        // Provide both filename (ASCII fallback) and filename* (UTF-8 encoded)
        'Content-Disposition': `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodedUTF8}`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (e: any) {
    console.error('[GET /api/files/preview-proxy]', e);
    if (e?.message === 'Unauthorized') {
      return NextResponse.json({ message: '未登录' }, { status: 401 });
    }
    return NextResponse.json({ message: '预览失败' }, { status: 500 });
  }
}

function buildAsciiFilenameFallback(originalName: string) {
  // Extract extension, sanitize basename to ASCII, and rebuild filename
  const match = /\.([^.]+)$/u.exec(originalName);
  const ext = match?.[1]?.toLowerCase();
  const basename = originalName.replace(/\.[^.]+$/u, '');
  // Normalize and replace non-ASCII and unsafe characters
  let ascii = basename
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\;]/g, '_')
    .trim();
  if (!ascii) ascii = 'download';
  return ext ? `${ascii}.${ext}` : ascii;
}
