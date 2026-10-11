import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The formatted biodata sheet of an applicant (one A4 page, more if needed), built from the
 * profile they filled in the app. HR downloads it as a PDF to print or file.
 * Answers the panel's request for a formatted biodata of the client.
 */

export type BiodataInput = {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  desiredPosition: string;
  yearsExperience: string;
  headline: string;
  about: string;
  skills: string[];
  education: { degree: string; school: string; year: string }[];
  experience: { role: string; company: string; period: string; description: string }[];
  photo: Uint8Array | null; // JPEG bytes
  application: {
    jobTitle: string;
    jobLocation: string;
    appliedOn: string;
    status: string;
    matchScore: number | null;
    resumeName: string;
  };
};

const RED = rgb(0.929, 0.11, 0.141);
const YELLOW = rgb(1, 0.831, 0);
const INK = rgb(0.106, 0.106, 0.106);
const MUTED = rgb(0.42, 0.42, 0.39);
const LINE = rgb(0.867, 0.851, 0.792);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;

/** The built-in PDF fonts only cover Latin-1; swap anything else so a name never breaks the file. */
function clean(text: string | null | undefined) {
  return (text ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/•/g, "-")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E -ÿ]/g, "?")
    .trim();
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(attempt, size) <= maxWidth) {
      line = attempt;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildBiodataPdf(input: BiodataInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const contentWidth = PAGE_W - MARGIN * 2;

  function newPageIfNeeded(needed: number) {
    if (y - needed < MARGIN + 30) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  }

  function section(title: string) {
    newPageIfNeeded(40);
    y -= 14;
    page.drawRectangle({ x: MARGIN, y: y - 3, width: 4, height: 15, color: RED });
    page.drawText(clean(title).toUpperCase(), { x: MARGIN + 10, y, size: 10.5, font: bold, color: INK });
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.7, color: LINE });
    y -= 14;
  }

  function paragraph(text: string, size = 10, indent = 0, color = INK, font = regular) {
    for (const line of wrap(text, font, size, contentWidth - indent)) {
      newPageIfNeeded(size + 4);
      page.drawText(line, { x: MARGIN + indent, y, size, font, color });
      y -= size + 4;
    }
  }

  /** "Label: value" rows in two columns. */
  function fields(rows: [string, string][]) {
    const colWidth = contentWidth / 2 - 8;
    for (let i = 0; i < rows.length; i += 2) {
      const pair = rows.slice(i, i + 2);
      const heights = pair.map(([, value]) => wrap(value || "-", regular, 10, colWidth).length);
      const rowHeight = 11 + Math.max(...heights) * 14;
      newPageIfNeeded(rowHeight);
      pair.forEach(([label, value], column) => {
        const x = MARGIN + column * (colWidth + 16);
        page.drawText(clean(label).toUpperCase(), { x, y, size: 7.5, font: bold, color: MUTED });
        wrap(value || "-", regular, 10, colWidth).forEach((line, index) => {
          page.drawText(line, { x, y: y - 12 - index * 14, size: 10, font: regular, color: INK });
        });
      });
      y -= rowHeight + 4;
    }
  }

  // ---------------------------------------------------------------- header
  page.drawRectangle({ x: 0, y: PAGE_H - 96, width: PAGE_W, height: 96, color: YELLOW });
  page.drawRectangle({ x: 0, y: PAGE_H - 101, width: PAGE_W, height: 5, color: RED });

  try {
    const logoBytes = await readFile(path.join(process.cwd(), "public", "email-logo.png"));
    const logo = await pdf.embedPng(logoBytes);
    const logoWidth = 140;
    const logoHeight = (logo.height / logo.width) * logoWidth;
    page.drawRectangle({ x: MARGIN, y: PAGE_H - 78, width: logoWidth + 20, height: logoHeight + 14, color: rgb(1, 1, 1) });
    page.drawImage(logo, { x: MARGIN + 10, y: PAGE_H - 71, width: logoWidth, height: logoHeight });
  } catch {
    page.drawText("MR.D.I.Y.", { x: MARGIN, y: PAGE_H - 60, size: 24, font: bold, color: RED });
  }

  page.drawText("APPLICANT BIODATA", { x: PAGE_W - MARGIN - 190, y: PAGE_H - 50, size: 17, font: bold, color: INK });
  page.drawText("MR.D.I.Y. Careers", { x: PAGE_W - MARGIN - 190, y: PAGE_H - 68, size: 10, font: regular, color: INK });

  y = PAGE_H - 101 - 24;

  // ---------------------------------------------------- name block and photo
  const photoSize = 92;
  const topOfBlock = y;
  if (input.photo) {
    try {
      const image = await pdf.embedJpg(input.photo);
      page.drawImage(image, { x: PAGE_W - MARGIN - photoSize, y: y - photoSize, width: photoSize, height: photoSize });
    } catch {
      page.drawRectangle({ x: PAGE_W - MARGIN - photoSize, y: y - photoSize, width: photoSize, height: photoSize, borderColor: LINE, borderWidth: 1 });
    }
  } else {
    page.drawRectangle({ x: PAGE_W - MARGIN - photoSize, y: y - photoSize, width: photoSize, height: photoSize, borderColor: LINE, borderWidth: 1 });
    page.drawText("1x1 PHOTO", { x: PAGE_W - MARGIN - photoSize + 20, y: y - photoSize / 2, size: 8, font: regular, color: MUTED });
  }

  page.drawText(clean(input.fullName) || "Name not provided", { x: MARGIN, y: y - 14, size: 20, font: bold, color: INK });
  y -= 36;
  const subtitle = clean(input.headline) || clean(input.desiredPosition);
  if (subtitle) {
    for (const line of wrap(subtitle, regular, 11, contentWidth - photoSize - 20).slice(0, 2)) {
      page.drawText(line, { x: MARGIN, y, size: 11, font: regular, color: MUTED });
      y -= 15;
    }
  }
  y = Math.min(y, topOfBlock - photoSize) - 6;

  // ------------------------------------------------------- personal details
  section("Personal information");
  fields([
    ["Email", input.email],
    ["Mobile number", input.phone],
    ["Address / Location", input.address],
    ["Position desired", input.desiredPosition],
    ["Years of experience", input.yearsExperience],
  ]);

  if (clean(input.about)) {
    section("Professional summary");
    paragraph(input.about);
  }

  section("Education");
  if (input.education.length === 0) paragraph("No education listed.", 10, 0, MUTED);
  for (const item of input.education) {
    paragraph(clean(item.degree) || "Course not specified", 10.5, 0, INK, bold);
    paragraph([item.school, item.year].map(clean).filter(Boolean).join("  |  ") || "-", 9.5, 0, MUTED);
    y -= 3;
  }

  section("Work experience");
  if (input.experience.length === 0) paragraph("No work experience listed.", 10, 0, MUTED);
  for (const item of input.experience) {
    paragraph(clean(item.role) || "Role not specified", 10.5, 0, INK, bold);
    paragraph([item.company, item.period].map(clean).filter(Boolean).join("  |  ") || "-", 9.5, 0, MUTED);
    if (clean(item.description)) paragraph(item.description, 9.5, 8);
    y -= 3;
  }

  section("Skills");
  paragraph(input.skills.map(clean).filter(Boolean).join(", ") || "No skills listed.", 10, 0, input.skills.length ? INK : MUTED);

  section("Application details");
  fields([
    ["Position applied", input.application.jobTitle],
    ["Branch / Location", input.application.jobLocation],
    ["Date applied", input.application.appliedOn],
    ["Current status", input.application.status],
    ["Match score", input.application.matchScore === null ? "-" : `${input.application.matchScore}%`],
    ["Resume on file", input.application.resumeName || "-"],
  ]);

  // ---------------------------------------------------------- signatures
  // Signature lines sit near the bottom of the last page; start a new page only if the content reaches them.
  if (y < 98) page = pdf.addPage([PAGE_W, PAGE_H]);
  y = 66;
  const half = contentWidth / 2 - 20;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + half, y }, thickness: 0.8, color: INK });
  page.drawLine({ start: { x: PAGE_W - MARGIN - half, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.8, color: INK });
  page.drawText("Applicant's signature / date", { x: MARGIN, y: y - 12, size: 8.5, font: regular, color: MUTED });
  page.drawText("Reviewed by (HR) / date", { x: PAGE_W - MARGIN - half, y: y - 12, size: 8.5, font: regular, color: MUTED });

  // ------------------------------------------------------------- footers
  const generated = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long", timeStyle: "short" });
  pdf.getPages().forEach((p, index, all) => {
    p.drawText(`Generated by MR.DIY Careers on ${clean(generated)}`, { x: MARGIN, y: 22, size: 8, font: regular, color: MUTED });
    const label = `Page ${index + 1} of ${all.length}`;
    p.drawText(label, { x: PAGE_W - MARGIN - regular.widthOfTextAtSize(label, 8), y: 22, size: 8, font: regular, color: MUTED });
  });

  return pdf.save();
}
