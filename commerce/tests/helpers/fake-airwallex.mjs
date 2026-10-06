// A tiny local stand-in for the Airwallex sandbox API, used only to dry-run
// scripts/airwallex-sandbox-smoke.mjs without real keys:
//   node tests/helpers/fake-airwallex.mjs 9911
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

export function startFakeAirwallex(port = 9911) {
  const intents = new Map();
  let counter = 0;
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
      const body = raw ? JSON.parse(raw) : {};
      const url = new URL(req.url, "http://x");
      if (url.pathname === "/api/v1/authentication/login") {
        if (req.headers["x-client-id"] !== "fake-client" || req.headers["x-api-key"] !== "fake-key") return send(401, { code: "credentials_invalid" });
        return send(201, { token: "fake-token", expires_at: new Date(Date.now() + 30 * 60_000).toISOString().replace(/\.\d+Z$/, "+0000") });
      }
      if (req.headers.authorization !== "Bearer fake-token") return send(401, { code: "unauthorized" });
      if (url.pathname === "/api/v1/pa/payment_intents/create") {
        const id = `int_fake_${++counter}`;
        const intent = { id, ...body, status: "REQUIRES_PAYMENT_METHOD", client_secret: `cs_${id}` };
        intents.set(id, intent);
        return send(201, intent);
      }
      const confirm = url.pathname.match(/payment_intents\/([^/]+)\/confirm$/);
      if (confirm) {
        const intent = intents.get(confirm[1]);
        if (!intent) return send(404, { code: "resource_not_found" });
        const ok = body.payment_method?.card?.number === "4035501000000008";
        intent.status = ok ? "SUCCEEDED" : "REQUIRES_PAYMENT_METHOD";
        return send(200, intent);
      }
      const get = url.pathname.match(/payment_intents\/([^/]+)$/);
      if (get && intents.has(get[1])) return send(200, intents.get(get[1]));
      return send(404, { code: "resource_not_found" });
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startFakeAirwallex(Number(process.argv[2] || 9911));
  console.log("fake Airwallex on", process.argv[2] || 9911);
}
