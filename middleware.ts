import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookie, COOKIE_NAME } from "@/lib/adminSession";

export const runtime = "nodejs";

const PROTECTED_PATHS = ["/dashboard", "/jobs", "/applications", "/messages", "/accounts", "/analytics"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const session = verifySessionCookie(request.cookies.get(COOKIE_NAME)?.value);

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/jobs/:path*",
    "/applications/:path*",
    "/messages/:path*",
    "/accounts/:path*",
    "/analytics/:path*",
  ],
};
