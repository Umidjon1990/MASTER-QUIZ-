import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import express, { type RequestHandler } from "express";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

async function freePort(): Promise<number> {
  const probe = createNetServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  return port;
}

test("teachers use published library quizzes through their own unchanged copies", async () => {
  const pglite = await PGlite.create();
  await pglite.waitReady;
  const port = await freePort();
  const socketServer = new PGLiteSocketServer({ db: pglite, host: "127.0.0.1", port });
  await socketServer.start();
  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  process.env.NODE_ENV = "test";

  const { runMigrations, pool } = await import("../server/db");
  const { initTeacherPanel, registerTeacherPanel } = await import("../server/teacher-panel");
  const { isTeacherLocked } = await import("../server/teacher-policy");
  let httpServer: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  try {
    await runMigrations();
    await initTeacherPanel();
    await pool.query(`INSERT INTO user_profiles (user_id, role, display_name, is_active) VALUES
      ('admin-1','admin','Admin',true),('teacher-1','teacher','Ustoz A',true),('teacher-2','teacher','Ustoz B',true)`);
    await pool.query(`INSERT INTO quiz_folders (id,name,creator_id,sort_order) VALUES
      ('f-cefr','CEFR 1','admin-1',1),('f-draft','Qoralama','admin-1',2)`);
    await pool.query(`INSERT INTO quizzes (id,title,creator_id,total_questions,status,folder_id,order_in_folder,time_per_question)
      VALUES ('q1','1-dars','admin-1',2,'draft','f-cefr',1,20),('q2','Yashirin','admin-1',1,'draft','f-draft',1,30)`);
    await pool.query(`INSERT INTO questions (id,quiz_id,order_index,type,question_text,options,correct_answer) VALUES
      ('a1','q1',0,'multiple_choice','Ota?','["ota","ona"]'::jsonb,'ota'),
      ('a2','q1',1,'multiple_choice','Ona?','["ota","ona"]'::jsonb,'ona'),
      ('b1','q2',0,'multiple_choice','X?','["x","y"]'::jsonb,'x')`);

    const app = express();
    app.use(express.json());
    const requireAuth: RequestHandler = (req: any, res, next) => {
      const user = String(req.header("x-test-user") || "");
      if (!user) return res.status(401).json({ message: "auth" });
      req.userId = user;
      next();
    };
    const requireRole =
      (roles: string[]): RequestHandler =>
      async (req: any, res, next) => {
        const p = (await pool.query("SELECT role FROM user_profiles WHERE user_id=$1", [req.userId])).rows[0];
        if (!p || !roles.includes(p.role)) return res.status(403).json({ message: "Forbidden" });
        req.userProfile = p;
        next();
      };
    registerTeacherPanel(app, requireAuth, requireRole);
    httpServer = app.listen(0, "127.0.0.1");
    await once(httpServer, "listening");
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const call = async (user: string, path: string, method = "GET", body?: any) => {
      const r = await fetch(base + path, {
        method,
        headers: { "x-test-user": user, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, data: await r.json() };
    };

    // Hech narsa nashr qilinmagan — kutubxona bo'sh, nashr qilinmagan testni ochib bo'lmaydi.
    assert.deepEqual((await call("teacher-1", "/api/teacher-panel/library")).data.folders, []);
    assert.equal((await call("teacher-1", "/api/teacher-panel/library/q1/open", "POST")).status, 404);
    assert.equal((await call("teacher-1", "/api/admin/teacher-library", "PUT", { folderIds: ["f-cefr"] })).status, 403);

    const adminList = await call("admin-1", "/api/admin/teacher-library");
    assert.equal(adminList.data.folders.length, 2);
    assert.equal((await call("admin-1", "/api/admin/teacher-library", "PUT", { folderIds: ["f-cefr"] })).status, 200);

    const lib = (await call("teacher-1", "/api/teacher-panel/library")).data.folders;
    assert.equal(lib.length, 1);
    assert.equal(lib[0].name, "CEFR 1");
    assert.deepEqual(lib[0].quizzes.map((q: any) => q.id), ["q1"]);
    assert.equal((await call("teacher-1", "/api/teacher-panel/library/q2/open", "POST")).status, 404);

    // Birinchi ochilishda nusxa yaratiladi, ikkinchisida o'sha nusxa qaytadi.
    const first = (await call("teacher-1", "/api/teacher-panel/library/q1/open", "POST")).data.quizId;
    const again = (await call("teacher-1", "/api/teacher-panel/library/q1/open", "POST")).data.quizId;
    assert.equal(first, again);
    assert.notEqual(first, "q1");
    const other = (await call("teacher-2", "/api/teacher-panel/library/q1/open", "POST")).data.quizId;
    assert.notEqual(other, first);

    const detail = (await call("teacher-1", "/api/teacher-panel/quizzes/" + first)).data;
    assert.equal(detail.title, "1-dars");
    assert.equal(detail.questions.length, 2);
    assert.equal(detail.questions[0].text, "Ota?");
    assert.equal(detail.library.outdated, false);
    assert.equal(detail.timePerQuestion, 20);
    // Boshqa o'qituvchining nusxasi ko'rinmaydi.
    assert.equal((await call("teacher-2", "/api/teacher-panel/quizzes/" + first)).status, 404);
    // Nusxa "Mening quizlarim"ga tushmaydi.
    assert.deepEqual((await call("teacher-1", "/api/teacher-panel/mine")).data.folders, []);
    const copy = (await pool.query("SELECT creator_id,status,is_public,folder_id FROM quizzes WHERE id=$1", [first])).rows[0];
    assert.deepEqual(copy, { creator_id: "teacher-1", status: "published", is_public: false, folder_id: null });

    // Admin testni o'zgartirsa: eski nusxa "eskirgan" deb ko'rinadi, keyingi ochilishda yangi nusxa beriladi.
    await pool.query("UPDATE questions SET question_text='Otasi?' WHERE id='a1'");
    assert.equal((await call("teacher-1", "/api/teacher-panel/quizzes/" + first)).data.library.outdated, true);
    const fresh = (await call("teacher-1", "/api/teacher-panel/library/q1/open", "POST")).data.quizId;
    assert.notEqual(fresh, first);
    assert.equal((await call("teacher-1", "/api/teacher-panel/quizzes/" + fresh)).data.questions[0].text, "Otasi?");
    assert.equal((await call("teacher-1", "/api/teacher-panel/quizzes/" + first)).status, 200, "eski nusxa tarixda qoladi");

    // O'qituvchi uchun test tuzish va o'zgartirish yopiq; ishlatish ochiq.
    for (const [m, p] of [
      ["POST", "/api/quizzes"],
      ["PATCH", "/api/quizzes/x"],
      ["DELETE", "/api/quizzes/x"],
      ["POST", "/api/quizzes/x/questions"],
      ["POST", "/api/quizzes/x/import"],
      ["PATCH", "/api/questions/x"],
      ["POST", "/api/question-bank/from-quiz/x"],
    ])
      assert.ok(isTeacherLocked(m, p), m + " " + p);
    for (const [m, p] of [
      ["POST", "/api/quizzes/x/share"],
      ["POST", "/api/quizzes/x/schedule"],
      ["POST", "/api/quizzes/x/cancel-schedule"],
      ["GET", "/api/quizzes/x"],
    ])
      assert.ok(!isTeacherLocked(m, p), m + " " + p);
  } finally {
    if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
    await pool.end();
    await socketServer.stop();
    await pglite.close();
  }
});
