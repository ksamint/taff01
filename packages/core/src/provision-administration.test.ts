import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("private provision CLI rejects untrusted stdin without connecting or printing input", async () => {
  const result = await new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        fileURLToPath(
          new URL("../../../node_modules/tsx/dist/loader.mjs", import.meta.url),
        ),
        fileURLToPath(
          new URL("./provision-administration.ts", import.meta.url),
        ),
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: "postgres://unused:unused@localhost:1/unused_test",
          AUTH_URL: "https://test.local",
          AUTH_SECRET: "test-secret-minimum-thirty-two-characters",
          TOKEN_PEPPER: "test-pepper-sixteen-characters",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(
      JSON.stringify({ password: "do-not-print-input", systemAdmin: true }),
    );
  });
  expect(result.code).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr.trim()).toBe('{"error":"invalid_input"}');
}, 10_000);
