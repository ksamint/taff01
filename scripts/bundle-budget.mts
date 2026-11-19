// Measures the modern (non-noModule) JavaScript the production Today page
// loads, gzipped, and fails when it exceeds the budget in instruction_v0.md.
import { spawn } from "node:child_process";
import { gzipSync } from "node:zlib";

const BUDGET = 200 * 1024;
const FONT_PRELOAD_BUDGET = 70_716;
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
  const cjkHtml = await (
    await fetch(`${origin}/`, { headers: { "Accept-Language": "zh-HK" } })
  ).text();
  const fontPreloads = [...cjkHtml.matchAll(/<link[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => /rel="preload"/.test(tag) && /as="font"/.test(tag))
    .map((tag) => tag.match(/href="([^"]+)"/)?.[1])
    .filter((href): href is string => Boolean(href));
  const preloadedFonts = [...new Set(fontPreloads)];
  let fontBytes = 0;
  for (const href of preloadedFonts) {
    const response = await fetch(new URL(href, origin));
    if (!response.ok)
      throw new Error(`Font preload returned ${response.status}`);
    fontBytes += (await response.arrayBuffer()).byteLength;
  }
  console.log(
    `CJK first-document font preloads: ${fontBytes} bytes; budget ${FONT_PRELOAD_BUDGET}`,
  );
  if (
    preloadedFonts.some(
      (href) => href !== "/fonts/NotoSansTC-ui-common.woff2",
    ) ||
    fontBytes > FONT_PRELOAD_BUDGET
  ) {
    console.error("Font preload budget exceeded");
    process.exitCode = 1;
  }

  if (total > BUDGET) {
    console.error("Bundle budget exceeded");
    process.exitCode = 1;
  }
} finally {
  server.kill();
}
