// O'qituvchining ishi: guruhlar (Sinflarim), havolalar, yagona natijalar ro'yxati va statistika.
// O'quvchilarga akkaunt kerak emas: guruh — ismlar ro'yxati, o'quvchi havolani ochib ro'yxatdan o'z ismini tanlaydi.
import { randomBytes } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { pool } from "./db";

type RoleMiddleware = (roles: string[]) => RequestHandler;
const run =
  (fn: (req: any, res: any) => Promise<any>): RequestHandler =>
  (req, res, next) =>
    void fn(req, res).catch(next);

const names = z
  .array(z.string().trim().min(1).max(100))
  .max(200)
  .transform((list) => [...new Set(list.map((n) => n.replace(/\s+/g, " ")))]);
const pct = (correct: number, total: number) => (total > 0 ? Math.round((correct / total) * 100) : 0);

async function ownGroup(teacherId: string, groupId: string) {
  return (
    await pool.query("SELECT id,name,created_at FROM teacher_groups WHERE id=$1 AND teacher_id=$2 AND archived_at IS NULL", [
      groupId,
      teacherId,
    ])
  ).rows[0] as { id: string; name: string; created_at: Date } | undefined;
}

/** Barcha o'tkazishlar: jonli/vaqtli o'yinlar (quiz_results) va havolalar (shared_quizzes). */
async function listRuns(teacherId: string, filter: { groupId?: string; limit?: number } = {}) {
  const params: any[] = [teacherId];
  const groupFilter = filter.groupId ? (params.push(filter.groupId), `AND s.group_id=$${params.length}`) : "";
  const sessions = filter.groupId
    ? []
    : (
        await pool.query(
          `SELECT r.session_id AS id,r.quiz_id,q.title,min(r.completed_at) AS at,count(*)::int AS participants,
             avg(CASE WHEN r.total_questions>0 THEN r.correct_answers::float/r.total_questions END) AS avg,
             EXISTS(SELECT 1 FROM live_sessions l WHERE l.id=r.session_id) AS live
           FROM quiz_results r JOIN quizzes q ON q.id=r.quiz_id
           WHERE q.creator_id=$1 GROUP BY r.session_id,r.quiz_id,q.title`,
          [teacherId],
        )
      ).rows.map((r) => ({
        id: r.id,
        kind: r.live ? "live" : "scheduled",
        quizId: r.quiz_id,
        title: r.title,
        at: r.at,
        participants: r.participants,
        expected: null as number | null,
        avgPercent: Math.round((r.avg || 0) * 100),
        group: null as null | { id: string; name: string },
        code: null as string | null,
        isActive: false,
        closesAt: null as Date | null,
      }));
  const shared = (
    await pool.query(
      `SELECT s.id,s.code,s.quiz_id,q.title,s.created_at,s.is_active,s.closes_at,s.group_id,g.name AS group_name,
         count(a.id) FILTER (WHERE a.completed_at IS NOT NULL)::int AS participants,
         avg(CASE WHEN a.completed_at IS NOT NULL AND a.total_questions>0 THEN a.correct_answers::float/a.total_questions END) AS avg,
         (SELECT count(*)::int FROM teacher_group_students st WHERE st.group_id=s.group_id AND st.removed_at IS NULL) AS expected
       FROM shared_quizzes s JOIN quizzes q ON q.id=s.quiz_id
       LEFT JOIN teacher_groups g ON g.id=s.group_id
       LEFT JOIN shared_quiz_attempts a ON a.shared_quiz_id=s.id
       WHERE s.creator_id=$1 ${groupFilter}
       GROUP BY s.id,q.title,g.name`,
      params,
    )
  ).rows.map((r) => ({
    id: r.id,
    kind: r.group_id ? "group" : "link",
    quizId: r.quiz_id,
    title: r.title,
    at: r.created_at,
    participants: r.participants,
    expected: r.group_id ? r.expected : null,
    avgPercent: Math.round((r.avg || 0) * 100),
    group: r.group_id ? { id: r.group_id, name: r.group_name } : null,
    code: r.code,
    isActive: r.is_active,
    closesAt: r.closes_at,
  }));
  const all = [...sessions, ...shared].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return filter.limit ? all.slice(0, filter.limit) : all;
}

async function runDetail(teacherId: string, kind: string, id: string) {
  if (kind === "live" || kind === "scheduled") {
    const rows = (
      await pool.query(
        `SELECT r.guest_name,r.correct_answers,r.total_questions,r.total_score,r.completed_at,q.title,q.id AS quiz_id
         FROM quiz_results r JOIN quizzes q ON q.id=r.quiz_id WHERE r.session_id=$1 AND q.creator_id=$2`,
        [id, teacherId],
      )
    ).rows;
    if (!rows.length) return null;
    return {
      kind,
      title: rows[0].title,
      quizId: rows[0].quiz_id,
      at: rows.reduce((m, r) => (r.completed_at < m ? r.completed_at : m), rows[0].completed_at),
      group: null,
      missing: [] as string[],
      rows: rows.map((r) => ({
        name: r.guest_name || "Ishtirokchi",
        correct: r.correct_answers,
        total: r.total_questions,
        score: r.total_score,
        finishedAt: r.completed_at,
      })),
    };
  }
  const link = (
    await pool.query(
      `SELECT s.id,s.code,s.created_at,s.group_id,g.name AS group_name,q.title,q.id AS quiz_id
       FROM shared_quizzes s JOIN quizzes q ON q.id=s.quiz_id LEFT JOIN teacher_groups g ON g.id=s.group_id
       WHERE s.id=$1 AND s.creator_id=$2`,
      [id, teacherId],
    )
  ).rows[0];
  if (!link) return null;
  const attempts = (
    await pool.query(
      `SELECT a.player_name,a.student_id,a.correct_answers,a.total_questions,a.score,a.completed_at
       FROM shared_quiz_attempts a WHERE a.shared_quiz_id=$1 AND a.completed_at IS NOT NULL`,
      [link.id],
    )
  ).rows;
  let missing: string[] = [];
  if (link.group_id) {
    const done = new Set(attempts.map((a) => a.student_id));
    missing = (
      await pool.query(
        "SELECT id,name FROM teacher_group_students WHERE group_id=$1 AND removed_at IS NULL ORDER BY sort_order,name",
        [link.group_id],
      )
    ).rows
      .filter((s) => !done.has(s.id))
      .map((s) => s.name);
  }
  return {
    kind: link.group_id ? "group" : "link",
    title: link.title,
    quizId: link.quiz_id,
    at: link.created_at,
    code: link.code,
    group: link.group_id ? { id: link.group_id, name: link.group_name } : null,
    missing,
    rows: attempts.map((a) => ({
      name: a.player_name,
      correct: a.correct_answers,
      total: a.total_questions,
      score: a.score,
      finishedAt: a.completed_at,
    })),
  };
}

/** Reyting: ko'proq to'g'ri javob, keyin ko'proq ball, keyin oldin tugatgan. */
export function rank<T extends { correct: number; total: number; score: number; finishedAt: Date | string }>(rows: T[]) {
  return [...rows]
    .sort(
      (a, b) =>
        pct(b.correct, b.total) - pct(a.correct, a.total) ||
        b.score - a.score ||
        new Date(a.finishedAt).getTime() - new Date(b.finishedAt).getTime(),
    )
    .map((r, i) => ({ ...r, rank: i + 1, percent: pct(r.correct, r.total) }));
}

async function teacherStats(teacherId: string) {
  const runs = (await listRuns(teacherId)).filter((r) => r.participants > 0);
  const participants = runs.reduce((n, r) => n + r.participants, 0);
  const avg = participants ? Math.round(runs.reduce((n, r) => n + r.avgPercent * r.participants, 0) / participants) : 0;
  const monthAgo = Date.now() - 30 * 86400000;
  const byTitle = new Map<string, { title: string; runs: number; participants: number }>();
  for (const r of runs) {
    const t = byTitle.get(r.title) || { title: r.title, runs: 0, participants: 0 };
    t.runs += 1;
    t.participants += r.participants;
    byTitle.set(r.title, t);
  }
  const groups = Number(
    (await pool.query("SELECT count(*)::int AS n FROM teacher_groups WHERE teacher_id=$1 AND archived_at IS NULL", [teacherId]))
      .rows[0].n,
  );
  const hardest = (
    await pool.query(
      `SELECT q.question_text AS text,avg(t.ok::int) AS rate,count(*)::int AS answers FROM (
         SELECT sa.question_id AS qid,sa.is_correct AS ok FROM session_answers sa
           JOIN live_sessions ls ON ls.id=sa.session_id JOIN quizzes z ON z.id=ls.quiz_id WHERE z.creator_id=$1
         UNION ALL
         SELECT e.key,(e.value->>'isCorrect')::boolean FROM shared_quiz_attempts a
           JOIN shared_quizzes s ON s.id=a.shared_quiz_id, jsonb_each(COALESCE(a.answers,'{}'::jsonb)) e
           WHERE s.creator_id=$1 AND a.completed_at IS NOT NULL
       ) t JOIN questions q ON q.id=t.qid WHERE q.type<>'poll'
       GROUP BY q.question_text HAVING count(*)>=3 AND avg(t.ok::int)<0.8 ORDER BY avg(t.ok::int),count(*) DESC LIMIT 5`,
      [teacherId],
    )
  ).rows.map((r) => ({ text: r.text, percent: Math.round(Number(r.rate) * 100), answers: r.answers }));
  return {
    runs: runs.length,
    runsThisMonth: runs.filter((r) => new Date(r.at).getTime() >= monthAgo).length,
    participants,
    avgPercent: avg,
    quizzesUsed: byTitle.size,
    groups,
    lastRunAt: runs[0]?.at || null,
    topQuizzes: [...byTitle.values()].sort((a, b) => b.runs - a.runs || b.participants - a.participants).slice(0, 5),
    recent: runs.slice(0, 5),
    hardest,
  };
}

export function registerTeacherWork(app: Express, requireAuth: RequestHandler, requireRole: RoleMiddleware) {
  const teacher = [requireAuth, requireRole(["teacher", "admin"])];

  // ---- Sinflarim ----
  app.get(
    "/api/teacher-panel/groups",
    ...teacher,
    run(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT g.id,g.name,g.created_at,
           (SELECT count(*)::int FROM teacher_group_students s WHERE s.group_id=g.id AND s.removed_at IS NULL) AS students,
           (SELECT count(*)::int FROM shared_quizzes q WHERE q.group_id=g.id) AS tests,
           (SELECT max(a.completed_at) FROM shared_quiz_attempts a JOIN shared_quizzes q ON q.id=a.shared_quiz_id WHERE q.group_id=g.id) AS last_activity
         FROM teacher_groups g WHERE g.teacher_id=$1 AND g.archived_at IS NULL ORDER BY g.created_at DESC`,
        [req.userId],
      );
      res.json({
        groups: rows.map((r) => ({ id: r.id, name: r.name, students: r.students, tests: r.tests, lastActivity: r.last_activity })),
      });
    }),
  );

  app.post(
    "/api/teacher-panel/groups",
    ...teacher,
    run(async (req, res) => {
      const body = z.object({ name: z.string().trim().min(1).max(100), students: names.optional() }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ message: "Guruh nomini kiriting" });
      const g = (
        await pool.query("INSERT INTO teacher_groups(teacher_id,name) VALUES($1,$2) RETURNING id", [req.userId, body.data.name])
      ).rows[0];
      for (const [i, n] of (body.data.students || []).entries())
        await pool.query("INSERT INTO teacher_group_students(group_id,name,sort_order) VALUES($1,$2,$3)", [g.id, n, i]);
      res.status(201).json({ id: g.id });
    }),
  );

  app.get(
    "/api/teacher-panel/groups/:id",
    ...teacher,
    run(async (req, res) => {
      const g = await ownGroup(req.userId, req.params.id);
      if (!g) return res.status(404).json({ message: "Guruh topilmadi" });
      const students = (
        await pool.query(
          "SELECT id,name FROM teacher_group_students WHERE group_id=$1 AND removed_at IS NULL ORDER BY sort_order,name",
          [g.id],
        )
      ).rows;
      const tests = await listRuns(req.userId, { groupId: g.id });
      const attempts = (
        await pool.query(
          `SELECT a.shared_quiz_id,a.student_id,a.correct_answers,a.total_questions FROM shared_quiz_attempts a
           JOIN shared_quizzes s ON s.id=a.shared_quiz_id WHERE s.group_id=$1 AND a.completed_at IS NOT NULL AND a.student_id IS NOT NULL`,
          [g.id],
        )
      ).rows;
      const results: Record<string, Record<string, number>> = {};
      for (const a of attempts) (results[a.student_id] ||= {})[a.shared_quiz_id] = pct(a.correct_answers, a.total_questions);
      const rating = students
        .map((s) => {
          const vals = Object.values(results[s.id] || {});
          return {
            id: s.id,
            name: s.name,
            done: vals.length,
            avgPercent: vals.length ? Math.round(vals.reduce((n, v) => n + v, 0) / vals.length) : null,
          };
        })
        .sort((a, b) => (b.avgPercent ?? -1) - (a.avgPercent ?? -1) || b.done - a.done || a.name.localeCompare(b.name, "uz"));
      res.json({ id: g.id, name: g.name, students, tests, results, rating });
    }),
  );

  app.patch(
    "/api/teacher-panel/groups/:id",
    ...teacher,
    run(async (req, res) => {
      const body = z.object({ name: z.string().trim().min(1).max(100) }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ message: "Guruh nomini kiriting" });
      if (!(await ownGroup(req.userId, req.params.id))) return res.status(404).json({ message: "Guruh topilmadi" });
      await pool.query("UPDATE teacher_groups SET name=$2 WHERE id=$1", [req.params.id, body.data.name]);
      res.json({ success: true });
    }),
  );

  app.delete(
    "/api/teacher-panel/groups/:id",
    ...teacher,
    run(async (req, res) => {
      if (!(await ownGroup(req.userId, req.params.id))) return res.status(404).json({ message: "Guruh topilmadi" });
      // Natijalar saqlanib qoladi; guruh va uning havolalari yopiladi.
      await pool.query("UPDATE teacher_groups SET archived_at=now() WHERE id=$1", [req.params.id]);
      await pool.query("UPDATE shared_quizzes SET is_active=false WHERE group_id=$1", [req.params.id]);
      res.json({ success: true });
    }),
  );

  app.post(
    "/api/teacher-panel/groups/:id/students",
    ...teacher,
    run(async (req, res) => {
      const body = z.object({ names }).safeParse(req.body);
      if (!body.success || !body.data.names.length) return res.status(400).json({ message: "Kamida bitta ism kiriting" });
      if (!(await ownGroup(req.userId, req.params.id))) return res.status(404).json({ message: "Guruh topilmadi" });
      const existing = new Set(
        (await pool.query("SELECT name FROM teacher_group_students WHERE group_id=$1 AND removed_at IS NULL", [req.params.id])).rows.map(
          (r) => r.name.toLocaleLowerCase("uz"),
        ),
      );
      const start = Number(
        (await pool.query("SELECT COALESCE(max(sort_order),-1)+1 AS n FROM teacher_group_students WHERE group_id=$1", [req.params.id]))
          .rows[0].n,
      );
      let added = 0;
      for (const n of body.data.names) {
        if (existing.has(n.toLocaleLowerCase("uz"))) continue;
        await pool.query("INSERT INTO teacher_group_students(group_id,name,sort_order) VALUES($1,$2,$3)", [req.params.id, n, start + added]);
        added += 1;
      }
      res.json({ added });
    }),
  );

  app.delete(
    "/api/teacher-panel/groups/:id/students/:studentId",
    ...teacher,
    run(async (req, res) => {
      if (!(await ownGroup(req.userId, req.params.id))) return res.status(404).json({ message: "Guruh topilmadi" });
      await pool.query("UPDATE teacher_group_students SET removed_at=now() WHERE id=$1 AND group_id=$2", [
        req.params.studentId,
        req.params.id,
      ]);
      res.json({ success: true });
    }),
  );

  // ---- Havola yaratish (umumiy yoki guruhga, ixtiyoriy muddat bilan) ----
  app.post(
    "/api/teacher-panel/quizzes/:quizId/links",
    ...teacher,
    run(async (req, res) => {
      const body = z
        .object({ groupId: z.string().max(64).optional().nullable(), closesAt: z.string().datetime({ offset: true }).optional().nullable() })
        .safeParse(req.body || {});
      if (!body.success) return res.status(400).json({ message: "Ma’lumot noto‘g‘ri" });
      const quiz = (await pool.query("SELECT id FROM quizzes WHERE id=$1 AND creator_id=$2", [req.params.quizId, req.userId])).rows[0];
      if (!quiz) return res.status(404).json({ message: "Test topilmadi" });
      if (body.data.groupId && !(await ownGroup(req.userId, body.data.groupId)))
        return res.status(404).json({ message: "Guruh topilmadi" });
      if (body.data.closesAt && new Date(body.data.closesAt) <= new Date())
        return res.status(400).json({ message: "Muddat kelajakda bo‘lishi kerak" });
      for (let i = 0; i < 5; i++) {
        const code = randomBytes(6).toString("base64url").replace(/[-_]/g, "").slice(0, 7).toUpperCase();
        if (code.length < 6) continue;
        try {
          const row = (
            await pool.query(
              "INSERT INTO shared_quizzes(quiz_id,creator_id,code,is_active,group_id,closes_at) VALUES($1,$2,$3,true,$4,$5) RETURNING id,code",
              [quiz.id, req.userId, code, body.data.groupId || null, body.data.closesAt || null],
            )
          ).rows[0];
          return res.status(201).json(row);
        } catch (e: any) {
          if (e.code !== "23505") throw e;
        }
      }
      res.status(503).json({ message: "Havola yaratib bo‘lmadi, qayta urinib ko‘ring" });
    }),
  );

  // ---- Natijalar ----
  app.get(
    "/api/teacher-panel/results",
    ...teacher,
    run(async (req, res) => {
      const groupId = typeof req.query.groupId === "string" && req.query.groupId ? req.query.groupId : undefined;
      res.json({ runs: await listRuns(req.userId, { groupId }) });
    }),
  );

  app.get(
    "/api/teacher-panel/results/:kind/:id",
    ...teacher,
    run(async (req, res) => {
      if (!["live", "scheduled", "link", "group"].includes(req.params.kind)) return res.status(404).json({ message: "Topilmadi" });
      const d = await runDetail(req.userId, req.params.kind, req.params.id);
      if (!d) return res.status(404).json({ message: "Natija topilmadi" });
      res.json({ ...d, rows: rank(d.rows) });
    }),
  );

  // ---- Statistika ----
  app.get(
    "/api/teacher-panel/stats",
    ...teacher,
    run(async (req, res) => res.json(await teacherStats(req.userId))),
  );

  app.get(
    "/api/admin/teacher-stats",
    requireAuth,
    requireRole(["admin"]),
    run(async (_req, res) => {
      const teachers = (
        await pool.query(
          `SELECT p.user_id,COALESCE(p.display_name,u.first_name,u.email,'O‘qituvchi') AS name,p.is_active
           FROM user_profiles p LEFT JOIN users u ON u.id=p.user_id WHERE p.role='teacher' ORDER BY name`,
        )
      ).rows;
      const out = [];
      for (const t of teachers) {
        const s = await teacherStats(t.user_id);
        out.push({
          id: t.user_id,
          name: t.name,
          isActive: t.is_active,
          runs: s.runs,
          runsThisMonth: s.runsThisMonth,
          participants: s.participants,
          avgPercent: s.avgPercent,
          groups: s.groups,
          lastRunAt: s.lastRunAt,
        });
      }
      out.sort((a, b) => b.runsThisMonth - a.runsThisMonth || b.runs - a.runs);
      res.json({ teachers: out });
    }),
  );
}
