// Calls to the store's API on the Worker (/api/*). A failure carries the Worker's error code and message, and for a
// checkout field the field to fix; no answer at all (offline, or the static pages without the Worker) reads as
// "unavailable".

// field: the checkout field the Worker says to fix, when it names one.
export class ApiError extends Error {
  constructor(status, code, message, field) {
    super(message);
    this.status = status;
    this.code = code;
    if (field) this.field = field;
  }
}

export async function api(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network_error", "We couldn't reach the store. Check your connection and try again.");
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    // Not JSON: no Worker in front of the page.
  }
  if (!response.ok || !data) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? "unavailable",
      data?.error?.message ?? "The store is unavailable right now. Please try again shortly.",
      data?.error?.field,
    );
  }
  return data;
}
