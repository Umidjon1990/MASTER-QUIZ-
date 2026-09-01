import type { Express, RequestHandler } from "express";
import multer from "multer";
import { createHash, randomBytes, randomUUID } from "crypto";
import { promises as fs, createReadStream } from "fs";
import path from "path";
import os from "os";
import { PDFDocument } from "pdf-lib";
import rateLimit from "express-rate-limit";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { libraryFileStorage } from "./library-storage";
import {
  createWatermarkedPdf,
  forbiddenPdfFeature,
  MAX_PDF_BYTES,
  MAX_PDF_MB,
  MAX_PDF_PAGES,
  parseSingleByteRange,
} from "./library-security";
import {
  libraryAssignments,
  libraryAuditLogs,
  libraryBooks,
  libraryViewSessions,
  userProfiles,
} from "@shared/schema";

type RoleMiddleware = (roles: string[]) => RequestHandler;
const SESSION_HOURS = Math.max(1, Number(process.env.LIBRARY_SESSION_HOURS || 2));
const watermarkRoot = path.join(os.tmpdir(), "master-quiz-library-watermarks");
const generationLocks = new Map<string, Promise<string>>();

const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 30 },
  fileFilter: (_req, file, callback) => {
    const nameIsPdf = file.originalname.toLowerCase().endsWith(".pdf");
    const mimeIsPdf = ["application/pdf", "application/x-pdf", "application/octet-stream"].includes(file.mimetype);
    if (!nameIsPdf || !mimeIsPdf) return callback(new Error("Faqat PDF fayl yuklash mumkin"));
    callback(null, true);
  },
});

const acceptSinglePdf: RequestHandler = (req, res, next) => {
  uploadPdf.single("pdf")(req, res, (error: any) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: `PDF hajmi ${MAX_PDF_MB} MB dan oshmasligi kerak` });
    }
    return res.status(400).json({ message: error.message || "PDF yuklash so'rovi noto'g'ri" });
  });
};

function hash(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function requestIpHash(req: any): string {
  const salt = process.env.LIBRARY_AUDIT_SALT || process.env.SESSION_SECRET || "library-audit";
  return hash(`${salt}:${req.ip || req.socket?.remoteAddress || "unknown"}`);
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isAssignmentAvailable(assignment: typeof libraryAssignments.$inferSelect, now = new Date(), ignoreExhaustedQuota = false): string | null {
  if (assignment.status !== "active") return "Ruxsat faol emas";
  if (assignment.startsAt && assignment.startsAt > now) return "Ruxsat muddati hali boshlanmagan";
  if (assignment.expiresAt && assignment.expiresAt <= now) return "Ruxsat muddati tugagan";
  if (!ignoreExhaustedQuota && assignment.maxOpens !== null && assignment.usedOpens >= assignment.maxOpens) return "Kirish limiti tugagan";
  return null;
}

function isBookAvailable(book: typeof libraryBooks.$inferSelect, now = new Date()): string | null {
  if (book.status !== "active") return "Kitob faol emas";
  if (book.licensedUntil && book.licensedUntil <= now) return "Kitob litsenziya muddati tugagan";
  return null;
}

async function audit(req: any, values: Omit<typeof libraryAuditLogs.$inferInsert, "actorId" | "actorRole" | "ipHash">) {
  try {
    await db.insert(libraryAuditLogs).values({
      ...values,
      actorId: req.userId,
      actorRole: req.userProfile?.role || "teacher",
      ipHash: requestIpHash(req),
    });
  } catch (error) {
    console.error("[Library audit]", error);
  }
}

async function buildWatermarkedPdf(session: typeof libraryViewSessions.$inferSelect, book: typeof libraryBooks.$inferSelect, teacherName: string): Promise<string> {
  await fs.mkdir(watermarkRoot, { recursive: true, mode: 0o700 });
  const target = path.join(watermarkRoot, `${session.id}.pdf`);
  try {
    await fs.access(target);
    return target;
  } catch {}

  const source = await libraryFileStorage.get(book.storageKey);
  const output = await createWatermarkedPdf(source, {
    teacherName,
    teacherId: session.teacherId,
    sessionId: session.id,
    openedAt: session.activatedAt || session.openedAt || new Date(),
    title: book.title,
  });
  await fs.writeFile(target, output, { mode: 0o600 });
  return target;
}

async function watermarkedFile(session: typeof libraryViewSessions.$inferSelect, book: typeof libraryBooks.$inferSelect, teacherName: string) {
  const existing = generationLocks.get(session.id);
  if (existing) return existing;
  const operation = buildWatermarkedPdf(session, book, teacherName).finally(() => generationLocks.delete(session.id));
  generationLocks.set(session.id, operation);
  return operation;
}

function setPdfSecurityHeaders(res: any) {
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": "inline; filename=protected-library-document.pdf",
    "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Security-Policy": "default-src 'self'; frame-ancestors 'self'",
    "Referrer-Policy": "no-referrer",
  });
}

async function activateSession(sessionId: string) {
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(libraryViewSessions).where(eq(libraryViewSessions.id, sessionId)).for("update");
    if (!session) throw new Error("Sessiya topilmadi");
    if (session.status === "revoked" || session.expiresAt <= new Date()) throw new Error("Sessiya bekor qilingan yoki muddati tugagan");
    if (session.countConsumed) return session;
    const [assignment] = await tx.select().from(libraryAssignments).where(eq(libraryAssignments.id, session.assignmentId)).for("update");
    if (!assignment) throw new Error("Ruxsat topilmadi");
    const unavailable = isAssignmentAvailable(assignment);
    if (unavailable) throw new Error(unavailable);
    const now = new Date();
    await tx.update(libraryAssignments).set({ usedOpens: sql`${libraryAssignments.usedOpens} + 1`, updatedAt: now }).where(eq(libraryAssignments.id, assignment.id));
    const [activated] = await tx.update(libraryViewSessions).set({ status: "active", countConsumed: true, activatedAt: now, lastSeenAt: now }).where(eq(libraryViewSessions.id, session.id)).returning();
    return activated;
  });
}

async function sessionContext(req: any) {
  const token = req.header("x-library-token");
  if (!token || typeof token !== "string") return null;
  const [row] = await db.select({
    session: libraryViewSessions,
    assignment: libraryAssignments,
    book: libraryBooks,
    teacherName: userProfiles.displayName,
  }).from(libraryViewSessions)
    .innerJoin(libraryAssignments, eq(libraryViewSessions.assignmentId, libraryAssignments.id))
    .innerJoin(libraryBooks, eq(libraryViewSessions.bookId, libraryBooks.id))
    .leftJoin(userProfiles, eq(libraryViewSessions.teacherId, userProfiles.userId))
    .where(and(eq(libraryViewSessions.id, req.params.sessionId), eq(libraryViewSessions.tokenHash, hash(token))));
  if (!row || row.session.teacherId !== req.userId) return null;
  if (row.session.status === "revoked" || row.session.expiresAt <= new Date()) return null;
  if (isBookAvailable(row.book) || isAssignmentAvailable(row.assignment, new Date(), row.session.countConsumed)) return null;
  return row;
}

export function registerLibraryRoutes(app: Express, requireAuth: RequestHandler, requireRole: RoleMiddleware) {
  const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false, message: { message: "PDF yuklash limiti oshib ketdi" } });
  const openLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: "draft-7", legacyHeaders: false, message: { message: "Kitob ochish urinishlari juda ko'p" } });
  const viewerLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 1200, standardHeaders: "draft-7", legacyHeaders: false, message: { message: "Viewer so'rovlari limiti oshib ketdi" } });
  app.get("/api/admin/library/books", requireAuth, requireRole(["admin"]), async (_req, res) => {
    const books = await db.select().from(libraryBooks).orderBy(desc(libraryBooks.createdAt));
    res.json({ books, storage: { configured: libraryFileStorage.configured, provider: libraryFileStorage.provider, maxPdfMb: MAX_PDF_MB } });
  });

  app.post("/api/admin/library/books", requireAuth, requireRole(["admin"]), uploadLimiter, acceptSinglePdf, async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "PDF fayl tanlanmagan" });
      if (req.file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
        return res.status(400).json({ message: "Fayl haqiqiy PDF emas" });
      }
      const forbidden = forbiddenPdfFeature(req.file.buffer);
      if (forbidden) return res.status(400).json({ message: `Xavfsizlik: PDF ichida taqiqlangan ${forbidden} topildi` });
      if (!req.body.title?.trim()) return res.status(400).json({ message: "Kitob nomi majburiy" });
      let pdf: PDFDocument;
      try {
        pdf = await PDFDocument.load(req.file.buffer, { updateMetadata: false });
      } catch {
        return res.status(400).json({ message: "PDF buzilgan yoki parol bilan himoyalangan" });
      }
      if (pdf.getPageCount() > MAX_PDF_PAGES) return res.status(400).json({ message: `PDF ${MAX_PDF_PAGES} sahifadan oshmasligi kerak` });
      const checksum = hash(req.file.buffer);
      const [duplicate] = await db.select({ id: libraryBooks.id, title: libraryBooks.title }).from(libraryBooks).where(eq(libraryBooks.checksumSha256, checksum));
      if (duplicate) return res.status(409).json({ message: `Bu PDF avval “${duplicate.title}” nomi bilan yuklangan` });

      const bookId = randomUUID();
      const storageKey = `books/${new Date().getUTCFullYear()}/${bookId}/source.pdf`;
      await libraryFileStorage.put(storageKey, req.file.buffer);
      try {
        const [book] = await db.insert(libraryBooks).values({
          id: bookId,
          title: req.body.title.trim(),
          author: req.body.author?.trim() || null,
          description: req.body.description?.trim() || null,
          category: req.body.category?.trim() || null,
          subject: req.body.subject?.trim() || null,
          level: req.body.level?.trim() || null,
          language: req.body.language?.trim() || "uz",
          coverUrl: req.body.coverUrl?.trim() || null,
          storageKey,
          originalFileName: path.basename(req.file.originalname).replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 255),
          mimeType: "application/pdf",
          fileSize: req.file.size,
          pageCount: pdf.getPageCount(),
          checksumSha256: checksum,
          copyrightOwner: req.body.copyrightOwner?.trim() || null,
          licenseNote: req.body.licenseNote?.trim() || null,
          licensedUntil: asDate(req.body.licensedUntil),
          uploadedBy: req.userId,
          status: "active",
        }).returning();
        await audit(req, { action: "book.upload", bookId: book.id, result: "success", metadata: { pageCount: book.pageCount, fileSize: book.fileSize, activeContentChecked: true, encryptedAtRest: true, storageProvider: libraryFileStorage.provider } });
        res.status(201).json(book);
      } catch (error) {
        await libraryFileStorage.remove(storageKey);
        throw error;
      }
    } catch (error: any) {
      console.error("[Library upload]", error);
      res.status(500).json({ message: error.message || "PDF yuklanmadi" });
    }
  });

  app.patch("/api/admin/library/books/:bookId", requireAuth, requireRole(["admin"]), async (req: any, res) => {
    const allowed = ["title", "author", "description", "category", "subject", "level", "language", "coverUrl", "copyrightOwner", "licenseNote", "status"] as const;
    const changes: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of allowed) if (req.body[key] !== undefined) changes[key] = typeof req.body[key] === "string" ? req.body[key].trim() || null : req.body[key];
    if (req.body.licensedUntil !== undefined) changes.licensedUntil = asDate(req.body.licensedUntil);
    if (changes.status && !["active", "archived"].includes(String(changes.status))) return res.status(400).json({ message: "Noto'g'ri holat" });
    const [book] = await db.update(libraryBooks).set(changes).where(eq(libraryBooks.id, req.params.bookId)).returning();
    if (!book) return res.status(404).json({ message: "Kitob topilmadi" });
    if (book.status !== "active") {
      const assignments = await db.select({ id: libraryAssignments.id }).from(libraryAssignments).where(eq(libraryAssignments.bookId, book.id));
      if (assignments.length) await db.update(libraryViewSessions).set({ status: "revoked", revokedAt: new Date() }).where(inArray(libraryViewSessions.assignmentId, assignments.map(a => a.id)));
    }
    await audit(req, { action: "book.update", bookId: book.id, result: "success", metadata: { fields: Object.keys(changes) } });
    res.json(book);
  });

  app.get("/api/admin/library/assignments/:teacherId", requireAuth, requireRole(["admin"]), async (req, res) => {
    const rows = await db.select().from(libraryAssignments).where(eq(libraryAssignments.teacherId, String(req.params.teacherId)));
    res.json(rows);
  });

  app.put("/api/admin/library/assignments/:teacherId", requireAuth, requireRole(["admin"]), async (req: any, res) => {
    const teacherId = String(req.params.teacherId);
    const items = Array.isArray(req.body.assignments) ? req.body.assignments : [];
    const [teacher] = await db.select().from(userProfiles).where(and(eq(userProfiles.userId, teacherId), eq(userProfiles.role, "teacher")));
    if (!teacher) return res.status(404).json({ message: "O'qituvchi topilmadi" });
    const bookIds: string[] = [...new Set<string>(items.map((item: any) => String(item.bookId)))];
    if (bookIds.length) {
      const validBooks = await db.select({ id: libraryBooks.id }).from(libraryBooks).where(inArray(libraryBooks.id, bookIds));
      if (validBooks.length !== bookIds.length) return res.status(400).json({ message: "Noto'g'ri kitob tanlangan" });
    }
    let normalizedItems: Array<any>;
    try {
      normalizedItems = items.map((item: any) => {
        const numericLimit = Number(item.maxOpens);
        if (item.maxOpens !== null && item.maxOpens !== "" && (!Number.isFinite(numericLimit) || numericLimit < 1)) throw new Error("Kirish limiti noto'g'ri");
        const startsAt = asDate(item.startsAt);
        const expiresAt = asDate(item.expiresAt);
        if (startsAt && expiresAt && startsAt >= expiresAt) throw new Error("Ruxsat sanalari noto'g'ri");
        return { ...item, bookId: String(item.bookId), maxOpens: item.maxOpens === null || item.maxOpens === "" ? null : Math.min(100000, numericLimit), startsAt, expiresAt };
      });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
    const now = new Date();
    await db.transaction(async tx => {
      const existing = await tx.select().from(libraryAssignments).where(eq(libraryAssignments.teacherId, teacherId));
      const removed = existing.filter(a => !bookIds.includes(a.bookId));
      if (removed.length) {
        await tx.update(libraryAssignments).set({ status: "inactive", updatedAt: now }).where(inArray(libraryAssignments.id, removed.map(a => a.id)));
        await tx.update(libraryViewSessions).set({ status: "revoked", revokedAt: now }).where(inArray(libraryViewSessions.assignmentId, removed.map(a => a.id)));
      }
      for (const item of normalizedItems) {
        const values = {
          teacherId,
          bookId: String(item.bookId),
          maxOpens: item.maxOpens,
          maxConcurrentSessions: 1,
          startsAt: item.startsAt,
          expiresAt: item.expiresAt,
          status: "active",
          assignedBy: req.userId,
          updatedAt: now,
        };
        await tx.insert(libraryAssignments).values(values).onConflictDoUpdate({
          target: [libraryAssignments.teacherId, libraryAssignments.bookId],
          set: { ...values, ...(item.resetUsage ? { usedOpens: 0 } : {}) },
        });
      }
    });
    await audit(req, { action: "assignment.replace", teacherId, result: "success", metadata: { bookCount: items.length } });
    const assignments = await db.select().from(libraryAssignments).where(and(eq(libraryAssignments.teacherId, teacherId), eq(libraryAssignments.status, "active")));
    res.json(assignments);
  });

  app.get("/api/admin/library/audit", requireAuth, requireRole(["admin"]), async (_req, res) => {
    const logs = await db.select().from(libraryAuditLogs).orderBy(desc(libraryAuditLogs.createdAt)).limit(250);
    res.json(logs);
  });

  app.get("/api/library/me/access-summary", requireAuth, requireRole(["teacher"]), async (req: any, res) => {
    const rows = await db.select({ id: libraryAssignments.id }).from(libraryAssignments).innerJoin(libraryBooks, eq(libraryAssignments.bookId, libraryBooks.id)).where(and(eq(libraryAssignments.teacherId, req.userId), eq(libraryAssignments.status, "active"), eq(libraryBooks.status, "active")));
    res.json({ enabled: rows.length > 0, bookCount: rows.length });
  });

  app.get("/api/library/books", requireAuth, requireRole(["teacher"]), async (req: any, res) => {
    const rows = await db.select({ assignment: libraryAssignments, book: libraryBooks }).from(libraryAssignments)
      .innerJoin(libraryBooks, eq(libraryAssignments.bookId, libraryBooks.id))
      .where(and(eq(libraryAssignments.teacherId, req.userId), eq(libraryAssignments.status, "active"), eq(libraryBooks.status, "active")))
      .orderBy(desc(libraryAssignments.createdAt));
    res.json(rows.map(row => {
      const { storageKey: _storageKey, checksumSha256: _checksum, originalFileName: _fileName, uploadedBy: _uploadedBy, ...safeBook } = row.book;
      return { ...safeBook, assignment: row.assignment };
    }));
  });

  app.post("/api/library/books/:bookId/open", requireAuth, requireRole(["teacher"]), openLimiter, async (req: any, res) => {
    const [row] = await db.select({ assignment: libraryAssignments, book: libraryBooks }).from(libraryAssignments)
      .innerJoin(libraryBooks, eq(libraryAssignments.bookId, libraryBooks.id))
      .where(and(eq(libraryAssignments.teacherId, req.userId), eq(libraryAssignments.bookId, req.params.bookId), eq(libraryAssignments.status, "active"), eq(libraryBooks.status, "active")));
    const unavailable = row ? (isBookAvailable(row.book) || isAssignmentAvailable(row.assignment)) : "Kitob sizga biriktirilmagan";
    if (!row || unavailable) {
      await audit(req, { action: "view.denied", bookId: req.params.bookId, teacherId: req.userId, result: "denied", reason: unavailable || undefined });
      return res.status(403).json({ message: unavailable });
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
    const now = new Date();
    const [previousSession] = await db.select({ lastPage: libraryViewSessions.lastPage }).from(libraryViewSessions)
      .where(and(eq(libraryViewSessions.teacherId, req.userId), eq(libraryViewSessions.bookId, row.book.id)))
      .orderBy(desc(libraryViewSessions.lastSeenAt)).limit(1);
    await db.update(libraryViewSessions).set({ status: "revoked", revokedAt: now })
      .where(and(eq(libraryViewSessions.teacherId, req.userId), eq(libraryViewSessions.bookId, row.book.id), inArray(libraryViewSessions.status, ["pending", "active"])));
    const [session] = await db.insert(libraryViewSessions).values({
      assignmentId: row.assignment.id,
      teacherId: req.userId,
      bookId: row.book.id,
      tokenHash: hash(token),
      ipHash: requestIpHash(req),
      userAgentHash: hash(String(req.headers["user-agent"] || "unknown")),
      expiresAt,
      lastPage: previousSession?.lastPage || 1,
    }).returning();
    await audit(req, { action: "view.session_created", bookId: row.book.id, teacherId: req.userId, assignmentId: row.assignment.id, sessionId: session.id, result: "success" });
    res.status(201).json({ sessionId: session.id, token, expiresAt, book: { id: row.book.id, title: row.book.title, author: row.book.author, pageCount: row.book.pageCount }, lastPage: session.lastPage });
  });

  app.get("/api/library/view/:sessionId/file", requireAuth, requireRole(["teacher"]), viewerLimiter, async (req: any, res) => {
    try {
      let context = await sessionContext(req);
      if (!context) return res.status(403).json({ message: "Sessiya yaroqsiz yoki muddati tugagan" });
      if (!context.session.countConsumed) {
        await activateSession(context.session.id);
        context = await sessionContext(req);
        if (!context) return res.status(403).json({ message: "Sessiya faollashtirilmadi" });
        await audit(req, { action: "view.open", bookId: context.book.id, teacherId: req.userId, assignmentId: context.assignment.id, sessionId: context.session.id, result: "success" });
      }
      const target = await watermarkedFile(context.session, context.book, context.teacherName || "O'qituvchi");
      const stat = await fs.stat(target);
      setPdfSecurityHeaders(res);
      const range = req.headers.range;
      if (range) {
        const parsedRange = parseSingleByteRange(range, stat.size);
        if (!parsedRange) return res.status(416).set({ "Accept-Ranges": "bytes", "Content-Range": `bytes */${stat.size}` }).end();
        const { start, end } = parsedRange;
        res.status(206).set({ "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": String(end - start + 1) });
        return createReadStream(target, { start, end }).pipe(res);
      }
      res.set({ "Accept-Ranges": "bytes", "Content-Length": String(stat.size) });
      return createReadStream(target).pipe(res);
    } catch (error: any) {
      console.error("[Library viewer]", error);
      await audit(req, { action: "view.error", sessionId: req.params.sessionId, result: "error", reason: error.message });
      res.status(403).json({ message: error.message || "PDF ochilmadi" });
    }
  });

  app.patch("/api/library/view/:sessionId/progress", requireAuth, requireRole(["teacher"]), async (req: any, res) => {
    const context = await sessionContext(req);
    if (!context) return res.status(403).json({ message: "Sessiya yaroqsiz" });
    const page = Math.max(1, Math.min(context.book.pageCount, Number(req.body.page) || 1));
    await db.update(libraryViewSessions).set({ lastPage: page, lastSeenAt: new Date() }).where(eq(libraryViewSessions.id, context.session.id));
    res.json({ page });
  });
}
