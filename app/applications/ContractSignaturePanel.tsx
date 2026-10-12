"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  applicationId: string;
  applicantName: string;
  jobTitle: string;
  branchName: string | null;
  contractStartDate: string;
  contractEndDate: string;
};

type SignedInfo = {
  signatureUrl: string | null;
  signedAt: string | null;
  signedByName: string | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * The branch manager's countersignature on a Contractual hire's employment contract:
 * must scroll the contract text to the end before the canvas signature pad unlocks
 * (ADMIN_MAJOR_PLAN.md §P — "I agree" pattern, decided 2026-10-13).
 */
export default function ContractSignaturePanel({
  applicationId,
  applicantName,
  jobTitle,
  branchName,
  contractStartDate,
  contractEndDate,
}: Props) {
  const [signed, setSigned] = useState<SignedInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/applications/sign-contract?applicationId=${encodeURIComponent(applicationId)}`);
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.signed) {
        setSigned({ signatureUrl: data.signatureUrl, signedAt: data.signedAt, signedByName: data.signedByName });
      } else {
        setSigned(null);
      }
    } catch {
      setSigned(null);
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 8) {
      setScrolledToEnd(true);
    }
  }

  function pointFromEvent(canvas: HTMLCanvasElement, event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(canvas, event);
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !drawingRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const point = pointFromEvent(canvas, event);
    const last = lastPointRef.current;
    if (last) {
      ctx.strokeStyle = "#1c1a16";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    lastPointRef.current = point;
    if (!hasDrawn) setHasDrawn(true);
  }

  function stopDraw() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  async function submitSignature() {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/applications/sign-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, signature: canvas.toDataURL("image/png") }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not save the signature.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the signature.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="mt-6 border border-slate-200 p-6">
        <p className="text-sm text-slate-500">Loading contract…</p>
      </section>
    );
  }

  return (
    <section className="mt-6 border border-slate-200 p-6">
      <h3 className="text-lg font-bold text-slate-900">Employment Contract</h3>
      <p className="mt-1 text-sm text-slate-500">
        {signed
          ? "Countersigned. The employee's own signature is captured separately in the mobile app."
          : "Read the full contract, then sign below. Required before this hire is considered complete."}
      </p>

      {signed ? (
        <div className="mt-5 border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-800">
            Signed by {signed.signedByName ?? "an admin"} on {signed.signedAt ? formatDate(signed.signedAt) : "—"}
          </p>
          {signed.signatureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signed.signatureUrl}
              alt="Manager signature"
              className="mt-3 h-20 border border-green-200 bg-white"
            />
          )}
        </div>
      ) : (
        <>
          <div
            onScroll={handleScroll}
            className="mt-5 h-56 overflow-y-auto border border-slate-300 bg-slate-50 p-4 text-xs leading-6 text-slate-700"
          >
            <p className="font-semibold text-slate-900">EMPLOYMENT CONTRACT</p>
            <p className="mt-3">This Employment Contract is entered into between MR.DIY Philippines and:</p>
            <p className="mt-2">
              <strong>Employee:</strong> {applicantName}
              <br />
              <strong>Position:</strong> {jobTitle}
              <br />
              <strong>Branch:</strong> {branchName ?? "—"}
              <br />
              <strong>Contract period:</strong> {formatDate(contractStartDate)} to {formatDate(contractEndDate)}
            </p>
            <p className="mt-3">
              1. The Employee agrees to perform the duties of the above position at the above branch, under the
              supervision of the branch management, for the duration of this contract.
            </p>
            <p className="mt-3">
              2. Compensation, benefits, work schedule and leave entitlements follow the applicable minimum wage
              order and MR.DIY company policy in effect at the branch.
            </p>
            <p className="mt-3">
              3. This is a fixed-term engagement for the period stated above. Nothing in this contract is intended
              to circumvent the Employee&apos;s security of tenure or regularization rights under the Labor Code of
              the Philippines.
            </p>
            <p className="mt-3">
              4. Either party may raise concerns about this engagement to MR.DIY Human Resources at any time during
              the contract period.
            </p>
            <p className="mt-3">
              5. By signing below, the branch manager confirms this contract has been reviewed and the terms stated
              above are accurate.
            </p>
            <p className="mt-4 font-semibold text-slate-900">— End of contract text —</p>
          </div>

          {!scrolledToEnd && (
            <p className="mt-2 text-xs text-amber-700">Scroll to the end of the contract to unlock the signature pad.</p>
          )}

          <div className={`mt-4 ${scrolledToEnd ? "" : "pointer-events-none opacity-40"}`}>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sign here (mouse or touch)
            </label>
            <canvas
              ref={canvasRef}
              width={500}
              height={160}
              onPointerDown={startDraw}
              onPointerMove={draw}
              onPointerUp={stopDraw}
              onPointerLeave={stopDraw}
              className="w-full touch-none border border-slate-300 bg-white"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!hasDrawn || saving}
                onClick={clearCanvas}
                className="border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-[#e30613] hover:text-[#e30613] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={!hasDrawn || saving || !scrolledToEnd}
                onClick={submitSignature}
                className="bg-[#e30613] px-5 py-2 text-xs font-semibold text-white hover:bg-[#c80511] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Sign & countersign contract"}
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-3 border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</p>
          )}
        </>
      )}
    </section>
  );
}
