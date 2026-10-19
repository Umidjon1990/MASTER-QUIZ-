import type { Express, Request, Response } from "express";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { libraryFileStorage } from "./library-storage";
import { createWatermarkedPdf, parseSingleByteRange } from "./library-security";
import { fail } from "./platform-engine";
import { legacyOrderId } from "./platform-legacy";

const uuid = z.string().uuid(),
  sid = z.string().min(1).max(200),
  active = (d: any) => !d || new Date(d).getTime() > Date.now();
export async function registerPdfPlatform(
  app: Express,
  pool: any,
  storage = libraryFileStorage,
) {
  await pool.query(`CREATE TABLE IF NOT EXISTS platform_pdf_sales(book_id varchar PRIMARY KEY,enabled boolean NOT NULL DEFAULT false,preview_pages int NOT NULL DEFAULT 3 CHECK(preview_pages BETWEEN 1 AND 5));
 CREATE TABLE IF NOT EXISTS platform_pdf_grants(order_id uuid PRIMARY KEY,external_user_id varchar NOT NULL,book_id varchar NOT NULL,source_version text NOT NULL,full_name text NOT NULL,max_opens int,used_opens int NOT NULL DEFAULT 0,expires_at timestamptz,revoked_at timestamptz,legacy_assignment_id varchar,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS platform_pdf_readers(id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES platform_pdf_grants(order_id),external_user_id varchar NOT NULL,request_key uuid NOT NULL,opened_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,closed_at timestamptz,UNIQUE(order_id,request_key));
 CREATE TABLE IF NOT EXISTS platform_pdf_tombstones(order_id uuid PRIMARY KEY,external_user_id varchar NOT NULL);
 CREATE TABLE IF NOT EXISTS platform_pdf_operations(id uuid PRIMARY KEY,order_id uuid NOT NULL,result jsonb NOT NULL);`);
  const tx = async (fn: any) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const r = await fn(c);
      await c.query("COMMIT");
      return r;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  };
  const route = (fn: any) => (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res)).catch(next);
  function auth(req: Request) {
    const a = Buffer.from(req.get("x-platform-key") || ""),
      b = Buffer.from(process.env.PLATFORM_SERVICE_SECRET || "");
    if (b.length < 32 || a.length !== b.length || !timingSafeEqual(a, b))
      fail(403, "Manba ruxsati yo‘q");
  }
  function bookId(id: string) {
    if (!id.startsWith("pdf:")) fail(404, "PDF topilmadi");
    return sid.parse(id.slice(4));
  }
  const version = (b: any) =>
    createHash("sha256")
      .update(
        JSON.stringify([b.id, b.version, b.checksum_sha256, b.licensed_until]),
      )
      .digest("hex")
      .slice(0, 32);
  async function book(db: any, id: string, sale = false) {
    const b = (
      await db.query(
        "SELECT b.*,s.enabled,s.preview_pages FROM library_books b LEFT JOIN platform_pdf_sales s ON s.book_id=b.id WHERE b.id=$1",
        [id],
      )
    ).rows[0];
    if (
      !b ||
      b.status !== "active" ||
      !active(b.licensed_until) ||
      (sale && !b.enabled)
    )
      fail(404, "PDF hozir mavjud emas");
    return b;
  }
  async function grant(db: any, req: Request, lock = false) {
    const id = uuid.parse(req.get("x-platform-order")),
      user = sid.parse(req.get("x-platform-user"));
    const g = (
      await db.query(
        "SELECT * FROM platform_pdf_grants WHERE order_id=$1" +
          (lock ? " FOR UPDATE" : ""),
        [id],
      )
    ).rows[0];
    if (!g || g.external_user_id !== user) fail(403, "Xarid ruxsati yo‘q");
    if (g.revoked_at || !active(g.expires_at)) fail(403, "PDF ruxsati tugagan");
    if (g.legacy_assignment_id) {
      const a = (
        await db.query(
          "SELECT * FROM library_assignments WHERE id=$1" +
            (lock ? " FOR UPDATE" : ""),
          [g.legacy_assignment_id],
        )
      ).rows[0];
      if (
        !a ||
        a.status !== "active" ||
        !active(a.expires_at) ||
        (a.starts_at && new Date(a.starts_at).getTime() > Date.now())
      )
        fail(403, "Eski PDF ruxsati tugagan");
      g.max_opens = a.max_opens;
      g.used_opens = a.used_opens;
      g.native = a;
      g.expires_at = a.expires_at;
    }
    return g;
  }
  const dto = (g: any) => ({
    orderId: g.order_id,
    active: !g.revoked_at && active(g.expires_at),
    expiresAt: g.expires_at,
    maxAttempts: g.max_opens,
    attemptsRemaining:
      g.max_opens === null ? null : Math.max(0, g.max_opens - g.used_opens),
  });
  function sendPdf(req: Request, res: Response, bytes: Buffer) {
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="zamonaviy-talim.pdf"',
      "Cache-Control": "private, no-store, no-transform",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    });
    const range = req.get("range");
    if (range) {
      const r = parseSingleByteRange(range, bytes.length);
      if (!r)
        return res
          .status(416)
          .set("Content-Range", `bytes */${bytes.length}`)
          .end();
      res
        .status(206)
        .set("Content-Range", `bytes ${r.start}-${r.end}/${bytes.length}`)
        .set("Content-Length", String(r.end - r.start + 1));
      return res.end(bytes.subarray(r.start, r.end + 1));
    }
    res.set("Content-Length", String(bytes.length));
    return res.end(bytes);
  }
  // Cache watermarked bytes for short sessions only; bounded to avoid retaining whole libraries in memory.
  const cache = new Map<string, { bytes: Buffer; until: number }>();
  let cacheSize = 0,
    generating = 0;
  async function protectedBytes(key: string, build: () => Promise<Buffer>) {
    for (const [k, v] of cache)
      if (v.until < Date.now()) {
        cache.delete(k);
        cacheSize -= v.bytes.length;
      }
    const hit = cache.get(key);
    if (hit) return hit.bytes;
    if (generating >= 3)
      fail(429, "PDF tayyorlanmoqda. Birozdan keyin qayta oching");
    generating++;
    try {
      const bytes = await build();
      while (cacheSize + bytes.length > 64 * 1024 * 1024 && cache.size) {
        const k = cache.keys().next().value!;
        cacheSize -= cache.get(k)!.bytes.length;
        cache.delete(k);
      }
      if (bytes.length <= 64 * 1024 * 1024) {
        cache.set(key, { bytes, until: Date.now() + 120000 });
        cacheSize += bytes.length;
      }
      return bytes;
    } finally {
      generating--;
    }
  }
  const prefix = "/api/platform";
  app.get(
    prefix + "/products/:sourceId/demo",
    route(async (req: any, res: any) => {
      if (!String(req.params.sourceId).startsWith("pdf:")) return req.next();
      auth(req);
      const b = await book(pool, bookId(req.params.sourceId), true);
      res.json({
        kind: "pdf",
        sourceId: "pdf:" + b.id,
        title: b.title,
        pageCount: b.page_count,
        previewPages: Math.min(b.page_count, b.preview_pages),
        pdfPreview: true,
      });
    }),
  );
  app.get(
    prefix + "/products/:sourceId/demo-file",
    route(async (req: any, res: any) => {
      auth(req);
      const b = await book(pool, bookId(req.params.sourceId), true);
      const bytes = await protectedBytes(
        "demo:" + version(b) + ":" + b.preview_pages,
        async () => {
          const original = await PDFDocument.load(
              await storage.get(b.storage_key),
            ),
            preview = await PDFDocument.create();
          const pages = await preview.copyPages(
            original,
            Array.from(
              { length: Math.min(b.page_count, b.preview_pages) },
              (_, i) => i,
            ),
          );
          pages.forEach((p) => preview.addPage(p));
          return createWatermarkedPdf(Buffer.from(await preview.save()), {
            teacherName: "DEMO",
            teacherId: "demo",
            sessionId: "public-demo",
            openedAt: new Date(0),
            title: b.title,
          });
        },
      );
      sendPdf(req, res, bytes);
    }),
  );
  app.post(
    prefix + "/grants",
    route(async (req: any, res: any) => {
      if (req.body?.kind !== "pdf") return req.next();
      auth(req);
      const v = z
        .object({
          orderId: uuid,
          externalUserId: sid,
          sourceId: sid,
          sourceVersion: sid,
          fullName: z.string().max(200).optional(),
          kind: z.literal("pdf"),
          durationDays: z.number().int().min(1).max(3650).nullable(),
          maxAttempts: z.number().int().min(1).max(1000).nullable(),
        })
        .parse(req.body);
      const g = await tx(async (c: any) => {
        await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          v.orderId,
        ]);
        if (
          (
            await c.query(
              "SELECT 1 FROM platform_pdf_tombstones WHERE order_id=$1",
              [v.orderId],
            )
          ).rowCount
        )
          fail(409, "Xarid bekor qilingan");
        let g = (
          await c.query("SELECT * FROM platform_pdf_grants WHERE order_id=$1", [
            v.orderId,
          ])
        ).rows[0];
        if (g) {
          if (
            g.external_user_id !== v.externalUserId ||
            g.book_id !== bookId(v.sourceId)
          )
            fail(409, "Xarid boshqa mahsulotga tegishli");
          return g;
        }
        const b = await book(c, bookId(v.sourceId), true);
        if (version(b) !== v.sourceVersion)
          fail(409, "PDF yangilangan. Taklifni yangilang");
        g = (
          await c.query(
            "INSERT INTO platform_pdf_grants(order_id,external_user_id,book_id,source_version,full_name,max_opens,expires_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7::int IS NULL THEN NULL ELSE now()+$7*interval '1 day' END) RETURNING *",
            [
              v.orderId,
              v.externalUserId,
              b.id,
              v.sourceVersion,
              v.fullName || v.externalUserId,
              v.maxAttempts,
              v.durationDays,
            ],
          )
        ).rows[0];
        return g;
      });
      res.json(dto(g));
    }),
  );
  app.post(
    prefix + "/grants/:orderId/manage",
    route(async (req: any, res: any) => {
      auth(req);
      const exists = (
        await pool.query(
          "SELECT 1 FROM platform_pdf_grants WHERE order_id=$1",
          [uuid.parse(req.params.orderId)],
        )
      ).rowCount;
      if (!exists && req.body?.kind !== "pdf") return req.next();
      auth(req);
      const v = z
        .object({
          externalUserId: sid,
          operationId: uuid,
          action: z.enum(["revoke", "extend"]),
          days: z.number().int().min(1).max(3650).optional(),
        })
        .parse(req.body);
      res.json(
        await tx(async (c: any) => {
          await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            req.params.orderId,
          ]);
          const prior = (
            await c.query("SELECT * FROM platform_pdf_operations WHERE id=$1", [
              v.operationId,
            ])
          ).rows[0];
          if (prior) {
            if (prior.order_id !== req.params.orderId)
              fail(409, "Amal boshqa xaridga tegishli");
            return prior.result;
          }
          let g = (
            await c.query(
              "SELECT * FROM platform_pdf_grants WHERE order_id=$1 FOR UPDATE",
              [req.params.orderId],
            )
          ).rows[0];
          if (g && g.external_user_id !== v.externalUserId)
            fail(403, "Xarid boshqa hisobga tegishli");
          if (v.action === "revoke") {
            await c.query(
              "INSERT INTO platform_pdf_tombstones(order_id,external_user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
              [req.params.orderId, v.externalUserId],
            );
            if (g) {
              g = (
                await c.query(
                  "UPDATE platform_pdf_grants SET revoked_at=now() WHERE order_id=$1 RETURNING *",
                  [g.order_id],
                )
              ).rows[0];
              await c.query(
                "UPDATE platform_pdf_readers SET closed_at=now() WHERE order_id=$1",
                [g.order_id],
              );
              if (g.legacy_assignment_id)
                await c.query(
                  "UPDATE library_assignments SET status='revoked' WHERE id=$1",
                  [g.legacy_assignment_id],
                );
            }
          } else {
            if (!g || g.revoked_at || !v.days)
              fail(409, "PDF ruxsatini uzaytirib bo‘lmaydi");
            g = (
              await c.query(
                "UPDATE platform_pdf_grants SET expires_at=GREATEST(COALESCE(expires_at,now()),now())+$2*interval '1 day' WHERE order_id=$1 RETURNING *",
                [g.order_id, v.days],
              )
            ).rows[0];
            if (g.legacy_assignment_id)
              await c.query(
                "UPDATE library_assignments SET expires_at=$2 WHERE id=$1",
                [g.legacy_assignment_id, g.expires_at],
              );
          }
          const result = g
            ? dto(g)
            : { orderId: req.params.orderId, active: false };
          await c.query(
            "INSERT INTO platform_pdf_operations(id,order_id,result) VALUES($1,$2,$3)",
            [v.operationId, req.params.orderId, result],
          );
          return result;
        }),
      );
    }),
  );
  app.get(
    prefix + "/owned/:sourceId/view",
    route(async (req: any, res: any) => {
      if (!String(req.params.sourceId).startsWith("pdf:")) return req.next();
      auth(req);
      const g = await grant(pool, req),
        b = await book(pool, g.book_id);
      if (bookId(req.params.sourceId) !== b.id)
        fail(403, "PDF boshqa xaridga tegishli");
      const r = (
        await pool.query(
          "SELECT id,expires_at FROM platform_pdf_readers WHERE order_id=$1 AND closed_at IS NULL AND expires_at>now() ORDER BY opened_at DESC LIMIT 1",
          [g.order_id],
        )
      ).rows[0];
      res.json({
        kind: "pdf",
        sourceId: "pdf:" + b.id,
        title: b.title,
        pageCount: b.page_count,
        ...dto(g),
        reader: r ? { id: r.id, expiresAt: r.expires_at } : null,
      });
    }),
  );
  app.get(
    prefix + "/owned/:sourceId/history",
    route(async (req: any, res: any) => {
      if (!String(req.params.sourceId).startsWith("pdf:")) return req.next();
      auth(req);
      const g = (
        await pool.query(
          "SELECT * FROM platform_pdf_grants WHERE order_id=$1 AND external_user_id=$2 AND book_id=$3",
          [
            uuid.parse(req.get("x-platform-order")),
            sid.parse(req.get("x-platform-user")),
            bookId(req.params.sourceId),
          ],
        )
      ).rows[0];
      if (!g) fail(403, "Xarid topilmadi");
      res.json({ attempts: [] });
    }),
  );
  app.post(
    prefix + "/native/pdf-documents/:sourceId/open",
    route(async (req: any, res: any) => {
      auth(req);
      const requestKey = uuid.parse(req.body?.requestKey);
      res.json(
        await tx(async (c: any) => {
          const g = await grant(c, req, true),
            b = await book(c, bookId(req.params.sourceId));
          if (g.book_id !== b.id) fail(403, "Boshqa PDF");
          const same = (
            await c.query(
              "SELECT * FROM platform_pdf_readers WHERE order_id=$1 AND request_key=$2",
              [g.order_id, requestKey],
            )
          ).rows[0];
          if (same) {
            if (same.closed_at || !active(same.expires_at))
              fail(409, "O‘qish seansi tugagan. Yangisini boshlang");
            return { id: same.id, expiresAt: same.expires_at };
          }
          const old = (
            await c.query(
              "SELECT * FROM platform_pdf_readers WHERE order_id=$1 AND closed_at IS NULL AND expires_at>now() ORDER BY opened_at DESC LIMIT 1",
              [g.order_id],
            )
          ).rows[0];
          if (old) return { id: old.id, expiresAt: old.expires_at };
          if (g.max_opens !== null && g.used_opens >= g.max_opens)
            fail(403, "PDF ochish limiti tugagan");
          if (g.native) {
            const count = (
              await c.query(
                "SELECT count(*)::int AS n FROM library_view_sessions WHERE assignment_id=$1 AND status IN ('pending','active') AND expires_at>now()",
                [g.native.id],
              )
            ).rows[0].n;
            if (count >= g.native.max_concurrent_sessions)
              fail(
                409,
                "PDF eski kabinetda ochilgan. Avval u yerdagi seansni yoping",
              );
          }
          const id = randomUUID(),
            end = new Date(
              Math.min(
                Date.now() + 2 * 3600000,
                g.expires_at ? new Date(g.expires_at).getTime() : Infinity,
                b.licensed_until
                  ? new Date(b.licensed_until).getTime()
                  : Infinity,
              ),
            );
          await c.query(
            "INSERT INTO platform_pdf_readers(id,order_id,external_user_id,request_key,expires_at) VALUES($1,$2,$3,$4,$5)",
            [id, g.order_id, g.external_user_id, requestKey, end],
          );
          await c.query(
            "UPDATE platform_pdf_grants SET used_opens=used_opens+1 WHERE order_id=$1",
            [g.order_id],
          );
          if (g.native) {
            await c.query(
              "UPDATE library_assignments SET used_opens=used_opens+1 WHERE id=$1",
              [g.native.id],
            );
            await c.query(
              "INSERT INTO library_view_sessions(id,assignment_id,teacher_id,book_id,token_hash,status,count_consumed,expires_at,activated_at) VALUES($1,$2,$3,$4,$5,'active',true,$6,now())",
              [
                id,
                g.native.id,
                g.native.teacher_id,
                b.id,
                createHash("sha256").update(randomUUID()).digest("hex"),
                end,
              ],
            );
          }
          return { id, expiresAt: end };
        }),
      );
    }),
  );
  app.post(
    prefix + "/native/pdf-sessions/:readerId/close",
    route(async (req: any, res: any) => {
      auth(req);
      const g = await grant(pool, req),
        id = uuid.parse(req.params.readerId);
      const r = await pool.query(
        "UPDATE platform_pdf_readers SET closed_at=now() WHERE id=$1 AND order_id=$2 AND external_user_id=$3 RETURNING id",
        [id, g.order_id, g.external_user_id],
      );
      if (!r.rowCount) fail(404, "Seans topilmadi");
      if (g.legacy_assignment_id)
        await pool.query(
          "UPDATE library_view_sessions SET status='closed',revoked_at=now() WHERE id=$1",
          [id],
        );
      res.json({ closed: true });
    }),
  );
  app.get(
    prefix + "/native/pdf-sessions/:readerId/file",
    route(async (req: any, res: any) => {
      auth(req);
      const g = await grant(pool, req),
        id = uuid.parse(req.params.readerId),
        r = (
          await pool.query(
            "SELECT * FROM platform_pdf_readers WHERE id=$1 AND order_id=$2 AND external_user_id=$3 AND closed_at IS NULL AND expires_at>now()",
            [id, g.order_id, g.external_user_id],
          )
        ).rows[0];
      if (!r) fail(403, "PDF seansi yopilgan");
      if (g.legacy_assignment_id) {
        const nr = (
          await pool.query(
            "SELECT id FROM library_view_sessions WHERE id=$1 AND status='active' AND expires_at>now()",
            [id],
          )
        ).rows[0];
        if (!nr) fail(403, "Eski PDF seansi yopilgan");
      }
      const b = await book(pool, g.book_id);
      const bytes = await protectedBytes(id, async () =>
        createWatermarkedPdf(await storage.get(b.storage_key), {
          teacherName: g.full_name,
          teacherId: g.external_user_id,
          sessionId: id,
          openedAt: r.opened_at,
          title: b.title,
        }),
      );
      sendPdf(req, res, bytes);
    }),
  );
  return {
    catalog: async () => {
      const rows = (
        await pool.query(
          "SELECT b.*,s.preview_pages FROM library_books b JOIN platform_pdf_sales s ON s.book_id=b.id WHERE s.enabled=true AND b.status='active' AND (b.licensed_until IS NULL OR b.licensed_until>now()) ORDER BY b.created_at DESC LIMIT 1000",
        )
      ).rows;
      return rows.map((b: any) => ({
        sourceId: "pdf:" + b.id,
        kind: "pdf",
        title: b.title,
        description: b.description || "",
        thumbnailUrl: b.cover_url,
        level: b.level,
        sourceVersion: version(b),
        demoRef: "pdf:" + b.id,
        recommendedDurationDays: 30,
        recommendedMaxAttempts: 10,
        features: {
          pageCount: b.page_count,
          previewPages: Math.min(b.page_count, b.preview_pages),
          watermarked: true,
        },
        readyForSale: b.page_count > 0,
      }));
    },
    extraImports: async (
      nativeId: string,
      externalUserId: string,
      fullName: string,
    ) => {
      const link = (
        await pool.query(
          "SELECT 1 FROM platform_legacy_links WHERE native_user_id=$1 AND external_user_id=$2",
          [nativeId, externalUserId],
        )
      ).rowCount;
      if (!link) fail(403, "Eski hisob tasdiqlanmagan");
      const rows = (
          await pool.query(
            "SELECT a.*,b.title,b.description,b.version,b.checksum_sha256,b.licensed_until FROM library_assignments a JOIN library_books b ON b.id=a.book_id WHERE a.teacher_id=$1",
            [nativeId],
          )
        ).rows,
        grants = [];
      for (const a of rows) {
        const sourceId = "pdf:" + a.book_id,
          orderId = legacyOrderId("quiz", { pdf: a.id });
        await pool.query(
          "INSERT INTO platform_pdf_grants(order_id,external_user_id,book_id,source_version,full_name,max_opens,used_opens,expires_at,legacy_assignment_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(order_id) DO NOTHING",
          [
            orderId,
            externalUserId,
            a.book_id,
            version({ ...a, id: a.book_id }),
            fullName,
            a.max_opens,
            a.used_opens,
            a.expires_at,
            a.id,
          ],
        );
        grants.push({
          orderId,
          sourceId,
          title: a.title,
          description: a.description || "",
          kind: "pdf",
          maxAttempts: a.max_opens,
          usedAttempts: a.used_opens,
          expiresAt: a.expires_at,
          active: a.status === "active" && active(a.expires_at),
          sourceVersion: version({ ...a, id: a.book_id }),
          legacy: true,
          revoked: a.status !== "active",
          ...(a.max_opens === null
            ? {}
            : { attemptsRemaining: Math.max(0, a.max_opens - a.used_opens) }),
        });
      }
      return grants;
    },
  };
}
