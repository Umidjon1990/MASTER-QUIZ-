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
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

async function assertStatus(response: Response, expected: number) {
  if (response.status !== expected) assert.fail(`Expected HTTP ${expected}, received ${response.status}: ${await response.text()}`);
}

test("admin copies complete, organized quizzes to active teachers without duplicates", async () => {
  const pglite = await PGlite.create();
  await pglite.waitReady;
  const port = await freePort();
  const socketServer = new PGLiteSocketServer({ db: pglite, host: "127.0.0.1", port });
  await socketServer.start();

  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  process.env.NODE_ENV = "test";

  const { runMigrations, pool } = await import("../server/db");
  const { registerAdminQuizAssignmentRoutes } = await import("../server/admin-quiz-assignment-routes");
  let httpServer: ReturnType<ReturnType<typeof express>["listen"]> | undefined;

  try {
    await runMigrations();
    await pool.query(`INSERT INTO user_profiles (user_id, role, display_name, is_active) VALUES
      ('admin-test', 'admin', 'Bosh administrator', true),
      ('teacher-source', 'teacher', 'Manba ustoz', true),
      ('teacher-a', 'teacher', 'Yangi ustoz A', true),
      ('teacher-b', 'teacher', 'Yangi ustoz B', true),
      ('teacher-inactive', 'teacher', 'Faol emas', false)`);
    await pool.query(`INSERT INTO quiz_folders (id, name, creator_id, sort_order) VALUES ('source-folder', 'CEFR B2', 'teacher-source', 3)`);
    await pool.query(`INSERT INTO quizzes (
      id, title, description, category, cover_image, is_public, creator_id,
      timer_enabled, time_per_question, shuffle_questions, shuffle_options,
      show_correct_answers, status, scheduled_at, scheduled_status, scheduled_code,
      scheduled_room_code, scheduled_require_code, scheduled_telegram_chat_id,
      scheduled_telegram_quiz_chat_id, practice_mode, allow_replay,
      question_sections, folder_id, order_in_folder
    ) VALUES (
      'source-quiz', 'B2 Reading', 'To''liq sinov', 'English', '/media/cover.webp', true, 'teacher-source',
      true, 45, true, true, false, 'published', now() + interval '1 day', 'pending', '123456',
      'ROOM01', false, '-1001', '-1002', true, true,
      $1::jsonb, 'source-folder', 7
    )`, [JSON.stringify([{ id: "section-1", fromIndex: 1, toIndex: 2, passageTitle: "Text", passageText: "Reading passage", timePerQuestion: 60 }])]);
    await pool.query(`INSERT INTO questions (
      id, quiz_id, order_index, type, question_text, media_type, media_url,
      options, correct_answer, config, points, time_limit
    ) VALUES
      ('question-1', 'source-quiz', 0, 'multiple_choice', 'Choose', 'image', '/media/question.webp', $1::jsonb, 'B', $2::jsonb, 120, 45),
      ('question-2', 'source-quiz', 1, 'match', 'Match', null, null, null, 'matched', $3::jsonb, 200, 60)`, [
      JSON.stringify(["A", "B", "C"]),
      JSON.stringify({ accepted: ["B", "b"] }),
      JSON.stringify({ pairs: [{ left: "one", right: "bir" }] }),
    ]);
    await pool.query(`UPDATE quizzes SET total_questions = 2 WHERE id = 'source-quiz'`);

    const app = express();
    app.use(express.json());
    const requireAuth: RequestHandler = (req: any, res, next) => {
      const role = String(req.header("x-test-role") || "");
      if (!role) return res.status(401).json({ message: "auth required" });
      req.userId = role === "admin" ? "admin-test" : "teacher-source";
      req.userProfile = { role };
      next();
    };
    const requireRole = (roles: string[]): RequestHandler => (req: any, res, next) => {
      if (!roles.includes(req.userProfile?.role)) return res.status(403).json({ message: "forbidden" });
      next();
    };
    registerAdminQuizAssignmentRoutes(app, requireAuth, requireRole);
    httpServer = app.listen(0, "127.0.0.1");
    await once(httpServer, "listening");
    const address = httpServer.address();
    const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

    await assertStatus(await fetch(`${baseUrl}/api/admin/quiz-assignments/teachers`), 401);
    await assertStatus(await fetch(`${baseUrl}/api/admin/quiz-assignments`, {
      method: "POST", headers: { "content-type": "application/json", "x-test-role": "teacher" }, body: "{}",
    }), 403);

    const peopleResponse = await fetch(`${baseUrl}/api/admin/quiz-assignments/teachers`, { headers: { "x-test-role": "admin" } });
    await assertStatus(peopleResponse, 200);
    const people = await peopleResponse.json() as { sources: { userId: string }[]; targets: { userId: string }[] };
    assert.ok(people.sources.some(row => row.userId === "teacher-source"));
    assert.deepEqual(people.targets.map(row => row.userId).sort(), ["teacher-a", "teacher-b", "teacher-source"].sort());

    const sourceResponse = await fetch(`${baseUrl}/api/admin/quiz-assignments/source/teacher-source`, { headers: { "x-test-role": "admin" } });
    await assertStatus(sourceResponse, 200);
    const source = await sourceResponse.json() as { quizzes: { id: string }[]; folders: { id: string }[] };
    assert.deepEqual(source.quizzes.map(row => row.id), ["source-quiz"]);
    assert.deepEqual(source.folders.map(row => row.id), ["source-folder"]);

    const assignmentBody = JSON.stringify({
      sourceTeacherId: "teacher-source",
      sourceQuizIds: ["source-quiz"],
      targetTeacherIds: ["teacher-a", "teacher-b"],
    });
    const assignmentResponse = await fetch(`${baseUrl}/api/admin/quiz-assignments`, {
      method: "POST", headers: { "content-type": "application/json", "x-test-role": "admin" }, body: assignmentBody,
    });
    await assertStatus(assignmentResponse, 201);
    assert.deepEqual(await assignmentResponse.json(), { created: 2, skipped: 0, createdByTarget: { "teacher-a": 1, "teacher-b": 1 } });

    const copies = await pool.query(`SELECT * FROM quizzes WHERE creator_id IN ('teacher-a', 'teacher-b') ORDER BY creator_id`);
    assert.equal(copies.rowCount, 2);
    for (const copy of copies.rows) {
      assert.equal(copy.title, "B2 Reading");
      assert.equal(copy.status, "published");
      assert.equal(copy.is_public, true);
      assert.equal(copy.timer_enabled, true);
      assert.equal(copy.time_per_question, 45);
      assert.equal(copy.shuffle_questions, true);
      assert.equal(copy.shuffle_options, true);
      assert.equal(copy.show_correct_answers, false);
      assert.equal(copy.practice_mode, true);
      assert.equal(copy.allow_replay, true);
      assert.equal(copy.total_questions, 2);
      assert.equal(copy.total_plays, 0);
      assert.equal(copy.total_likes, 0);
      assert.equal(copy.scheduled_at, null);
      assert.equal(copy.scheduled_status, null);
      assert.equal(copy.scheduled_code, null);
      assert.equal(copy.scheduled_room_code, null);
      assert.equal(copy.scheduled_telegram_chat_id, null);
      assert.equal(copy.scheduled_telegram_quiz_chat_id, null);
      assert.equal(copy.question_sections[0].passageText, "Reading passage");
      const copyQuestions = await pool.query(`SELECT * FROM questions WHERE quiz_id = $1 ORDER BY order_index`, [copy.id]);
      assert.equal(copyQuestions.rowCount, 2);
      assert.notEqual(copyQuestions.rows[0].id, "question-1");
      assert.equal(copyQuestions.rows[0].media_url, "/media/question.webp");
      assert.deepEqual(copyQuestions.rows[0].options, ["A", "B", "C"]);
      assert.deepEqual(copyQuestions.rows[1].config, { pairs: [{ left: "one", right: "bir" }] });
    }

    const folders = await pool.query(`SELECT name, creator_id FROM quiz_folders WHERE creator_id IN ('teacher-a', 'teacher-b') ORDER BY creator_id`);
    assert.deepEqual(folders.rows, [
      { name: "Biriktirilgan · Manba ustoz · CEFR B2", creator_id: "teacher-a" },
      { name: "Biriktirilgan · Manba ustoz · CEFR B2", creator_id: "teacher-b" },
    ]);
    const audit = await pool.query(`SELECT * FROM admin_quiz_assignments ORDER BY target_teacher_id`);
    assert.equal(audit.rowCount, 2);
    assert.ok(audit.rows.every(row => row.assigned_by === "admin-test"));

    const duplicateResponse = await fetch(`${baseUrl}/api/admin/quiz-assignments`, {
      method: "POST", headers: { "content-type": "application/json", "x-test-role": "admin" }, body: assignmentBody,
    });
    await assertStatus(duplicateResponse, 201);
    assert.deepEqual(await duplicateResponse.json(), { created: 0, skipped: 2, createdByTarget: { "teacher-a": 0, "teacher-b": 0 } });

    const inactiveResponse = await fetch(`${baseUrl}/api/admin/quiz-assignments`, {
      method: "POST", headers: { "content-type": "application/json", "x-test-role": "admin" },
      body: JSON.stringify({ sourceTeacherId: "teacher-source", sourceQuizIds: ["source-quiz"], targetTeacherIds: ["teacher-inactive"] }),
    });
    await assertStatus(inactiveResponse, 400);
  } finally {
    if (httpServer) await new Promise<void>((resolve, reject) => httpServer!.close(error => error ? reject(error) : resolve()));
    await pool.end();
    await socketServer.stop();
    await pglite.close();
  }
});
