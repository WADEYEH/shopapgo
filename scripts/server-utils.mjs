import { spawn } from "node:child_process";

export const BASE_URL = process.env.APGO_BASE_URL || "http://127.0.0.1:4173";

async function isReachable(url) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function ensurePrototypeServer() {
  if (await isReachable(`${BASE_URL}/`)) {
    return async () => {};
  }

  const server = spawn(
    "python3",
    ["-m", "http.server", "4173", "-d", "prototype"],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Prototype server exited early.\n${stderr}`);
    }
    if (await isReachable(`${BASE_URL}/`)) break;
    await wait(100);
  }

  if (!(await isReachable(`${BASE_URL}/`))) {
    server.kill("SIGTERM");
    throw new Error(`Prototype server did not become ready.\n${stderr}`);
  }

  return async () => {
    if (server.exitCode !== null) return;
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      wait(2_000),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  };
}
