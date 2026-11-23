import type { Observation } from "./capture.mts";
import {
  type Json,
  localUrl,
  mcpProtocol,
  mcpTools,
  modernCatalogRequest,
  projectResponse,
  type Recipe,
  recipes,
  restRoutes,
} from "./wire.mts";

function instant(value: string): string {
  const match =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) return value;
  const wall = Date.parse(`${match[1]}Z`);
  if (
    !Number.isFinite(wall) ||
    new Date(wall).toISOString().slice(0, 19) !== match[1]
  )
    return value;
  const seconds = Date.parse(match[1] + match[3]);
  if (!Number.isFinite(seconds)) return value;
  const utc = new Date(seconds).toISOString().replace(/\.000Z$/, "");
  const fraction = match[2]?.replace(/0+$/, "");
  return `${utc}${fraction ? `.${fraction}` : ""}Z`;
}

export function normalize(value: Json): Json {
  if (typeof value === "string") return instant(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize(value[key])]),
    );
  return value;
}

export function differences(expected: Json, actual: Json): string[] {
  const pointers: string[] = [];
  function compare(
    left: Json | undefined,
    right: Json | undefined,
    path: string,
  ) {
    if (left === right) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      for (let index = 0; index < Math.max(left.length, right.length); index++)
        compare(left[index], right[index], `${path}/${index}`);
    } else if (
      left &&
      right &&
      typeof left === "object" &&
      typeof right === "object" &&
      !Array.isArray(left) &&
      !Array.isArray(right)
    ) {
      for (const key of [
        ...new Set([...Object.keys(left), ...Object.keys(right)]),
      ].sort())
        compare(
          left[key],
          right[key],
          `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
        );
    } else pointers.push(path);
  }
  compare(normalize(expected), normalize(actual), "");
  return pointers;
}

type Credentials = { session?: string; bearer?: string };
type Compared = { route: string; recipe: Recipe; differences: string[] };
export async function replay(
  observations: Observation[],
  base: string,
  credentials: Credentials = {},
  only?: Set<Recipe>,
) {
  const origin = localUrl(base);
  if (origin.pathname !== "/" || origin.search || origin.hash)
    throw new Error("compare expects an origin");
  const observedRoutes = new Set<string>();
  const observedTools = new Set<string>();
  const replayedRoutes = new Set<string>();
  const skip: Record<string, number> = {};
  const count = (reason: string) => {
    skip[reason] = (skip[reason] ?? 0) + 1;
  };
  const compared: Compared[] = [];
  for (const entry of observations) {
    if (restRoutes.has(entry.route)) observedRoutes.add(entry.route);
    if (entry.mcp?.tool && mcpTools.has(entry.mcp.tool))
      observedTools.add(entry.mcp.tool);
    if ("skip" in entry) {
      count(entry.skip);
      continue;
    }
    if (only && !only.has(entry.recipe)) {
      count("outside selected recipes");
      continue;
    }
    if (!Object.hasOwn(recipes, entry.recipe))
      throw new Error("unknown recipe");
    const definition = recipes[entry.recipe];
    if (entry.route !== definition.route)
      throw new Error("recipe and route differ");
    const [method, path] = definition.route.split(" ");
    const headers = new Headers();
    if (definition.auth === "session") {
      if (!credentials.session) {
        count("fresh session required");
        continue;
      }
      if (
        !/^(?:__Secure-)?better-auth\.session_token=[^;\s]+$/.test(
          credentials.session,
        )
      )
        throw new Error("invalid session header format");
      headers.set("Cookie", credentials.session);
    }
    if (definition.auth === "bearer") {
      if (!credentials.bearer) {
        count("fresh bearer required");
        continue;
      }
      headers.set("Authorization", `Bearer ${credentials.bearer}`);
      headers.set("Content-Type", "application/json");
      headers.set("Accept", "application/json, text/event-stream");
      headers.set("MCP-Protocol-Version", mcpProtocol);
      headers.set("Mcp-Method", "tools/list");
    }
    const response = await fetch(new URL(path!, origin), {
      method,
      headers,
      redirect: "manual",
      body:
        entry.recipe === "mcpCatalog"
          ? JSON.stringify(modernCatalogRequest())
          : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    const body = await projectResponse(entry.recipe, response).catch(
      () => null,
    );
    if (restRoutes.has(entry.route)) replayedRoutes.add(entry.route);
    const delta = differences(
      { status: entry.status, body: entry.body },
      { status: response.status, body },
    );
    compared.push({
      route: entry.route,
      recipe: entry.recipe,
      differences: delta,
    });
  }
  return {
    coverage: {
      routes: {
        registered: restRoutes.size,
        observed: observedRoutes.size,
        replayed: replayedRoutes.size,
      },
      tools: {
        registered: mcpTools.size,
        observed: observedTools.size,
        replayed: 0,
      },
      mcpCatalog: compared.filter(({ recipe }) => recipe === "mcpCatalog")
        .length,
    },
    exchanges: observations.length,
    compared: compared.length,
    skip,
    mismatches: compared.filter((entry) => entry.differences.length > 0),
  };
}
