"use client";

import { useCallback, useEffect, useState } from "react";

type DocStatus = "Pending" | "Uploaded" | "Verified" | "Rejected";

type Document = {
  id: string | null;
  document_name: string;
  status: DocStatus;
  document_url: string | null;
  remarks: string | null;
  fileUrl: string | null;
  updated_at: string | null;
};

const STATUS_STYLE: Record<DocStatus, string> = {
  Pending: "border-slate-200 bg-slate-50 text-slate-500",
  Uploaded: "border-blue-200 bg-blue-50 text-blue-700",
  Verified: "border-green-200 bg-green-50 text-green-700",
  Rejected: "border-red-200 bg-red-50 text-red-700",
};

const STATUS_TEXT: Record<DocStatus, string> = {
  Pending: "Not submitted",
  Uploaded: "Waiting for HR",
  Verified: "Verified",
  Rejected: "Returned",
};

/**
 * The applicant's profile-level documents (Valid ID + pre-employment doc types):
 * optional, uploaded any time from their profile, not tied to this one application.
 * Shown regardless of the application's stage, so HR can see what's already ready
 * to go the moment someone applies.
 */
export default function ProfileDocumentsPanel({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Document[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/applicant-documents?userId=${encodeURIComponent(userId)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not load the documents.");
      setRows(data.documents ?? []);
      setError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load the documents.";
      setError(
        message.includes("schema cache")
          ? "The applicant documents table is not set up yet. Run 202610120010_profile_documents.sql in the Supabase SQL Editor."
          : message
      );
      setRows([]);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function review(row: Document, action: "verify" | "reject") {
    if (!row.id) return;

    let remarks = "";
    if (action === "reject") {
      remarks = window.prompt(`What is wrong with the ${row.document_name}? The applicant will see this.`) ?? "";
      if (!remarks.trim()) return;
    }

    setBusy(row.id);
    setError("");
    try {
      const response = await fetch("/api/applicant-documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, action, remarks }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not update the document.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the document.");
    } finally {
      setBusy("");
    }
  }

  const verified = (rows ?? []).filter((row) => row.status === "Verified").length;
  const submitted = (rows ?? []).filter((row) => row.document_url).length;
  const total = (rows ?? []).length;

  return (
    <section className="mt-6 border border-slate-200 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Applicant documents (ID &amp; requirements)</h3>
          <p className="mt-1 text-sm text-slate-500">
            Uploaded from the applicant&apos;s profile — not required to apply. Check readiness and verify, or send
            back with a reason.
          </p>
        </div>
        {total > 0 && (
          <span className="border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
            {verified} verified · {submitted} submitted of {total}
          </span>
        )}
      </div>

      {rows === null && <p className="mt-4 text-sm text-slate-500">Loading…</p>}
      {error && <p className="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</p>}

      <ul className="mt-5 divide-y divide-slate-100 border border-slate-200">
        {(rows ?? []).map((row) => (
          <li key={row.document_name} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{row.document_name}</p>
              {row.status === "Rejected" && row.remarks && (
                <p className="mt-1 text-xs text-red-600">Returned: {row.remarks}</p>
              )}
              {row.fileUrl && (
                <a
                  href={row.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs font-semibold text-[#e30613] underline"
                >
                  View uploaded document
                </a>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[row.status]}`}>
                {STATUS_TEXT[row.status]}
              </span>
              {row.document_url && row.status !== "Verified" && (
                <>
                  <button
                    type="button"
                    disabled={busy === row.id}
                    onClick={() => review(row, "verify")}
                    className="border border-green-300 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
                  >
                    Verify
                  </button>
                  <button
                    type="button"
                    disabled={busy === row.id}
                    onClick={() => review(row, "reject")}
                    className="border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Send back
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
