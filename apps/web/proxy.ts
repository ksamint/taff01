import { type NextRequest, NextResponse } from "next/server";
import { readServerMe } from "./src/lib/server-me";

export async function proxy(request: NextRequest) {
  // Check before the app shell streams, so a denied admin route keeps HTTP 404.
  const me = await readServerMe(
    request.headers.get("cookie") ?? "",
    process.env.API_INTERNAL_URL,
  );
  if (!me?.user.systemAdmin)
    return NextResponse.rewrite(new URL("/404", request.url), { status: 404 });
  return NextResponse.next();
}
export const config = { matcher: ["/admin", "/admin/access"] };
