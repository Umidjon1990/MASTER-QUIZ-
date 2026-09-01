import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  createWatermarkedPdf,
  forbiddenPdfFeature,
  MAX_PDF_MB,
  parseSingleByteRange,
  watermarkLines,
} from "../server/library-security";

test("professional PDF limit stays at the safe default and hard ceiling", () => {
  assert.equal(MAX_PDF_MB, 25);
  assert.ok(MAX_PDF_MB <= 50);
});

test("single byte ranges support normal, open-ended, suffix, and invalid requests", () => {
  assert.deepEqual(parseSingleByteRange("bytes=10-19", 100), { start: 10, end: 19 });
  assert.deepEqual(parseSingleByteRange("bytes=90-", 100), { start: 90, end: 99 });
  assert.deepEqual(parseSingleByteRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(parseSingleByteRange("bytes=-200", 100), { start: 0, end: 99 });
  assert.equal(parseSingleByteRange("bytes=100-101", 100), null);
  assert.equal(parseSingleByteRange("bytes=20-10", 100), null);
  assert.equal(parseSingleByteRange("bytes=0-1,3-4", 100), null);
});

test("unsafe active PDF features are rejected", () => {
  assert.equal(forbiddenPdfFeature(Buffer.from("%PDF-1.7 /JavaScript")), "JavaScript");
  assert.equal(forbiddenPdfFeature(Buffer.from("%PDF-1.7 /EmbeddedFile")), "embedded file");
  assert.equal(forbiddenPdfFeature(Buffer.from("%PDF-1.7 harmless")), null);
});

test("watermark generation adds trace identity to every PDF page", async () => {
  const sourceDocument = await PDFDocument.create();
  sourceDocument.addPage([300, 400]);
  sourceDocument.addPage([300, 400]);
  const source = Buffer.from(await sourceDocument.save());
  const identity = {
    teacherName: "Test Teacher",
    teacherId: "teacher-12345678",
    sessionId: "session-87654321",
    openedAt: new Date("2026-09-01T08:00:00.000Z"),
  };

  const lines = watermarkLines(identity);
  assert.match(lines.identityLine, /Test Teacher/);
  assert.match(lines.traceLine, /SESSION:SESSION8/);

  const result = await createWatermarkedPdf(source, identity);
  const watermarked = await PDFDocument.load(result, { updateMetadata: false });
  assert.equal(watermarked.getPageCount(), 2);
  assert.equal(watermarked.getProducer(), "Zamonaviy Ta'lim Secure Library");
  assert.ok(result.length > source.length);
});
