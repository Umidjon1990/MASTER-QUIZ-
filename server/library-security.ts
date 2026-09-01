import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

const DEFAULT_MAX_PDF_MB = 25;
const HARD_MAX_PDF_MB = 50;

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

export const MAX_PDF_MB = boundedInteger(process.env.LIBRARY_MAX_PDF_MB, DEFAULT_MAX_PDF_MB, 1, HARD_MAX_PDF_MB);
export const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;
export const MAX_PDF_PAGES = boundedInteger(process.env.LIBRARY_MAX_PAGES, 1500, 1, 2500);

export function forbiddenPdfFeature(content: Buffer): string | null {
  const source = content.toString("latin1");
  const checks: Array<[RegExp, string]> = [
    [/\/JavaScript\b|\/JS\s*\(/i, "JavaScript"],
    [/\/Launch\b/i, "external launch action"],
    [/\/EmbeddedFile\b/i, "embedded file"],
    [/\/OpenAction\b|\/AA\b/i, "automatic action"],
  ];
  return checks.find(([pattern]) => pattern.test(source))?.[1] || null;
}

export type ByteRange = { start: number; end: number };

export function parseSingleByteRange(value: string, totalSize: number): ByteRange | null {
  if (!Number.isSafeInteger(totalSize) || totalSize <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, totalSize - suffixLength), end: totalSize - 1 };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : totalSize - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || requestedEnd < start || start >= totalSize) return null;
  return { start, end: Math.min(requestedEnd, totalSize - 1) };
}

function safeWinAnsi(value: string): string {
  return value.normalize("NFKD").replace(/[^\x20-\x7E]/g, "").slice(0, 100) || "Teacher";
}

export type WatermarkIdentity = {
  teacherName: string;
  teacherId: string;
  sessionId: string;
  openedAt: Date;
  title?: string;
};

export function watermarkLines(identity: WatermarkIdentity) {
  const opened = identity.openedAt.toISOString().replace("T", " ").slice(0, 16);
  const teacherCode = `T-${identity.teacherId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const sessionCode = identity.sessionId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return {
    identityLine: safeWinAnsi(`${identity.teacherName} | ${teacherCode}`),
    traceLine: `${opened.slice(0, 10)} | SESSION:${sessionCode}`,
    usageLine: "FAQAT DARS UCHUN | NUSXA TARQATISH TAQIQLANADI",
  };
}

export async function createWatermarkedPdf(source: Buffer, identity: WatermarkIdentity): Promise<Buffer> {
  const document = await PDFDocument.load(source, { updateMetadata: false });
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  const { identityLine, traceLine, usageLine } = watermarkLines(identity);

  for (const page of document.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.max(9, Math.min(13, width / 40));
    for (let y = 25; y < height; y += Math.max(125, height / 4.5)) {
      page.drawText(identityLine, {
        x: 10, y, size, font, color: rgb(0.58, 0.08, 0.12), opacity: 0.18, rotate: degrees(32),
      });
      page.drawText(traceLine, {
        x: Math.max(10, width * 0.08), y: y + 30, size: Math.max(8, size - 1), font,
        color: rgb(0.58, 0.08, 0.12), opacity: 0.16, rotate: degrees(32),
      });
      page.drawText(usageLine, {
        x: Math.max(10, width * 0.12), y: y + 60, size: Math.max(8, size - 1), font,
        color: rgb(0.58, 0.08, 0.12), opacity: 0.14, rotate: degrees(32),
      });
    }
  }
  if (identity.title) document.setTitle(identity.title);
  document.setProducer("Zamonaviy Ta'lim Secure Library");
  return Buffer.from(await document.save({ useObjectStreams: true }));
}
