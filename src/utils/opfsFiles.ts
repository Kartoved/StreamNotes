import heic2any from 'heic2any';

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

async function getAttachmentsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('attachments', { create: true });
}

// Convert HEIC/HEIF to JPEG before storing
async function normalizeFile(file: File): Promise<File> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif') {
    try {
      const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.88 }) as Blob;
      const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
      return new File([blob], newName, { type: 'image/jpeg' });
    } catch {
      // If conversion fails, store as-is
    }
  }
  return file;
}

export async function saveToOpfs(file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Файл слишком большой (${formatSize(file.size)}). Максимум 50 МБ.`);
  }
  const normalized = await normalizeFile(file);
  const dir = await getAttachmentsDir();
  const ext = normalized.name.split('.').pop()?.toLowerCase() || 'bin';
  const id = crypto.randomUUID();
  const filename = `${id}.${ext}`;
  const handle = await dir.getFileHandle(filename, { create: true });
  const writable = await (handle as any).createWritable();
  await writable.write(normalized);
  await writable.close();
  return `attachment://${filename}`;
}

// LRU Object URL cache — evicted URLs are revoked to free memory.
// This is critical on mobile Safari where blob URLs pin file blobs in RAM.
const LRU_MAX = 30;
const urlCache = new Map<string, string>();
const lruOrder: string[] = []; // oldest → newest

function lruTouch(key: string) {
  const idx = lruOrder.indexOf(key);
  if (idx !== -1) lruOrder.splice(idx, 1);
  lruOrder.push(key);
}

function lruEvict() {
  while (lruOrder.length > LRU_MAX) {
    const oldest = lruOrder.shift()!;
    const url = urlCache.get(oldest);
    if (url) { URL.revokeObjectURL(url); urlCache.delete(oldest); }
  }
}

/** Revoke all cached blob URLs (call on visibilitychange → hidden). */
export function revokeAllUrls() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
  lruOrder.length = 0;
}

export async function resolveUrl(src: string): Promise<string> {
  if (!src.startsWith('attachment://')) return src;
  if (urlCache.has(src)) { lruTouch(src); return urlCache.get(src)!; }
  const filename = src.replace('attachment://', '');
  const dir = await getAttachmentsDir();
  const handle = await dir.getFileHandle(filename);
  const file = await (handle as any).getFile();
  const url = URL.createObjectURL(file);
  urlCache.set(src, url);
  lruTouch(src);
  lruEvict();
  return url;
}

export function getFileType(src: string): 'image' | 'video' | 'file' {
  const ext = src.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(ext)) return 'video';
  return 'file';
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
