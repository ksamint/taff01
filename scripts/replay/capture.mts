import {
  type Auth,
  captureSafe,
  type Json,
  localUrl,
  mcpMethods,
  mcpProtocol,
  mcpTools,
  projectResponse,
  type Recipe,
  recipes,
  responseBody,
  restRoutes,
} from "./wire.mts";

export type Observation = {
  version: 1;
  route: string;
  status: number;
  mcp?: { method: string; tool?: string };
} & ({ recipe: Recipe; body: Json } | { skip: string });

type Protocol = { method: string; tool?: string; modernCatalog: boolean };
async function protocol(request: Request): Promise<Protocol | undefined> {
  const input = (await responseBody(request).catch(() => null)) as {
    method?: unknown;
    params?: { name?: unknown };
  } | null;
  if (typeof input?.method !== "string" || !mcpMethods.has(input.method))
    return;
  const tool = input.params?.name;
  return {
    method: input.method,
    ...(input.method === "tools/call" &&
    typeof tool === "string" &&
    mcpTools.has(tool)
      ? { tool }
      : {}),
    modernCatalog:
      input.method === "tools/list" &&
      request.headers.get("mcp-protocol-version") === mcpProtocol &&
      request.headers.get("mcp-method") === "tools/list",
  };
}

const recipeNames = Object.keys(recipes) as Recipe[];
const methods = new Set([
  "GET",
  "POST",
  "PATCH",
  "PUT",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);
export function createObserver(append: (entry: Observation) => void) {
  return (request: Request) => {
    let url: URL;
    try {
      url = localUrl(request.url);
    } catch {
      return;
    }
    const isMcp = url.pathname === "/mcp";
    const method = methods.has(request.method) ? request.method : "OTHER";
    const rpc =
      isMcp && method === "POST" ? protocol(request.clone()) : undefined;
    const auth: Auth = request.headers
      .get("authorization")
      ?.startsWith("Bearer ")
      ? "bearer"
      : /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/.test(
            request.headers.get("cookie") ?? "",
          )
        ? "session"
        : "public";
    return async (registeredPath: string | undefined, response: Response) => {
      const candidate = `${method} ${registeredPath}`;
      const route = isMcp
        ? `${method} /mcp`
        : restRoutes.has(candidate)
          ? candidate
          : "unregistered";
      const mcp = await rpc;
      const meta = {
        version: 1 as const,
        route,
        status: response.status,
        ...(mcp && {
          mcp: { method: mcp.method, ...(mcp.tool && { tool: mcp.tool }) },
        }),
      };
      const recipe = recipeNames.find(
        (name) =>
          recipes[name].route === route &&
          recipes[name].auth === auth &&
          (name !== "mcpCatalog" || mcp?.modernCatalog),
      );
      if (!recipe || url.search) {
        append({
          ...meta,
          skip: isMcp
            ? "unmapped MCP fixture or protocol"
            : "unmapped REST fixture or request",
        });
        return;
      }
      const projected = await projectResponse(recipe, response.clone()).then(
        (body) => ({ body }),
        () => null,
      );
      if (!projected || !captureSafe(projected.body)) {
        append({ ...meta, skip: "response outside safe replay schema" });
        return;
      }
      append({ ...meta, recipe, body: projected.body });
    };
  };
}
