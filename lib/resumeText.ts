import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ResumeKind = "pdf" | "docx" | "text";

export type ResumeContent = {
  text: string;
  kind: ResumeKind | null;
  error: string | null;
};

function detectKind(bytes: Uint8Array): ResumeKind {
  const head = String.fromCharCode(...bytes.slice(0, 5));
  if (head === "%PDF-") return "pdf";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "docx";
  return "text";
}

async function extract(bytes: Uint8Array, kind: ResumeKind): Promise<string> {
  if (kind === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }

  if (kind === "docx") {
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")?.async("string");
    if (!xml) return "";
    return xml
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  return new TextDecoder().decode(bytes);
}

// Reading a PDF is slow and a resume file never changes (a new upload gets a new path), so keep results for a while.
const cache = new Map<string, { at: number; content: ResumeContent }>();
const CACHE_MS = 10 * 60 * 1000;

/** The text of a resume in the private `resumes` bucket. Never throws; failures come back in `error`. */
export async function getResumeText(supabase: SupabaseClient, path: string | null): Promise<ResumeContent> {
  if (!path || path.startsWith("http")) return { text: "", kind: null, error: null };

  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.content;

  let content: ResumeContent;
  try {
    const { data: file, error } = await supabase.storage.from("resumes").download(path);
    if (error || !file) throw new Error(error?.message ?? "Download failed");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = detectKind(bytes);
    content = { text: (await extract(bytes, kind)).trim(), kind, error: null };
  } catch (error) {
    content = { text: "", kind: null, error: error instanceof Error ? error.message : "Could not read the resume." };
  }

  if (!content.error) cache.set(path, { at: Date.now(), content });
  return content;
}
