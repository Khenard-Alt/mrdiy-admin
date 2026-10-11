import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export type AdminRole = "super_admin" | "hr_officer" | "branch_manager";

type SessionPayload = {
  id: string;
  username: string;
  fullName: string;
  role: AdminRole;
  branchId: string | null;
  exp: number;
};

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value) {
    throw new Error("ADMIN_SESSION_SECRET is not configured.");
  }
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionCookie(data: Omit<SessionPayload, "exp">) {
  const payload: SessionPayload = { ...data, exp: Date.now() + SESSION_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function verifySessionCookie(cookieValue: string | undefined | null): SessionPayload | null {
  if (!cookieValue) return null;

  const [encoded, signature] = cookieValue.split(".");
  if (!encoded || !signature) return null;

  const expectedSignature = sign(encoded);

  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hasRole(session: SessionPayload | null, ...roles: AdminRole[]): boolean {
  return session !== null && roles.includes(session.role);
}

export { COOKIE_NAME };
export type { SessionPayload };
