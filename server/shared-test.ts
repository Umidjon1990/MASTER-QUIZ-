// O'quvchi havola orqali ishlaydigan test. To'g'ri javoblar brauzerga yuborilmaydi:
// har bir javob serverda tekshiriladi va natija ham serverda hisoblanadi.
// Guruhga biriktirilgan havolada o'quvchi ro'yxatdan o'z ismini tanlaydi va testni bir marta ishlaydi.
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { pool } from "./db";
import { gradeAnswer } from "../shared/grading";

const run =
  (fn: (req: any, res: any) => Promise<any>): RequestHandler =>
  (req, res, next) =>
    void fn(req, res).catch(next);

type Link = {
  id: string;
  quiz_id: string;
  is_active: boolean;
  group_id: string | null;
  closes_at: Date | null;
};

async function findLink(code: string) {
  return (
    await pool.query(
      "SELECT id,quiz_id,is_active,group_id,closes_at FROM shared_quizzes WHERE code=$1",
      [String(code).slice(0, 12)],
    )
  ).rows[0] as Link | undefined;
}

function closedReason(link: Link | undefined) {
  if (!link) return { status: 404, message: "Test topilmadi" };
  if (!link.is_active) return { status: 403, message: "Bu test hozircha yopilgan" };
  if (link.closes_at && new Date(link.closes_at) <= new Date())
    return { status: 403, message: "Bu testni ishlash muddati tugagan" };
  return null;
}

/** O'quvchiga ko'rsatiladigan savol: javobni oshkor qiladigan maydonlarsiz. */
export function publicQuestion(q: any) {
  const config = q.config ?? null;
  let safeConfig: any = null;
  if (q.type === "match" && Array.isArray(config?.pairs)) {
    // Ikkala ustun kerak, lekin to'g'ri juftlar oshkor bo'lmasligi uchun o'ng ustun aralashtiriladi.
    const rights = shuffle(config.pairs.map((p: any) => p.right));
    safeConfig = { pairs: config.pairs.map((p: any, i: number) => ({ left: p.left, right: rights[i] })) };
  }
  else if (q.type === "reorder" && config?.tokens) safeConfig = { tokens: shuffle([...config.tokens]) };
  else if (q.type === "fill_blank" && Array.isArray(config?.blanks))
    safeConfig = { blanks: config.blanks.map(() => ({ answers: [] })) };
  return {
    id: q.id,
    questionText: q.question_text,
    type: q.type,
    options: q.options,
    points: q.points,
    timeLimit: q.time_limit,
    mediaUrl: q.media_url,
    mediaType: q.media_type,
    orderIndex: q.order_index,
    config: safeConfig,
  };
}

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Javob ko'rsatilganda o'quvchiga ko'rinadigan "to'g'ri javob" matni. */
function revealedAnswer(q: any) {
  const c = q.config || {};
  if (q.type === "fill_blank" && Array.isArray(c.blanks)) return c.blanks.map((b: any) => b.answers?.[0] ?? "").join(" / ");
  if (q.type === "reorder" && Array.isArray(c.tokens)) return c.tokens.join(" ");
  return q.correct_answer;
}

export function registerSharedTest(app: Express) {
  app.get(
    "/api/shared/:code",
    run(async (req, res) => {
      const link = await findLink(req.params.code);
      const closed = closedReason(link);
      if (closed) return res.status(closed.status).json({ message: closed.message });
      const quiz = (await pool.query("SELECT * FROM quizzes WHERE id=$1", [link!.quiz_id])).rows[0];
      if (!quiz) return res.status(404).json({ message: "Test topilmadi" });
      const questions = (
        await pool.query("SELECT * FROM questions WHERE quiz_id=$1 ORDER BY order_index,id", [quiz.id])
      ).rows;
      let group: any = null;
      if (link!.group_id) {
        const g = (await pool.query("SELECT id,name FROM teacher_groups WHERE id=$1 AND archived_at IS NULL", [link!.group_id])).rows[0];
        if (!g) return res.status(403).json({ message: "Bu test hozircha yopilgan" });
        const students = (
          await pool.query(
            `SELECT s.id,s.name,EXISTS(SELECT 1 FROM shared_quiz_attempts a WHERE a.shared_quiz_id=$2 AND a.student_id=s.id AND a.completed_at IS NOT NULL) AS done
             FROM teacher_group_students s WHERE s.group_id=$1 AND s.removed_at IS NULL ORDER BY s.sort_order,s.name`,
            [g.id, link!.id],
          )
        ).rows;
        group = { name: g.name, students };
      }
      res.set("Cache-Control", "no-store").json({
        sharedId: link!.id,
        quizId: quiz.id,
        title: quiz.title,
        description: quiz.description,
        category: quiz.category,
        coverImage: quiz.cover_image,
        totalQuestions: questions.length,
        timePerQuestion: quiz.time_per_question,
        timerEnabled: quiz.timer_enabled,
        shuffleQuestions: quiz.shuffle_questions,
        shuffleOptions: quiz.shuffle_options,
        showCorrectAnswers: quiz.show_correct_answers,
        questionSections: quiz.question_sections || [],
        closesAt: link!.closes_at,
        group,
        questions: questions.map(publicQuestion),
      });
    }),
  );

  app.post(
    "/api/shared/:code/start",
    run(async (req, res) => {
      const body = z
        .object({ playerName: z.string().trim().max(100).optional(), studentId: z.string().max(64).optional() })
        .safeParse(req.body || {});
      if (!body.success) return res.status(400).json({ message: "Ma’lumot noto‘g‘ri" });
      const link = await findLink(req.params.code);
      const closed = closedReason(link);
      if (closed) return res.status(closed.status).json({ message: closed.message });
      const quiz = (await pool.query("SELECT id,practice_mode FROM quizzes WHERE id=$1", [link!.quiz_id])).rows[0];
      if (!quiz) return res.status(404).json({ message: "Test topilmadi" });
      const total = Number(
        (await pool.query("SELECT count(*)::int AS n FROM questions WHERE quiz_id=$1", [quiz.id])).rows[0].n,
      );
      let name = body.data.playerName || "";
      let studentId: string | null = null;
      if (link!.group_id) {
        const s = (
          await pool.query(
            "SELECT id,name FROM teacher_group_students WHERE id=$1 AND group_id=$2 AND removed_at IS NULL",
            [body.data.studentId || "", link!.group_id],
          )
        ).rows[0];
        if (!s) return res.status(400).json({ message: "Ro‘yxatdan ismingizni tanlang" });
        name = s.name;
        studentId = s.id;
      }
      if (!name) return res.status(400).json({ message: "Ism kiriting" });
      if (quiz.practice_mode) return res.json({ id: "practice_mode", playerName: name, answered: [] });

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (studentId) {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [link!.id + ":" + studentId]);
          const prev = (
            await client.query(
              "SELECT id,completed_at,answers FROM shared_quiz_attempts WHERE shared_quiz_id=$1 AND student_id=$2 ORDER BY started_at DESC LIMIT 1",
              [link!.id, studentId],
            )
          ).rows[0];
          if (prev?.completed_at) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Siz bu testni ishlab bo‘lgansiz. Natijangiz o‘qituvchida saqlangan." });
          }
          if (prev) {
            await client.query("COMMIT");
            return res.json({ id: prev.id, playerName: name, answered: Object.keys(prev.answers || {}) });
          }
        }
        const created = (
          await client.query(
            "INSERT INTO shared_quiz_attempts(shared_quiz_id,player_name,total_questions,answers,student_id) VALUES($1,$2,$3,'{}'::jsonb,$4) RETURNING id",
            [link!.id, name, total, studentId],
          )
        ).rows[0];
        await client.query("COMMIT");
        res.json({ id: created.id, playerName: name, answered: [] });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }),
  );

  app.post(
    "/api/shared/:code/answer",
    run(async (req, res) => {
      const body = z
        .object({
          attemptId: z.string().max(64),
          questionId: z.string().max(64),
          answer: z.union([z.string().max(2000), z.array(z.string().max(500)).max(50)]).nullable().optional(),
          timeSpent: z.number().min(0).max(3600).optional(),
        })
        .safeParse(req.body || {});
      if (!body.success) return res.status(400).json({ message: "Javob noto‘g‘ri" });
      const link = await findLink(req.params.code);
      const closed = closedReason(link);
      if (closed) return res.status(closed.status).json({ message: closed.message });
      const q = (
        await pool.query("SELECT * FROM questions WHERE id=$1 AND quiz_id=$2", [body.data.questionId, link!.quiz_id])
      ).rows[0];
      if (!q) return res.status(404).json({ message: "Savol topilmadi" });
      const quiz = (await pool.query("SELECT show_correct_answers FROM quizzes WHERE id=$1", [link!.quiz_id])).rows[0];
      const answer = body.data.answer ?? "";
      const graded = gradeAnswer(
        { type: q.type, correctAnswer: q.correct_answer, options: q.options, config: q.config },
        answer,
      );
      const spent = Math.round(body.data.timeSpent ?? 0);
      const limit = Math.max(1, Number(q.time_limit) || 30);
      const points =
        graded.ratio > 0 ? Math.round((Number(q.points) || 100) * Math.max(0, 1 - (Math.min(spent, limit) / limit) * 0.5) * graded.ratio) : 0;
      let record = { answer, isCorrect: graded.isCorrect, points, timeSpent: spent };
      if (body.data.attemptId !== "practice_mode") {
        // Birinchi javob hisoblanadi; qayta yuborilsa avvalgisi o'zgarmaydi.
        const saved = (
          await pool.query(
            `UPDATE shared_quiz_attempts SET answers=COALESCE(answers,'{}'::jsonb)||jsonb_build_object($3::text,$4::jsonb)
             WHERE id=$1 AND shared_quiz_id=$2 AND completed_at IS NULL AND NOT (COALESCE(answers,'{}'::jsonb) ? $3::text)
             RETURNING id`,
            [body.data.attemptId, link!.id, q.id, JSON.stringify(record)],
          )
        ).rows[0];
        if (!saved) {
          const a = (
            await pool.query("SELECT answers,completed_at FROM shared_quiz_attempts WHERE id=$1 AND shared_quiz_id=$2", [
              body.data.attemptId,
              link!.id,
            ])
          ).rows[0];
          if (!a || a.completed_at) return res.status(409).json({ message: "Bu urinish yakunlangan" });
          record = a.answers?.[q.id] || record;
        }
      }
      res.json({
        isCorrect: record.isCorrect,
        points: record.points,
        correctAnswer: quiz?.show_correct_answers ? revealedAnswer(q) : undefined,
      });
    }),
  );

  app.post(
    "/api/shared/:code/submit",
    run(async (req, res) => {
      const attemptId = String(req.body?.attemptId || "");
      if (!attemptId) return res.status(400).json({ message: "attemptId kerak" });
      const link = await findLink(req.params.code);
      if (!link) return res.status(404).json({ message: "Test topilmadi" });
      if (attemptId === "practice_mode") return res.json({ id: "practice_mode" });
      const a = (
        await pool.query("SELECT * FROM shared_quiz_attempts WHERE id=$1 AND shared_quiz_id=$2", [attemptId, link.id])
      ).rows[0];
      if (!a) return res.status(404).json({ message: "Urinish topilmadi" });
      const values = Object.values(a.answers || {}) as any[];
      const correct = values.filter((v) => v?.isCorrect).length;
      const score = values.reduce((n, v) => n + (Number(v?.points) || 0), 0);
      const total = Number(
        (await pool.query("SELECT count(*)::int AS n FROM questions WHERE quiz_id=$1", [link.quiz_id])).rows[0].n,
      );
      if (!a.completed_at) {
        await pool.query(
          "UPDATE shared_quiz_attempts SET score=$2,correct_answers=$3,total_questions=$4,completed_at=now() WHERE id=$1 AND completed_at IS NULL",
          [a.id, score, correct, total],
        );
        await pool.query("UPDATE quizzes SET total_plays=COALESCE(total_plays,0)+1 WHERE id=$1", [link.quiz_id]);
      }
      res.json({ id: a.id, score, correctAnswers: correct, totalQuestions: total });
    }),
  );
}
