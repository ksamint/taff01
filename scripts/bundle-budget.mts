// Measures the modern (non-noModule) JavaScript the production Today page
// loads, gzipped, and fails when it exceeds the budget in instruction_v0.md.
import { spawn } from "node:child_process";
import { gzipSync } from "node:zlib";

const BUDGET = 200 * 1024;
const port = Number(process.env.BUDGET_PORT ?? 3105);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  "node",
  ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
  { cwd: "apps/web", env: process.env, stdio: "ignore" },
);
async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${origin}/`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Production server did not start");
}
try {
  await waitForServer();
  const html = await (await fetch(`${origin}/`)).text();
  const scripts = [...html.matchAll(/<script[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => !/nomodule/i.test(tag))
    .map((tag) => tag.match(/src="([^"]+)"/)?.[1])
    .filter((src): src is string => Boolean(src));
  let total = 0;
  for (const src of scripts) {
    const bytes = new Uint8Array(
      await (await fetch(origin + src)).arrayBuffer(),
    );
    const size = gzipSync(bytes, { level: 9 }).length;
    total += size;
    console.log(`${String(size).padStart(8)}  ${src}`);
  }
  const kib = (total / 1024).toFixed(1);
  console.log(
    `Today initial JS: ${total} bytes gzipped (${kib} KiB); budget ${BUDGET}`,
  );
  if (total > BUDGET) {
    console.error("Bundle budget exceeded");
    process.exitCode = 1;
  }
} finally {
  server.kill();
}
