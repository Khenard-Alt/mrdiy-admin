import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS entirely. Only import this from
// server-side code (API route handlers), never from "use client" files.
// Access must be gated by verifySessionCookie() before this is used.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
