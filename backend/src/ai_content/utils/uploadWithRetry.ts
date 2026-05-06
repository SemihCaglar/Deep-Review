import { Readable } from 'node:stream';

function isFileEmptyError(err: any): boolean {
  const msg = err?.details?.error?.message || err?.message || '';
  return msg === 'File is empty.' || msg.includes('File is empty');
}

/**
 * Retries any async operation when Azure returns a transient "File is empty" error.
 * The factory is called fresh on each attempt.
 */
export async function withRetryOnFileEmpty<T>(
  factory: () => Promise<T>,
  label: string,
  maxRetries = 3,
  delayMs = 3000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await factory();
    } catch (err: any) {
      if (attempt < maxRetries && isFileEmptyError(err)) {
        const msg = err?.details?.error?.message || err?.message || '';
        console.warn(`[${label}] Attempt ${attempt} failed ("${msg}"), retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
  throw new Error(`[${label}] Failed after ${maxRetries} attempts`);
}

/**
 * Uploads a PDF buffer to Azure with retry on "File is empty" errors.
 * Re-creates the stream each attempt since streams are single-use.
 */
export async function uploadPdfWithRetry(
  uploadFn: (stream: Readable) => Promise<string>,
  pdfBuffer: Buffer,
  label: string,
  maxRetries = 3,
  delayMs = 3000
): Promise<string> {
  return withRetryOnFileEmpty(
    () => uploadFn(Readable.from(pdfBuffer)),
    label,
    maxRetries,
    delayMs
  );
}
