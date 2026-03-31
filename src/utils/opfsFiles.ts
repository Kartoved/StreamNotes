export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

async function getAttachmentsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('attachments', { create: true });
}

export async function saveToOpfs(file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Файл слишком большой (${formatSize(file.size)}). Максимум 50 МБ.`);
  }
  const dir = await getAttachmentsDir();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const id = crypto.randomUUID();
  const filename = `${id}.${ext}`;
  const handle = await dir.getFileHandle(filename, { create: true });
  const writable = await (handle as any).createWritable();
  await writable.write(file);
  await writable.close();
  return `attachment://${filename}`;
}

// Object URL cache — revoked on page unload
const urlCache = new Map<string, string>();

export async function resolveUrl(src: string): Promise<string> {
  if (!src.startsWith('attachment://')) return src;
  if (urlCache.has(src)) return urlCache.get(src)!;
  const filename = src.replace('attachment://', '');
  const dir = await getAttachmentsDir();
  const handle = await dir.getFileHandle(filename);
  const file = await (handle as any).getFile();
  const url = URL.createObjectURL(file);
  urlCache.set(src, url);
  return url;
}

export function getFileType(src: string): 'image' | 'video' | 'file' {
  const ext = src.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(ext)) return 'video';
  return 'file';
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
