"use client";

import { useCallback, useEffect, useState } from "react";

type Item = {
  id: string;
  item_name: string;
  status: "Pending" | "Returned" | "Verified" | "Missing";
  remarks: string | null;
  updated_at: string;
};

const STATUS_STYLE: Record<Item["status"], string> = {
  Pending: "border-slate-200 bg-slate-50 text-slate-600",
  Returned: "border-blue-200 bg-blue-50 text-blue-700",
  Verified: "border-green-200 bg-green-50 text-green-700",
  Missing: "border-red-200 bg-red-50 text-red-700",
};

const STATUS_TEXT: Record<Item["status"], string> = {
  Pending: "Not returned yet",
  Returned: "Waiting for verification",
  Verified: "Verified",
  Missing: "Missing",
};

/** Company property returned by a resigned employee: mark it returned, verify it, or flag it missing. */
export default function ExitChecklistPanel({
  applicationId,
  onCleared,
}: {
  applicationId: string;
  onCleared: () => void;
}) {
  const [rows, setRows] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/exit-checklist?applicationId=${encodeURIComponent(applicationId)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not load the exit checklist.");
      setRows(data.items ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the exit checklist.");
      setRows([]);
    }
  }, [applicationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function act(item: Item, action: "returned" | "verify" | "missing") {
    let remarks = "";
    if (action === "missing") {
      remarks = window.prompt(`Why is the ${item.item_name} missing?`) ?? "";
      if (!remarks.trim()) return;
    }

    setBusy(item.id);
    setError("");
    try {
      const response = await fetch("/api/exit-checklist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, action, remarks }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not update the item.");
      if (data.allCleared) onCleared();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the item.");
    } finally {
      setBusy("");
    }
  }

  if (rows !== null && rows.length === 0 && !error) return null;

  const verified = (rows ?? []).filter((r) => r.status === "Verified").length;
  const total = (rows ?? []).length;

  return (
    <section className="mt-6 border border-slate-200 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Exit Checklist</h3>
          <p className="mt-1 text-sm text-slate-500">Company property to confirm returned before clearance is complete.</p>
        </div>
        {total > 0 && (
          <span className="border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
            {verified} of {total} verified
          </span>
        )}
      </div>

      {rows === null && <p className="mt-4 text-sm text-slate-500">Loading…</p>}
      {error && <p className="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</p>}

      <ul className="mt-5 divide-y divide-slate-100 border border-slate-200">
        {(rows ?? []).map((item) => (
          <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{item.item_name}</p>
              {item.status === "Missing" && item.remarks && (
                <p className="mt-1 text-xs text-red-600">Missing: {item.remarks}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[item.status]}`}>
                {STATUS_TEXT[item.status]}
              </span>
              {item.status === "Pending" && (
                <button
                  type="button"
                  disabled={busy === item.id}
                  onClick={() => act(item, "returned")}
                  className="border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                >
                  Mark returned
                </button>
              )}
              {item.status === "Returned" && (
                <button
                  type="button"
                  disabled={busy === item.id}
                  onClick={() => act(item, "verify")}
                  className="border border-green-300 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
                >
                  Verify
                </button>
              )}
              {item.status !== "Verified" && item.status !== "Missing" && (
                <button
                  type="button"
                  disabled={busy === item.id}
                  onClick={() => act(item, "missing")}
                  className="border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Flag missing
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
