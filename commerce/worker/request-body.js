import { fail } from "./http.js";

export const BODY_LIMITS = Object.freeze({ json: 64 * 1024, paymentWebhook: 256 * 1024, image: 2 * 1024 * 1024 });

export function requestBodyLimit(request) {
  const { pathname } = new URL(request.url);
  if (!['POST', 'PUT', 'PATCH'].includes(request.method) || !/^\/(?:api|admin\/api)\//.test(pathname)) return null;
  if (/^\/api\/webhooks\/(?:airwallex|paypal)$/.test(pathname)) return BODY_LIMITS.paymentWebhook;
  if (/^\/admin\/api\/products\/[^/]+\/images$/.test(pathname)) return BODY_LIMITS.image;
  return BODY_LIMITS.json;
}

// Bound the stream before any JSON parsing, signature work or arrayBuffer conversion. Never trust Content-Length
// alone: chunked requests and a forged small declaration get the same byte cap. Raw bytes and signature headers survive.
export async function boundRequestBody(request) {
  const limit = requestBodyLimit(request);
  if (limit === null || !request.body) return request;
  const { pathname } = new URL(request.url);
  const tooLarge = (bytes) => {
    console.warn("request_body_too_large", { path: pathname, limit, bytes });
    return fail(413, "payload_too_large", "Request body is too large.");
  };
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > limit) {
    await request.body.cancel();
    return tooLarge(declared);
  }
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        return tooLarge(length);
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => {});
    return fail(400, "invalid_body", "Request body could not be read.");
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const headers = new Headers(request.headers);
  headers.delete("Content-Length");
  return new Request(request, { body: bytes, headers, duplex: "half" });
}
