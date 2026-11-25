import { NextResponse, type NextRequest } from "next/server";
import { APP, onSite, PATH_HEADER } from "@/lib/app";
import { REFRESH_COOKIE, TOKEN_COOKIE } from "@/lib/laravel";
import { forgetSignIn, keepSignIn, refreshSignIn, signedOutReason } from "@/lib/session-cookies";

/**
 * Before every dashboard page and API call: keep the sign-in going.
 *
 * The access token lasts 15 minutes, and its cookie a minute less. When it has gone and
 * the refresh cookie is there, the refresh token is swapped for a new pair here, before
 * the page or call goes ahead, and the request is passed on with the new access token
 * in it. That is what keeps someone who is working signed in; pages and server actions
 * can't set cookies themselves.
 *
 * When Laravel says the sign-in is over (unused too long, past its limit, or signed out
 * elsewhere), both cookies go and a page is sent to /sign-in, saying why.
 *
 * It is not an authorization check: Laravel checks the token on every request, and
 * protected pages still call `requireSession()` from `lib/session.ts`.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // The staff's admin app has no home page of its own: it is the dashboard.
  if (pathname === "/") return APP === "admin" ? NextResponse.redirect(new URL("/dashboard", request.url)) : NextResponse.next();
  // The site has no dashboard: a link to one (an older email, a bookmark) goes to the customer area.
  if (APP === "site" && (pathname === "/dashboard" || pathname.startsWith("/dashboard/"))) {
    return NextResponse.redirect(new URL(onSite(pathname) + request.nextUrl.search, request.url));
  }
  const page = pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/account" || pathname.startsWith("/account/");
  // Which page this is, for the dashboard's layout: a customer in the admin is kept to their own account.
  if (page) request.headers.set(PATH_HEADER, pathname);
  // What never carries a token: a site's public data, and stored files.
  if (!page && (pathname.startsWith("/api/public/") || pathname.startsWith("/api/_nevela/files/"))) return NextResponse.next();

  const signedIn = Boolean(request.cookies.get(TOKEN_COOKIE)?.value);
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  if (signedIn) return NextResponse.next({ request: { headers: request.headers } });
  if (!refresh) return page ? toSignIn(request) : NextResponse.next();

  const result = await refreshSignIn(refresh, request.headers);
  if (result.ok) {
    // The new access token for this request, and both cookies for the browser.
    request.cookies.set(TOKEN_COOKIE, String(result.body.token));
    if (typeof result.body.refreshToken === "string") request.cookies.set(REFRESH_COOKIE, result.body.refreshToken);
    const response = NextResponse.next({ request: { headers: request.headers } });
    keepSignIn(response.cookies, result.body);
    return response;
  }
  // Laravel couldn't be asked: nothing is decided, and the page says what it can.
  if (!result.ended) return NextResponse.next();

  request.cookies.delete(REFRESH_COOKIE);
  const response = page ? toSignIn(request, signedOutReason(result.code)) : NextResponse.next({ request: { headers: request.headers } });
  forgetSignIn(response.cookies);
  return response;
}

function toSignIn(request: NextRequest, reason?: string) {
  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  if (reason) signIn.searchParams.set("reason", reason);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/account/:path*", "/api/:path*"],
};
