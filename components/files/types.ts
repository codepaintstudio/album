export type FileSet = {
  id: number;
  name: string;
  description: string | null;
  fileCount: number;
};

export type FileItem = {
  id: number;
  filename: string;
  originalName: string;
  description: string | null;
  mimeType: string;
  size: number;
  url: string;
  uploaderId: number;
  createdAt: string;
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
