// Proxy (Next 16's renamed middleware): the /admin page is owner-only.
// Everything else stays publicly readable. This is a first gate only —
// every server action that writes ALSO checks the session server-side
// (see requireOwner in src/lib/auth.ts), so a bypassed proxy still
// cannot mutate anything.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", "/admin");
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
