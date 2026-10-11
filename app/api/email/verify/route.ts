import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { verifyEmailSetup } from "@/lib/email";

/** Checks that the SMTP settings work (connects and logs in) without sending an email. */
export async function GET(request: NextRequest) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await verifyEmailSetup());
}
