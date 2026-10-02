import { NextResponse, type NextRequest } from "next/server";
import { TOKEN_COOKIE } from "@/lib/laravel";

/**
 * Session middleware: an optimistic, cookie-only check that sends signed-out
 * visitors to /sign-in before rendering. It does not ask Laravel, so it is NOT an
 * authorization check: protected pages still call `requireSession()` from
 * `lib/session.ts`, and Laravel checks the token on every request.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.get(TOKEN_COOKIE)?.value) return NextResponse.next();

  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
