"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Note = {
  id: string;
  body: string;
  created_at: string;
  author: { id: string; full_name: string | null; username: string } | null;
};

type Props = {
  applicationId: string;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Internal notes and tags — never shown to the applicant. */
export default function NotesPanel({ applicationId, tags, onTagsChange }: Props) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [text, setText] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/applications/notes?applicationId=${encodeURIComponent(applicationId)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not load notes.");
      setNotes(data.notes ?? []);
    } catch {
      setNotes([]);
    }
  }, [applicationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/applications/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, text }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not save the note.");

      setText("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the note.");
    } finally {
      setSaving(false);
    }
  }

  async function addTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = tagInput.trim();
    if (!value || tags.includes(value)) {
      setTagInput("");
      return;
    }
    const next = [...tags, value];
    setTagInput("");
    await saveTags(next);
  }

  async function removeTag(tag: string) {
    await saveTags(tags.filter((t) => t !== tag));
  }

  async function saveTags(next: string[]) {
    onTagsChange(next);
    await fetch("/api/applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: applicationId, tags: next }),
    });
  }

  return (
    <section className="mt-6 border border-slate-200 p-6">
      <h3 className="text-lg font-bold text-slate-900">Internal Notes &amp; Tags</h3>
      <p className="mt-1 text-sm text-slate-500">Visible to HR only — the applicant never sees this.</p>

      {/* TAGS */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700"
          >
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="text-slate-400 hover:text-red-600">
              ×
            </button>
          </span>
        ))}
        <form onSubmit={addTag} className="flex items-center gap-1">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Add tag…"
            className="border border-slate-300 px-2.5 py-1 text-xs outline-none focus:border-[#e30613]"
          />
        </form>
      </div>

      {/* NOTE INPUT */}
      <form onSubmit={submitNote} className="mt-5 flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add an internal note…"
          className="flex-1 border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#e30613]"
        />
        <button
          type="submit"
          disabled={saving || !text.trim()}
          className="bg-[#e30613] px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {error && <p className="mt-3 border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</p>}

      {notes && notes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
              <p className="text-slate-700">{note.body}</p>
              <p className="mt-1 text-[10px] text-slate-400">
                {note.author?.full_name || note.author?.username || "Admin"} · {formatWhen(note.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
