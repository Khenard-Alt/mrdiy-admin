import { NextRequest } from "next/server";
import { verifySessionCookie, COOKIE_NAME } from "@/lib/adminSession";

export function requireAdminSession(request: NextRequest) {
  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  return verifySessionCookie(cookieValue);
}
