import { createSign } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sends a phone notification (Firebase Cloud Messaging) so it shows in the tray even when the
 * app is closed. Needs FIREBASE_SERVICE_ACCOUNT_JSON in .env.local (Firebase Console, Project
 * settings, Service accounts, Generate new private key). Without it every call is a no-op.
 */

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type PushMessage = { userId: string; title: string; body: string; data?: Record<string, string> };

// Data-only message: the app builds the tray notification itself, so it also knows which alert
// was already shown and does not show it a second time from its own check.

let cachedToken: { value: string; expiresAt: number } | null = null;

function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const account = JSON.parse(raw) as ServiceAccount;
    return account.project_id && account.client_email && account.private_key ? account : null;
  } catch {
    return null;
  }
}

export function pushConfigured() {
  return readServiceAccount() !== null;
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function accessToken(account: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    })
  )}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(account.private_key.replace(/\\n/g, "\n"));

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64Url(signature)}`,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error("Firebase authorization failed");

  cachedToken = { value: result.access_token, expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

/**
 * Pushes each message to every phone registered for that user. Best effort: never throws, and
 * removes tokens that Firebase reports as no longer valid.
 */
export async function sendPush(supabase: SupabaseClient, messages: PushMessage[]) {
  const account = readServiceAccount();
  if (!account || messages.length === 0) return { sent: 0, skipped: true };

  try {
    const userIds = [...new Set(messages.map((message) => message.userId))];
    const { data: rows } = await supabase
      .from("push_tokens")
      .select("token, user_id")
      .in("user_id", userIds);

    const tokensByUser = new Map<string, string[]>();
    (rows ?? []).forEach((row) => {
      tokensByUser.set(row.user_id, [...(tokensByUser.get(row.user_id) ?? []), row.token]);
    });

    const jobs = messages.flatMap((message) =>
      (tokensByUser.get(message.userId) ?? []).map((token) => ({ token, message }))
    );
    if (jobs.length === 0) return { sent: 0, skipped: false };

    const bearer = await accessToken(account);
    const dead: string[] = [];
    let sent = 0;

    for (let start = 0; start < jobs.length; start += 20) {
      await Promise.all(
        jobs.slice(start, start + 20).map(async ({ token, message }) => {
          const response = await fetch(
            `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                message: {
                  token,
                  data: {
                    title: message.title,
                    body: message.body,
                    open_alerts: "true",
                    ...(message.data ?? {}),
                  },
                  android: { priority: "HIGH" },
                },
              }),
            }
          );
          if (response.ok) {
            sent += 1;
          } else if (response.status === 404) {
            // UNREGISTERED: the app was uninstalled or the token expired.
            dead.push(token);
          }
        })
      );
    }

    if (dead.length > 0) await supabase.from("push_tokens").delete().in("token", dead);
    return { sent, skipped: false };
  } catch {
    return { sent: 0, skipped: false };
  }
}
