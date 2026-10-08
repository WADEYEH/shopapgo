// Local review server only. The deployed store uses Worker Static Assets.
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.env.APGO_PROTOTYPE_DIR || "prototype");
const port = Number(process.env.PORT || new URL(process.env.APGO_BASE_URL || "http://127.0.0.1:4173").port || 4173);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".vtt": "text/vtt" };

createServer(async (request, response) => {
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { Allow: "GET, HEAD" });
      return response.end();
    }
    let pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    // The single site's home is the brand home; the store-only folder had none and showed v3 (ROOT_PAGE).
    if (pathname === "/") pathname = existsSync(path.join(root, "index.html")) ? "/index.html" : "/v3.html";
    if (pathname.endsWith("/")) pathname += "index.html";
    let file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root + path.sep)) throw new Error("Outside review assets");
    if (!path.extname(file)) file += ".html";
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : await readFile(file));
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`Store review: http://127.0.0.1:${port}`));
