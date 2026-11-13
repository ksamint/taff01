import { createHash } from "node:crypto";
import { type Core, CoreError, type Principal } from "@taff/core";
import type { ViewExportQuery } from "@taff/schemas";
import type { RateLimiter } from "./rate-limit";

export type ViewImageOptions = {
  exportRateLimiter?: RateLimiter;
  renderUrl?: string;
  renderFetch?: typeof fetch;
};

/** Shared live renderer: limits are keyed by member, across every token. */
export async function renderViewImage(
  core: Core,
  principal: Principal,
  workspaceId: string,
  query: Omit<ViewExportQuery, "locale"> & {
    locale?: ViewExportQuery["locale"];
  },
  channel: "web" | "mcp",
  options: ViewImageOptions,
) {
  const identity =
    principal.kind === "user" ? principal.userId : principal.memberId;
  const key = `view-export:${createHash("sha256").update(identity).digest("hex")}`;
  let allowed: boolean;
  try {
    allowed = !!(await options.exportRateLimiter?.hit(key))?.allowed;
  } catch {
    throw new CoreError("internal_error", 503);
  }
  if (!options.exportRateLimiter) throw new CoreError("internal_error", 503);
  if (!allowed) throw new CoreError("rate_limited", 429);
  const input = await core.exportViewImageInput(
    principal,
    workspaceId,
    query,
    channel,
  );
  if (!options.renderUrl) throw new CoreError("render_unavailable", 503);
  const { fileName, ...body } = input;
  try {
    const response = await (options.renderFetch ?? fetch)(
      new URL(
        query.view === "timeline"
          ? "/render/timeline"
          : query.view === "calendar"
            ? "/render/calendar"
            : "/render/summary",
        options.renderUrl,
      ),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (
      !response.ok ||
      !response.headers.get("content-type")?.startsWith("image/png")
    )
      throw new Error("render_failed");
    const data = new Uint8Array(await response.arrayBuffer());
    return { data, fileName, contentHash: input.contentHash };
  } catch {
    throw new CoreError("render_failed", 502);
  }
}
