import { McpView } from "../../../src/components/mcp-view";

/** The public origin clients connect to: AUTH_URL, read per request. */
function publicOrigin() {
  try {
    return process.env.AUTH_URL
      ? new URL(process.env.AUTH_URL).origin
      : undefined;
  } catch {
    return undefined;
  }
}

export default function Page() {
  return <McpView origin={publicOrigin()} />;
}
