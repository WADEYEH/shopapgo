// Shared response helpers for the Worker.

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });

export const fail = (status, code, message, headers) => json({ error: { code, message } }, status, headers);
