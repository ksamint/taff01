import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";

const projects = new Set([
  "phone-en",
  "phone-zh-HK",
  "desktop-en",
  "desktop-zh-HK",
  "phone-zh-CN",
  "desktop-zh-CN",
]);
const files = new Set([
  "platform.spec.ts",
  "mind.spec.ts",
  "crm.spec.ts",
  "timeline.spec.ts",
  "brief.spec.ts",
  "release/checklist.spec.ts",
]);
/** Targeting only: callers cannot override artifact safety or serialization. */
export function validateLiveArgs(args) {
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--list") continue;
    const [flag, ...parts] = argument.split("=");
    if (
      ["--grep", "-g", "--project", "--repeat-each", "--retries"].includes(flag)
    ) {
      const value = parts.length ? parts.join("=") : args[++index];
      if (!value || value.startsWith("--"))
        throw new Error("Missing live targeting value");
      if (flag === "--project" && !projects.has(value))
        throw new Error("Unknown live project");
      if (flag === "--repeat-each" && !/^[1-5]$/.test(value))
        throw new Error("Live repeat count must be 1–5");
      if (flag === "--retries" && !/^[01]$/.test(value))
        throw new Error("A live check gets at most one retry");
      continue;
    }
    if (files.has(argument.replace(/^e2e\/live\//, ""))) continue;
    throw new Error(
      "Unsupported live option; artifact and config overrides are forbidden",
    );
  }
  return args;
}
/** Never reuse an acceptance summary, including discovery/startup failures. */
export function freshLiveReport(parent) {
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  return mkdtempSync(join(parent, "run-"));
}
export function ownsGrant(grant, baseline, entries) {
  return (
    !!grant.taskId &&
    entries.some(
      (entry) => entry.kind === "tasks" && entry.id === grant.taskId,
    ) &&
    !baseline.some((prior) => prior.id === grant.id) &&
    ["allowed", "pending"].includes(grant.status)
  );
}

/** Fixed categories only: never copy request URLs, errors, DOM, or credentials. */
export function failureCategory(error) {
  const message = String(error?.message ?? "");
  if (error?.name === "TimeoutError" || /Timeout \d+ms exceeded/.test(message))
    return "timeout";
  for (const code of ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"])
    if (message.includes(code)) return code.toLowerCase();
  if (/net::ERR_[A-Z_]+/.test(message)) return "browser_network_error";
  return "transport_or_local_error";
}
