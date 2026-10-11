import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdminSession";

export async function GET(request: NextRequest) {
  const session = requireAdminSession(request);

  if (!session) {
    return NextResponse.json({ session: null }, { status: 401 });
  }

  return NextResponse.json({ session });
}
