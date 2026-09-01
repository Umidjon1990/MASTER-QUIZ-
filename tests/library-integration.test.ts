import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import express, { type RequestHandler } from "express";
import { PDFDocument } from "pdf-lib";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

async function freePort(): Promise<number> {
  const probe = createNetServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

async function assertStatus(response: Response, expected: number) {
  if (response.status !== expected) {
    assert.fail(`Expected HTTP ${expected}, received ${response.status}: ${await response.text()}`);
  }
}

test("upload, PostgreSQL fallback, viewer ranges, watermark, quota, audit, and migrations work end to end", async () => {
  const pglite = await PGlite.create();
  await pglite.waitReady;
  const port = await freePort();
  const socketServer = new PGLiteSocketServer({ db: pglite, host: "127.0.0.1", port });
  await socketServer.start();

  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "integration-session-secret-with-enough-entropy";
  process.env.LIBRARY_MAX_PDF_MB = "1";
  for (const name of ["BUCKET", "ENDPOINT", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY", "LIBRARY_BUCKET_NAME", "LIBRARY_S3_ENDPOINT", "LIBRARY_S3_ACCESS_KEY_ID", "LIBRARY_S3_SECRET_ACCESS_KEY"]) delete process.env[name];

  const { runMigrations, pool } = await import("../server/db");
  const { registerLibraryRoutes } = await import("../server/library-routes");
  const { resolveLibraryS3Config } = await import("../server/library-storage");

  let httpServer: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  try {
    await runMigrations();

    const fallback = resolveLibraryS3Config({});
    assert.equal(fallback.enabled, false);
    const configured = resolveLibraryS3Config({ BUCKET: "bucket", ENDPOINT: "https://s3.example.test", ACCESS_KEY_ID: "key", SECRET_ACCESS_KEY: "secret" });
    assert.equal(configured.enabled, true);

    await pool.query(`INSERT INTO user_profiles (user_id, role, display_name) VALUES ('admin-test', 'admin', 'Admin'), ('teacher-test', 'teacher', 'Test Teacher')`);

    const app = express();
    app.use(express.json());
    const requireAuth: RequestHandler = (req: any, res, next) => {
      const role = String(req.header("x-test-role") || "");
      if (!role) return res.status(401).json({ message: "auth required" });
      req.userId = role === "admin" ? "admin-test" : "teacher-test";
      req.userProfile = { role };
      next();
    };
    const requireRole = (roles: string[]): RequestHandler => (req: any, res, next) => {
      if (!roles.includes(req.userProfile?.role)) return res.status(403).json({ message: "forbidden" });
      next();
    };
    registerLibraryRoutes(app, requireAuth, requireRole);
    httpServer = app.listen(0, "127.0.0.1");
    await once(httpServer, "listening");
    const address = httpServer.address();
    const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

    const oversized = new FormData();
    oversized.set("title", "Too large");
    oversized.set("pdf", new Blob([new Uint8Array(1024 * 1024 + 1)], { type: "application/pdf" }), "large.pdf");
    const oversizedResponse = await fetch(`${baseUrl}/api/admin/library/books`, { method: "POST", headers: { "x-test-role": "admin" }, body: oversized });
    await assertStatus(oversizedResponse, 413);

    const sourceDocument = await PDFDocument.create();
    sourceDocument.addPage([320, 480]);
    const sourcePdf = Buffer.from(await sourceDocument.save());
    const form = new FormData();
    form.set("title", "Integration PDF");
    form.set("author", "Test Author");
    form.set("pdf", new Blob([new Uint8Array(sourcePdf)], { type: "application/pdf" }), "integration.pdf");
    const uploadResponse = await fetch(`${baseUrl}/api/admin/library/books`, { method: "POST", headers: { "x-test-role": "admin" }, body: form });
    await assertStatus(uploadResponse, 201);
    const book = await uploadResponse.json() as { id: string; storageKey: string };

    const storageResponse = await fetch(`${baseUrl}/api/admin/library/books`, { headers: { "x-test-role": "admin" } });
    const storagePayload = await storageResponse.json() as { storage: { configured: boolean; provider: string; maxPdfMb: number } };
    assert.deepEqual(storagePayload.storage, { configured: true, provider: "postgresql-encrypted", maxPdfMb: 1 });

    const blobResult = await pool.query(`SELECT encrypted_content FROM library_file_blobs WHERE storage_key = $1`, [book.storageKey]);
    assert.equal(blobResult.rowCount, 1);
    const encrypted = Buffer.from(blobResult.rows[0].encrypted_content);
    assert.equal(encrypted.subarray(0, 5).toString("ascii") === "%PDF-", false);

    const assignmentResponse = await fetch(`${baseUrl}/api/admin/library/assignments/teacher-test`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-test-role": "admin" },
      body: JSON.stringify({ assignments: [{ bookId: book.id, maxOpens: 1 }] }),
    });
    await assertStatus(assignmentResponse, 200);

    const openResponse = await fetch(`${baseUrl}/api/library/books/${book.id}/open`, { method: "POST", headers: { "x-test-role": "teacher" } });
    await assertStatus(openResponse, 201);
    const session = await openResponse.json() as { sessionId: string; token: string };
    const viewerHeaders = { "x-test-role": "teacher", "x-library-token": session.token };

    const rangeResponse = await fetch(`${baseUrl}/api/library/view/${session.sessionId}/file`, { headers: { ...viewerHeaders, range: "bytes=0-63" } });
    await assertStatus(rangeResponse, 206);
    assert.match(rangeResponse.headers.get("content-range") || "", /^bytes 0-63\//);
    assert.equal((await rangeResponse.arrayBuffer()).byteLength, 64);
    assert.equal(rangeResponse.headers.get("cache-control")?.includes("no-store"), true);

    const fullResponse = await fetch(`${baseUrl}/api/library/view/${session.sessionId}/file`, { headers: viewerHeaders });
    await assertStatus(fullResponse, 200);
    const fullPdf = Buffer.from(await fullResponse.arrayBuffer());
    const viewedDocument = await PDFDocument.load(fullPdf, { updateMetadata: false });
    assert.equal(viewedDocument.getProducer(), "Zamonaviy Ta'lim Secure Library");

    const suffixResponse = await fetch(`${baseUrl}/api/library/view/${session.sessionId}/file`, { headers: { ...viewerHeaders, range: "bytes=-16" } });
    await assertStatus(suffixResponse, 206);
    assert.equal((await suffixResponse.arrayBuffer()).byteLength, 16);

    const quotaResponse = await fetch(`${baseUrl}/api/library/books/${book.id}/open`, { method: "POST", headers: { "x-test-role": "teacher" } });
    await assertStatus(quotaResponse, 403);
    assert.match((await quotaResponse.json() as { message: string }).message, /limiti tugagan/);

    const quotaRow = await pool.query(`SELECT used_opens FROM library_assignments WHERE teacher_id = 'teacher-test' AND book_id = $1`, [book.id]);
    assert.equal(quotaRow.rows[0].used_opens, 1);
    const auditRows = await pool.query(`SELECT action FROM library_audit_logs ORDER BY created_at`);
    const actions = auditRows.rows.map(row => row.action);
    assert.ok(actions.includes("book.upload"));
    assert.ok(actions.includes("assignment.replace"));
    assert.ok(actions.includes("view.open"));
    assert.ok(actions.includes("view.denied"));
  } finally {
    if (httpServer) await new Promise<void>((resolve, reject) => httpServer!.close(error => error ? reject(error) : resolve()));
    await pool.end();
    await socketServer.stop();
    await pglite.close();
  }
});
