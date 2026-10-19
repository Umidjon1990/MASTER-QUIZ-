import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PDFDocument } from "pdf-lib";
import express from "express";
test("PDF sale isolates ownership, resumes without extra opens, protects ranges, previews and revoke-before-delivery", async () => {
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = (probe.address() as any).port;
  await new Promise<void>((r) => probe.close(() => r()));
  const db = await PGlite.create(),
    socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port });
  await socket.start();
  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  process.env.NODE_ENV = "test";
  process.env.PREVIEW_DATABASE = "pglite";
  process.env.SESSION_SECRET =
    "pdf-integration-session-secret-with-enough-entropy";
  process.env.PLATFORM_SERVICE_SECRET = randomUUID() + randomUUID();
  const { pool, runMigrations } = await import("../server/db");
  let server: any;
  try {
    await runMigrations();
    const { registerPdfPlatform } = await import("../server/platform-pdf"),
      { libraryFileStorage } = await import("../server/library-storage");
    const document = await PDFDocument.create();
    for (let i = 0; i < 4; i++) document.addPage([320, 480]);
    const bytes = Buffer.from(await document.save());
    await libraryFileStorage.put("test-private-pdf", bytes);
    await pool.query(
      "INSERT INTO library_books(id,title,storage_key,original_file_name,file_size,page_count,checksum_sha256,uploaded_by) VALUES('book','Paid PDF','test-private-pdf','source.pdf',$1,4,'checksum','admin')",
      [bytes.length],
    );
    const app = express();
    app.use(express.json());
    const pdf = await registerPdfPlatform(app, pool);
    app.use((e: any, _q: any, res: any, _n: any) =>
      res.status(e.status || 400).json({ message: e.message }),
    );
    await pool.query(
      "INSERT INTO platform_pdf_sales(book_id,enabled,preview_pages) VALUES('book',true,2)",
    );
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}/api/platform`,
      order = randomUUID(),
      headers = {
        "content-type": "application/json",
        "x-platform-key": process.env.PLATFORM_SERVICE_SECRET,
        "x-platform-user": "learner",
        "x-platform-order": order,
      };
    const call = (p: string, b?: any, extra: any = {}) =>
      fetch(base + p, {
        method: b === undefined ? "GET" : "POST",
        headers: { ...headers, ...extra },
        body: b === undefined ? undefined : JSON.stringify(b),
      });
    const json = async (p: string, b?: any, extra: any = {}) => {
      const r = await call(p, b, extra);
      return { status: r.status, data: await r.json() };
    };
    const [product] = await pdf.catalog();
    assert.equal(product.kind, "pdf");
    assert.ok(!JSON.stringify(product).includes("test-private-pdf"));
    let r = await call("/products/pdf%3Abook/demo-file");
    assert.equal(r.status, 200);
    assert.equal(
      (await PDFDocument.load(await r.arrayBuffer())).getPageCount(),
      2,
    );
    const grant = {
      orderId: order,
      externalUserId: "learner",
      sourceId: "pdf:book",
      sourceVersion: product.sourceVersion,
      kind: "pdf",
      durationDays: 30,
      maxAttempts: 2,
      fullName: "Learner",
    };
    const delivered = await json("/grants", grant);
    assert.equal(delivered.status, 200, JSON.stringify(delivered));
    assert.equal(delivered.data.orderId, order);
    assert.equal(
      (await json("/grants", grant)).data.expiresAt,
      delivered.data.expiresAt,
    );
    const key = randomUUID(),
      opens = await Promise.all([
        json("/native/pdf-documents/pdf%3Abook/open", { requestKey: key }),
        json("/native/pdf-documents/pdf%3Abook/open", { requestKey: key }),
      ]);
    assert.equal(opens[0].status, 200, JSON.stringify(opens));
    assert.equal(opens[0].data.id, opens[1].data.id);
    const id = opens[0].data.id;
    assert.equal(
      (await json("/owned/pdf%3Abook/view")).data.attemptsRemaining,
      1,
    );
    r = await call("/native/pdf-sessions/" + id + "/file", undefined, {
      Range: "bytes=0-63",
    });
    assert.equal(r.status, 206);
    assert.match(r.headers.get("content-range") || "", /^bytes 0-63\//);
    assert.equal((await r.arrayBuffer()).byteLength, 64);
    assert.equal(
      (
        await call("/native/pdf-sessions/" + id + "/file", undefined, {
          "x-platform-user": "another",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await json("/native/pdf-documents/pdf%3Abook/open", {
          requestKey: randomUUID(),
        })
      ).data.id,
      id,
    );
    assert.equal(
      (await json("/owned/pdf%3Abook/view")).data.attemptsRemaining,
      1,
    );
    await pool.query(
      "UPDATE platform_pdf_sales SET enabled=false WHERE book_id='book'",
    );
    assert.equal((await pdf.catalog()).length, 0);
    r = await call("/native/pdf-sessions/" + id + "/file");
    assert.equal(r.status, 200);
    assert.equal(
      (await PDFDocument.load(await r.arrayBuffer())).getPageCount(),
      4,
    );
    await json("/native/pdf-sessions/" + id + "/close", {});
    assert.equal(
      (await call("/native/pdf-sessions/" + id + "/file")).status,
      403,
    );
    await json("/native/pdf-documents/pdf%3Abook/open", {
      requestKey: randomUUID(),
    });
    assert.equal(
      (await json("/owned/pdf%3Abook/view")).data.attemptsRemaining,
      0,
    );
    const operationId = randomUUID();
    let action = {
      externalUserId: "learner",
      operationId,
      action: "extend",
      days: 7,
      kind: "pdf",
    };
    const extended = await json("/grants/" + order + "/manage", action);
    assert.equal(extended.status, 200);
    assert.equal(
      (await json("/grants/" + order + "/manage", action)).data.expiresAt,
      extended.data.expiresAt,
    );
    const revoked = await json("/grants/" + order + "/manage", {
      ...action,
      action: "revoke",
      operationId: randomUUID(),
    });
    assert.equal(revoked.data.active, false);
    assert.equal(
      (await call("/native/pdf-sessions/" + id + "/file")).status,
      403,
    );
    const late = randomUUID();
    assert.equal(
      (
        await json("/grants/" + late + "/manage", {
          ...action,
          action: "revoke",
          operationId: randomUUID(),
        })
      ).data.orderId,
      late,
    );
    assert.equal(
      (await json("/grants", { ...grant, orderId: late })).status,
      409,
    );
    // Legacy assignments keep their original quota and native reader sessions.
    await pool.query(
      "CREATE TABLE IF NOT EXISTS platform_legacy_links(external_user_id varchar PRIMARY KEY,native_user_id varchar NOT NULL UNIQUE,full_name text NOT NULL)",
    );
    await assert.rejects(() =>
      pdf.extraImports("native-reader", "learner", "Learner"),
    );
    await pool.query(
      "INSERT INTO platform_legacy_links VALUES('learner','native-reader','Learner')",
    );
    await pool.query(
      "INSERT INTO library_assignments(id,teacher_id,book_id,max_opens,used_opens,assigned_by) VALUES('native-pdf','native-reader','book',3,1,'admin')",
    );
    const imported = await pdf.extraImports(
      "native-reader",
      "learner",
      "Learner",
    );
    assert.equal(imported.length, 1);
    assert.equal(imported[0].attemptsRemaining, 2);
    const legacyHeader = { "x-platform-order": imported[0].orderId };
    const legacyOpen = await json(
      "/native/pdf-documents/pdf%3Abook/open",
      { requestKey: randomUUID() },
      legacyHeader,
    );
    assert.equal(legacyOpen.status, 200, JSON.stringify(legacyOpen));
    assert.equal(
      (
        await pool.query(
          "SELECT used_opens FROM library_assignments WHERE id='native-pdf'",
        )
      ).rows[0].used_opens,
      2,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM library_view_sessions WHERE id=$1",
          [legacyOpen.data.id],
        )
      ).rows[0].n,
      1,
    );
    await pool.query(
      "UPDATE library_assignments SET status='revoked' WHERE id='native-pdf'",
    );
    assert.equal(
      (
        await call(
          "/native/pdf-sessions/" + legacyOpen.data.id + "/file",
          undefined,
          legacyHeader,
        )
      ).status,
      403,
    );
  } finally {
    if (server) await new Promise<void>((r) => server.close(() => r()));
    await pool.end();
    await socket.stop();
    await db.close();
  }
});
