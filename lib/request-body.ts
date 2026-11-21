class InvalidRequestBodyEncodingError extends TypeError {}

export async function readBoundedRequestBody(
  request: Request,
  maxBytes: number
): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new InvalidRequestBodyEncodingError();
    }
    throw error;
  }
}

export type BoundedJsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "too-large" | "invalid" };

export async function readBoundedJsonBody(
  request: Request,
  maxBytes: number
): Promise<BoundedJsonBodyResult> {
  let bodyText: string | null;
  try {
    bodyText = await readBoundedRequestBody(request, maxBytes);
  } catch (error) {
    if (error instanceof InvalidRequestBodyEncodingError) {
      return { ok: false, reason: "invalid" };
    }
    throw error;
  }

  if (bodyText === null) return { ok: false, reason: "too-large" };

  try {
    return { ok: true, value: JSON.parse(bodyText) as unknown };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { ok: false, reason: "invalid" };
    }
    throw error;
  }
}
