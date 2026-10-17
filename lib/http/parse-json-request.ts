export type ParsedJsonRequest =
  | { success: true; value: unknown }
  | { success: false; reason: 'invalid_json' | 'too_large' };

export const MAX_JSON_REQUEST_BYTES = 32 * 1024;

export async function parseJsonRequest(request: Request, maximumBytes: number): Promise<ParsedJsonRequest> {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    return { success: false, reason: 'too_large' };
  }

  if (!request.body) return { success: false, reason: 'invalid_json' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        return { success: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { success: false, reason: 'invalid_json' };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { success: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
  } catch {
    return { success: false, reason: 'invalid_json' };
  }
}
