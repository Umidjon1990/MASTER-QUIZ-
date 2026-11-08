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

test("groups, server-graded links, unified results, ranking and teacher statistics", async () => {
  const pglite = await PGlite.create();
  await pglite.waitReady;
  const port = await freePort();
  const socketServer = new PGLiteSocketServer({ db: pglite, host: "127.0.0.1", port });
  await socketServer.start();
  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  process.env.NODE_ENV = "test";

  const { runMigrations, pool } = await import("../server/db");
  const { initTeacherPanel, registerTeacherPanel } = await import("../server/teacher-panel");
  const { registerTeacherWork } = await import("../server/teacher-work");
  const { registerSharedTest } = await import("../server/shared-test");
  let httpServer: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  try {
    await runMigrations();
    await initTeacherPanel();
    await pool.query(`INSERT INTO user_profiles (user_id, role, display_name, is_active) VALUES
      ('admin-1','admin','Admin',true),('t1','teacher','Ustoz A',true),('t2','teacher','Ustoz B',true)`);
    await pool.query(`INSERT INTO quizzes (id,title,creator_id,total_questions,status,time_per_question,show_correct_answers)
      VALUES ('q1','1-dars · Oila','t1',3,'published',20,true),('q9','Boshqa','t2',1,'published',20,true)`);
    await pool.query(`INSERT INTO questions (id,quiz_id,order_index,type,question_text,options,correct_answer,points,time_limit,config) VALUES
      ('a1','q1',0,'multiple_choice','Ota?','["ota","ona"]'::jsonb,'ota',100,20,null),
      ('a2','q1',1,'multiple_choice','Ona?','["ota","ona"]'::jsonb,'ona',100,20,null),
      ('a3','q1',2,'match','Juftlang','[]'::jsonb,'x',100,20,'{"pairs":[{"left":"أب","right":"ota"},{"left":"أم","right":"ona"},{"left":"أخ","right":"aka"}]}'::jsonb)`);

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
        next();
      };
    registerTeacherPanel(app, requireAuth, requireRole);
    registerTeacherWork(app, requireAuth, requireRole);
    registerSharedTest(app);
    httpServer = app.listen(0, "127.0.0.1");
    await once(httpServer, "listening");
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const call = async (user: string | null, path: string, method = "GET", body?: any) => {
      const r = await fetch(base + path, {
        method,
        headers: { ...(user ? { "x-test-user": user } : {}), "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, data: await r.json() };
    };

    // Guruh: ismlar takrorlanmaydi, bo'sh joylar tozalanadi.
    const created = await call("t1", "/api/teacher-panel/groups", "POST", {
      name: "7-B",
      students: ["Ali  Valiyev", "Zuhra Karimova", "Ali Valiyev", "Bobur"],
    });
    assert.equal(created.status, 201);
    const gid = created.data.id;
    assert.equal((await call("t2", `/api/teacher-panel/groups/${gid}`)).status, 404, "boshqa o'qituvchi guruhni ko'rmaydi");
    assert.equal((await call("t1", `/api/teacher-panel/groups/${gid}/students`, "POST", { names: ["bobur", "Dilnoza"] })).data.added, 1);
    let group = (await call("t1", `/api/teacher-panel/groups/${gid}`)).data;
    assert.deepEqual(group.students.map((s: any) => s.name), ["Ali Valiyev", "Zuhra Karimova", "Bobur", "Dilnoza"]);

    // Faqat o'z testiga va o'z guruhiga havola.
    assert.equal((await call("t1", "/api/teacher-panel/quizzes/q9/links", "POST", {})).status, 404);
    assert.equal((await call("t2", "/api/teacher-panel/quizzes/q9/links", "POST", { groupId: gid })).status, 404);
    const link = (await call("t1", "/api/teacher-panel/quizzes/q1/links", "POST", { groupId: gid })).data;
    assert.match(link.code, /^[A-Z0-9]{6,7}$/);

    // O'quvchi sahifasi: to'g'ri javoblar yo'q, juftlar aralashtirilgan, ro'yxat bor.
    const page = (await call(null, `/api/shared/${link.code}`)).data;
    assert.equal(page.group.name, "7-B");
    assert.equal(page.group.students.length, 4);
    for (const q of page.questions) assert.ok(!("correctAnswer" in q), "javob oshkor bo'lmaydi");
    assert.ok(!JSON.stringify(page).includes('"correct'), JSON.stringify(page).slice(0, 200));
    assert.deepEqual(page.questions[2].config.pairs.map((p: any) => p.left), ["أب", "أم", "أخ"]);
    assert.deepEqual([...page.questions[2].config.pairs.map((p: any) => p.right)].sort(), ["aka", "ona", "ota"]);

    // Ro'yxatda yo'q odam boshlay olmaydi.
    assert.equal((await call(null, `/api/shared/${link.code}/start`, "POST", { playerName: "Begona" })).status, 400);
    const ids = Object.fromEntries(page.group.students.map((s: any) => [s.name, s.id]));
    const play = async (name: string, answers: [string, any][]) => {
      const start = (await call(null, `/api/shared/${link.code}/start`, "POST", { studentId: ids[name] })).data;
      for (const [qid, ans] of answers) {
        const r = await call(null, `/api/shared/${link.code}/answer`, "POST", { attemptId: start.id, questionId: qid, answer: ans, timeSpent: 2 });
        assert.equal(r.status, 200);
      }
      return (await call(null, `/api/shared/${link.code}/submit`, "POST", { attemptId: start.id, score: 999999, correctAnswers: 99 })).data;
    };
    const ali = await play("Ali Valiyev", [
      ["a1", "ota"],
      ["a2", "ona"],
      ["a3", JSON.stringify({ "أب": "ota", "أم": "ona", "أخ": "aka" })],
    ]);
    assert.equal(ali.correctAnswers, 3, "natija serverda hisoblanadi, mijoz yuborgan ball e'tiborsiz");
    assert.ok(ali.score < 999999);
    // Javob tekshiruvi to'g'ri javobni (ruxsat bo'lsa) qaytaradi va birinchi javob o'zgarmaydi.
    const zStart = (await call(null, `/api/shared/${link.code}/start`, "POST", { studentId: ids["Zuhra Karimova"] })).data;
    const wrong = (await call(null, `/api/shared/${link.code}/answer`, "POST", { attemptId: zStart.id, questionId: "a1", answer: "ona" })).data;
    assert.deepEqual([wrong.isCorrect, wrong.correctAnswer], [false, "ota"]);
    const retry = (await call(null, `/api/shared/${link.code}/answer`, "POST", { attemptId: zStart.id, questionId: "a1", answer: "ota" })).data;
    assert.equal(retry.isCorrect, false, "qayta yuborish natijani o'zgartirmaydi");
    // Chiqib ketib qaytsa — o'sha urinish, javob berilgan savollar bilan.
    const resumed = (await call(null, `/api/shared/${link.code}/start`, "POST", { studentId: ids["Zuhra Karimova"] })).data;
    assert.equal(resumed.id, zStart.id);
    assert.deepEqual(resumed.answered, ["a1"]);
    await call(null, `/api/shared/${link.code}/answer`, "POST", { attemptId: zStart.id, questionId: "a2", answer: "ona" });
    await call(null, `/api/shared/${link.code}/submit`, "POST", { attemptId: zStart.id });
    // Ikkinchi marta ishlash mumkin emas.
    assert.equal((await call(null, `/api/shared/${link.code}/start`, "POST", { studentId: ids["Ali Valiyev"] })).status, 409);
    assert.equal((await call(null, `/api/shared/${link.code}`)).data.group.students.find((s: any) => s.name === "Ali Valiyev").done, true);

    // Natijalar: reyting, ishlamaganlar.
    const runs = (await call("t1", "/api/teacher-panel/results")).data.runs;
    assert.equal(runs.length, 1);
    assert.deepEqual([runs[0].kind, runs[0].participants, runs[0].expected, runs[0].group.name], ["group", 2, 4, "7-B"]);
    const detail = (await call("t1", `/api/teacher-panel/results/group/${link.id}`)).data;
    assert.deepEqual(detail.rows.map((r: any) => [r.rank, r.name, r.correct, r.percent]), [
      [1, "Ali Valiyev", 3, 100],
      [2, "Zuhra Karimova", 1, 33],
    ]);
    assert.deepEqual(detail.missing, ["Bobur", "Dilnoza"]);
    assert.equal((await call("t2", `/api/teacher-panel/results/group/${link.id}`)).status, 404);

    // Guruh jadvali va reytingi.
    group = (await call("t1", `/api/teacher-panel/groups/${gid}`)).data;
    assert.equal(group.results[ids["Ali Valiyev"]][link.id], 100);
    assert.deepEqual(group.rating.slice(0, 2).map((r: any) => [r.name, r.avgPercent]), [
      ["Ali Valiyev", 100],
      ["Zuhra Karimova", 33],
    ]);

    // Umumiy havola: ism yoziladi; muddati o'tgan havola yopiq.
    const open = (await call("t1", "/api/teacher-panel/quizzes/q1/links", "POST", {})).data;
    assert.equal((await call(null, `/api/shared/${open.code}`)).data.group, null);
    assert.equal((await call(null, `/api/shared/${open.code}/start`, "POST", { playerName: "Mehmon" })).status, 200);
    await pool.query("UPDATE shared_quizzes SET closes_at=now()-interval '1 minute' WHERE id=$1", [open.id]);
    assert.equal((await call(null, `/api/shared/${open.code}`)).status, 403);
    assert.equal((await call("t1", "/api/teacher-panel/quizzes/q1/links", "POST", { closesAt: "2020-01-01T00:00:00Z" })).status, 400);

    // Jonli o'yin natijalari ham shu ro'yxatda.
    await pool.query(`INSERT INTO quiz_results(session_id,quiz_id,participant_id,guest_name,total_score,correct_answers,total_questions,rank)
      VALUES ('room-1','q1','p1','Sardor',250,2,3,1),('room-1','q1','p2','Malika',300,3,3,2)`);
    const all = (await call("t1", "/api/teacher-panel/results")).data.runs;
    assert.ok(all.some((r: any) => r.kind === "scheduled" && r.participants === 2));
    const live = (await call("t1", "/api/teacher-panel/results/scheduled/room-1")).data;
    assert.deepEqual(live.rows.map((r: any) => r.name), ["Malika", "Sardor"], "reyting to'g'ri javoblar bo'yicha");

    // Statistika.
    const stats = (await call("t1", "/api/teacher-panel/stats")).data;
    assert.equal(stats.runs, 2);
    assert.equal(stats.participants, 4);
    assert.equal(stats.groups, 1);
    assert.equal(stats.topQuizzes[0].title, "1-dars · Oila");
    const adminStats = (await call("admin-1", "/api/admin/teacher-stats")).data.teachers;
    assert.deepEqual(adminStats.map((t: any) => [t.name, t.runs]), [
      ["Ustoz A", 2],
      ["Ustoz B", 0],
    ]);
    assert.equal((await call("t1", "/api/admin/teacher-stats")).status, 403);

    // Guruh arxivlansa, havolasi yopiladi, natijalar saqlanadi.
    await call("t1", `/api/teacher-panel/groups/${gid}`, "DELETE");
    assert.equal((await call(null, `/api/shared/${link.code}`)).status, 403);
    assert.equal((await call("t1", `/api/teacher-panel/results/group/${link.id}`)).data.rows.length, 2);
  } finally {
    if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
    await pool.end();
    await socketServer.stop();
    await pglite.close();
  }
});
