import path from "node:path";
import nodemailer from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Emails an applicant from the admin server (SMTP). Needs SMTP_HOST, SMTP_PORT, SMTP_USER and
 * SMTP_PASS in .env.local (SMTP_FROM is optional). Every attempt is saved in public.notification_emails
 * so HR can confirm in the admin whether an email was sent.
 */

export type EmailResult = {
  status: "sent" | "failed" | "invalid" | "not_configured";
  to: string | null;
  error?: string;
};

export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Basic address check before anything is sent: one address, a domain with a dot, no spaces,
 * quotes, commas or line breaks (which could inject extra recipients or headers).
 */
export function isValidEmail(address: string | null | undefined): address is string {
  if (!address) return false;
  const value = address.trim();
  return (
    value.length <= 254 &&
    /^[^\s@<>()",;:\\]+@[^\s@<>()",;:\\]+\.[^\s@<>()",;:\\]{2,}$/.test(value) &&
    !value.includes("..")
  );
}

function createTransporter() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS?.replace(/\s+/g, "") },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });
}

/** Connects and logs in to the SMTP server without sending anything. */
export async function verifyEmailSetup(): Promise<{
  configured: boolean;
  ok: boolean;
  from?: string;
  error?: string;
}> {
  if (!emailConfigured()) return { configured: false, ok: false };
  try {
    await createTransporter().verify();
    return { configured: true, ok: true, from: process.env.SMTP_USER };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      error: error instanceof Error ? error.message : "Could not connect to the mail server.",
    };
  }
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// MR.DIY brand colours (same as the Android app).
const BRAND = {
  red: "#ED1C24",
  yellow: "#FFD400",
  ink: "#1B1B1B",
  muted: "#6B6B63",
  page: "#FAF8F0",
  border: "#DDD9CA",
};

export type EmailKind =
  | "pending"
  | "reviewed"
  | "shortlisted"
  | "interview"
  | "hired"
  | "rejected"
  | "on_hold"
  | "info";

const BADGES: Record<EmailKind, { label: string; bg: string; fg: string } | null> = {
  pending: { label: "PENDING", bg: "#FFF3BF", fg: "#7A5B00" },
  reviewed: { label: "UNDER REVIEW", bg: "#DCE9FF", fg: "#1D4ED8" },
  shortlisted: { label: "SHORTLISTED", bg: "#EADCFF", fg: "#6D28D9" },
  interview: { label: "INTERVIEW", bg: "#E0E7FF", fg: "#3730A3" },
  hired: { label: "HIRED", bg: "#D9F5E3", fg: "#157A3D" },
  rejected: { label: "NOT SELECTED", bg: "#FBE0E1", fg: "#B4141B" },
  on_hold: { label: "ON HOLD", bg: "#E5E7EB", fg: "#374151" },
  info: null,
};

const LOGO_CID = "mrdiy-logo";

/** The email's HTML: yellow brand header with the logo, red stripe, white card, dark footer. */
export function renderEmailHtml(options: {
  title: string;
  body: string;
  kind?: EmailKind;
  jobTitle?: string | null;
}) {
  const badge = BADGES[options.kind ?? "info"];
  const side = `border-left:1px solid ${BRAND.border};border-right:1px solid ${BRAND.border}`;

  const paragraphs = options.body
    .split(/\n{2,}/)
    .map(
      (part) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${BRAND.ink}">${escapeHtml(part).replace(/\n/g, "<br>")}</p>`
    )
    .join("");

  const position = options.jobTitle
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px"><tr>
<td style="background:${BRAND.page};border-left:4px solid ${BRAND.red};padding:12px 16px">
<div style="font-size:11px;letter-spacing:1px;color:${BRAND.muted};text-transform:uppercase">Position applied</div>
<div style="font-size:16px;font-weight:bold;color:${BRAND.ink};margin-top:2px">${escapeHtml(options.jobTitle)}</div>
</td></tr></table>`
    : "";

  const badgeHtml = badge
    ? `<span style="display:inline-block;background:${badge.bg};color:${badge.fg};font-size:11px;font-weight:bold;letter-spacing:1px;padding:5px 12px;border-radius:12px;margin-bottom:14px">${badge.label}</span>`
    : "";

  return `<!doctype html><html><body style="margin:0;padding:0;background:${BRAND.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.page};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:Arial,Helvetica,sans-serif">
<tr><td align="center" style="background:${BRAND.yellow};padding:22px 16px;border-radius:12px 12px 0 0">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#FFFFFF;border-radius:10px;padding:10px 18px">
<img src="cid:${LOGO_CID}" width="210" alt="MR.D.I.Y." style="display:block;border:0;height:auto">
</td></tr></table>
<div style="margin-top:10px;font-size:11px;letter-spacing:3px;color:${BRAND.ink};font-weight:bold">CAREERS</div>
</td></tr>
<tr><td style="background:${BRAND.red};height:5px;line-height:5px;font-size:0">&nbsp;</td></tr>
<tr><td style="background:#FFFFFF;${side};padding:28px 28px 12px">
${badgeHtml}
<h1 style="margin:0 0 16px;font-size:22px;line-height:28px;color:${BRAND.ink}">${escapeHtml(options.title)}</h1>
${position}
${paragraphs}
</td></tr>
<tr><td style="background:#FFFFFF;${side};padding:0 28px 26px">
<p style="margin:0;font-size:13px;line-height:20px;color:${BRAND.muted}">Open the <strong style="color:${BRAND.red}">MR.D.I.Y. Careers</strong> app to see your application status, notifications and messages from our HR team.</p>
</td></tr>
<tr><td align="center" style="background:${BRAND.ink};color:#CFCFC8;font-size:12px;line-height:18px;padding:18px 16px;border-radius:0 0 12px 12px">
<strong style="color:${BRAND.yellow}">MR.D.I.Y. Philippines</strong><br>
This is an automated message. Please do not reply to this email.
</td></tr>
</table></td></tr></table></body></html>`;
}

export async function sendApplicantEmail(
  supabase: SupabaseClient,
  options: {
    userId: string;
    applicationId: string;
    to: string | null | undefined;
    subject: string;
    body: string;
    /** Big title inside the email; defaults to the subject. */
    heading?: string;
    kind?: EmailKind;
    jobTitle?: string | null;
  }
): Promise<EmailResult> {
  const to = options.to?.trim() || null;

  async function log(status: "sent" | "failed", error?: string) {
    if (!to) return;
    await supabase.from("notification_emails").insert({
      user_id: options.userId,
      application_id: options.applicationId,
      to_email: to,
      subject: options.subject,
      status,
      error: error ?? null,
    });
  }

  if (!to) {
    return { status: "invalid", to: null, error: "The applicant has no email address on their profile." };
  }

  if (!isValidEmail(to)) {
    await log("failed", "Invalid email address");
    return { status: "invalid", to, error: "That is not a valid email address." };
  }

  if (!emailConfigured()) return { status: "not_configured", to };

  try {
    const info = await createTransporter().sendMail({
      from: process.env.SMTP_FROM ?? `MR.DIY Careers <${process.env.SMTP_USER}>`,
      to,
      subject: options.subject,
      text: options.body,
      html: renderEmailHtml({
        title: options.heading ?? options.subject,
        body: options.body,
        kind: options.kind,
        jobTitle: options.jobTitle,
      }),
      attachments: [
        {
          filename: "mrdiy-logo.png",
          path: path.join(process.cwd(), "public", "email-logo.png"),
          cid: LOGO_CID, // shown inline in the header, not as a download
        },
      ],
    });

    // The SMTP server must accept the recipient; this confirms hand-off, not inbox delivery.
    if (!info.accepted.map(String).includes(to)) {
      throw new Error("The mail server did not accept the recipient address.");
    }

    await log("sent");
    return { status: "sent", to };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error";
    await log("failed", message);
    return { status: "failed", to, error: message };
  }
}
