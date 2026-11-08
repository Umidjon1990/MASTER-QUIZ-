// O'qituvchi paneli: admin "Tayyor quizlar"ga chiqargan papkalar va o'qituvchining test sahifasi.
// O'qituvchi tayyor testni o'zgartirmasdan ishlatadi: birinchi ochganda unga yashirin nusxa beriladi,
// shunda jonli o'yin, havola, rejalashtirish va natijalar odatdagi (egasi tekshiriladigan) yo'llar bilan ishlaydi.
// Admin testni o'zgartirsa, keyingi ochishda yangi nusxa yaratiladi; eski nusxa natijalari bilan tarixda qoladi.
import { createHash } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { pool } from "./db";

type RoleMiddleware = (roles: string[]) => RequestHandler;

export async function initTeacherPanel() {
  await pool.query(`
CREATE TABLE IF NOT EXISTS teacher_library_folders(
 folder_id varchar PRIMARY KEY,
 sort_order integer NOT NULL DEFAULT 0,
 published_by varchar NOT NULL,
 published_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS teacher_library_copies(
 copy_quiz_id varchar PRIMARY KEY,
 source_quiz_id varchar NOT NULL,
 teacher_id varchar NOT NULL,
 source_version text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS teacher_library_copies_teacher_idx ON teacher_library_copies(teacher_id,source_quiz_id,created_at DESC);`);
}

const QUIZ_FIELDS =
  "title,description,category,cover_image,timer_enabled,time_per_question,shuffle_questions,shuffle_options,show_correct_answers,practice_mode,question_sections";
const QUESTION_FIELDS =
  "order_index,type,question_text,media_type,media_url,options,correct_answer,config,points,time_limit";

async function sourceVersion(client: { query: typeof pool.query }, quizId: string) {
  const quiz = (await client.query(`SELECT ${QUIZ_FIELDS} FROM quizzes WHERE id=$1`, [quizId])).rows[0];
  const qs = (
    await client.query(`SELECT ${QUESTION_FIELDS} FROM questions WHERE quiz_id=$1 ORDER BY order_index,id`, [quizId])
  ).rows;
  return createHash("sha256").update(JSON.stringify([quiz, qs])).digest("hex").slice(0, 40);
}

/** Kutubxonadagi (nashr qilingan papkadagi) test. */
async function librarySource(quizId: string) {
  return (
    await pool.query(
      `SELECT q.id,q.title FROM quizzes q JOIN teacher_library_folders f ON f.folder_id=q.folder_id
       WHERE q.id=$1 AND q.total_questions>0`,
      [quizId],
    )
  ).rows[0] as { id: string; title: string } | undefined;
}

/** O'qituvchiga tayyor testning joriy nusxasini beradi (kerak bo'lsa yaratadi). */
export async function ensureLibraryCopy(teacherId: string, sourceQuizId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [teacherId + ":" + sourceQuizId]);
    const version = await sourceVersion(client as any, sourceQuizId);
    const current = (
      await client.query(
        `SELECT c.copy_quiz_id FROM teacher_library_copies c JOIN quizzes q ON q.id=c.copy_quiz_id
         WHERE c.teacher_id=$1 AND c.source_quiz_id=$2 AND c.source_version=$3 ORDER BY c.created_at DESC LIMIT 1`,
        [teacherId, sourceQuizId, version],
      )
    ).rows[0];
    if (current) {
      await client.query("COMMIT");
      return current.copy_quiz_id as string;
    }
    const copy = (
      await client.query(
        `INSERT INTO quizzes(${QUIZ_FIELDS},is_public,creator_id,total_questions,status,allow_replay,folder_id,order_in_folder)
         SELECT ${QUIZ_FIELDS},false,$2,total_questions,'published',allow_replay,NULL,0 FROM quizzes WHERE id=$1 RETURNING id`,
        [sourceQuizId, teacherId],
      )
    ).rows[0];
    await client.query(
      `INSERT INTO questions(quiz_id,${QUESTION_FIELDS}) SELECT $2,${QUESTION_FIELDS} FROM questions WHERE quiz_id=$1`,
      [sourceQuizId, copy.id],
    );
    await client.query(
      "INSERT INTO teacher_library_copies(copy_quiz_id,source_quiz_id,teacher_id,source_version) VALUES($1,$2,$3,$4)",
      [copy.id, sourceQuizId, teacherId, version],
    );
    await client.query("COMMIT");
    return copy.id as string;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const run =
  (fn: (req: any, res: any) => Promise<any>): RequestHandler =>
  (req, res, next) =>
    void fn(req, res).catch(next);

export function registerTeacherPanel(app: Express, requireAuth: RequestHandler, requireRole: RoleMiddleware) {
  const teacher = [requireAuth, requireRole(["teacher", "admin"])];
  const admin = [requireAuth, requireRole(["admin"])];

  // ---- O'qituvchi: tayyor quizlar ----
  app.get(
    "/api/teacher-panel/library",
    ...teacher,
    run(async (_req, res) => {
      const { rows } = await pool.query(
        `SELECT f.id AS folder_id,f.name AS folder_name,q.id,q.title,q.description,q.total_questions,q.timer_enabled,q.time_per_question
         FROM teacher_library_folders lf JOIN quiz_folders f ON f.id=lf.folder_id
         LEFT JOIN quizzes q ON q.folder_id=f.id AND q.total_questions>0
         ORDER BY lf.sort_order,lf.published_at,q.order_in_folder,q.title`,
      );
      const folders: any[] = [];
      for (const r of rows) {
        let f = folders.find((x) => x.id === r.folder_id);
        if (!f) folders.push((f = { id: r.folder_id, name: r.folder_name, quizzes: [] }));
        if (r.id)
          f.quizzes.push({
            id: r.id,
            title: r.title,
            description: r.description,
            totalQuestions: r.total_questions,
            timerEnabled: r.timer_enabled,
            timePerQuestion: r.time_per_question,
          });
      }
      res.json({ folders: folders.filter((f) => f.quizzes.length) });
    }),
  );

  app.post(
    "/api/teacher-panel/library/:quizId/open",
    ...teacher,
    run(async (req, res) => {
      const source = await librarySource(String(req.params.quizId));
      if (!source) return res.status(404).json({ message: "Bu test kutubxonada yo‘q" });
      res.json({ quizId: await ensureLibraryCopy(req.userId, source.id) });
    }),
  );

  // ---- O'qituvchi: o'z testlari (kutubxona nusxalaridan tashqari) ----
  app.get(
    "/api/teacher-panel/mine",
    ...teacher,
    run(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT q.id,q.title,q.description,q.total_questions,q.timer_enabled,q.time_per_question,f.id AS folder_id,f.name AS folder_name
         FROM quizzes q LEFT JOIN quiz_folders f ON f.id=q.folder_id
         WHERE q.creator_id=$1 AND q.total_questions>0
           AND NOT EXISTS(SELECT 1 FROM teacher_library_copies c WHERE c.copy_quiz_id=q.id)
         ORDER BY f.sort_order NULLS LAST,f.name,q.order_in_folder,q.title`,
        [req.userId],
      );
      const folders: any[] = [];
      for (const r of rows) {
        const id = r.folder_id || "none";
        let f = folders.find((x) => x.id === id);
        if (!f) folders.push((f = { id, name: r.folder_name || "Papkasiz testlar", quizzes: [] }));
        f.quizzes.push({
          id: r.id,
          title: r.title,
          description: r.description,
          totalQuestions: r.total_questions,
          timerEnabled: r.timer_enabled,
          timePerQuestion: r.time_per_question,
        });
      }
      res.json({ folders });
    }),
  );

  // ---- O'qituvchi: bitta test sahifasi ----
  app.get(
    "/api/teacher-panel/quizzes/:quizId",
    ...teacher,
    run(async (req, res) => {
      const quiz = (
        await pool.query(
          `SELECT q.*,c.source_quiz_id,s.title AS source_title FROM quizzes q
           LEFT JOIN teacher_library_copies c ON c.copy_quiz_id=q.id
           LEFT JOIN quizzes s ON s.id=c.source_quiz_id
           WHERE q.id=$1 AND q.creator_id=$2`,
          [req.params.quizId, req.userId],
        )
      ).rows[0];
      if (!quiz) return res.status(404).json({ message: "Test topilmadi" });
      const questions = (
        await pool.query(
          "SELECT id,type,question_text,options,correct_answer,config,media_type,media_url,points,time_limit FROM questions WHERE quiz_id=$1 ORDER BY order_index,id",
          [quiz.id],
        )
      ).rows;
      const links = (
        await pool.query(
          `SELECT s.id,s.code,s.is_active,s.created_at,
             count(a.id) FILTER (WHERE a.completed_at IS NOT NULL)::int AS finished
           FROM shared_quizzes s LEFT JOIN shared_quiz_attempts a ON a.shared_quiz_id=s.id
           WHERE s.quiz_id=$1 AND s.creator_id=$2 GROUP BY s.id ORDER BY s.created_at DESC`,
          [quiz.id, req.userId],
        )
      ).rows;
      // Kutubxonadagi test yangilangan bo'lsa, o'qituvchiga bildiramiz.
      let outdated = false;
      if (quiz.source_quiz_id && (await librarySource(quiz.source_quiz_id))) {
        const latest = await sourceVersion(pool as any, quiz.source_quiz_id);
        const mine = (
          await pool.query("SELECT source_version FROM teacher_library_copies WHERE copy_quiz_id=$1", [quiz.id])
        ).rows[0];
        outdated = mine?.source_version !== latest;
      }
      res.json({
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        totalQuestions: questions.length,
        timerEnabled: quiz.timer_enabled,
        timePerQuestion: quiz.time_per_question,
        shuffleQuestions: quiz.shuffle_questions,
        shuffleOptions: quiz.shuffle_options,
        library: quiz.source_quiz_id ? { sourceQuizId: quiz.source_quiz_id, outdated } : null,
        schedule:
          quiz.scheduled_status === "pending" || quiz.scheduled_status === "started"
            ? {
                at: quiz.scheduled_at,
                status: quiz.scheduled_status,
                code: quiz.scheduled_require_code ? quiz.scheduled_code : null,
              }
            : null,
        links: links.map((l) => ({
          id: l.id,
          code: l.code,
          isActive: l.is_active,
          createdAt: l.created_at,
          finished: l.finished,
        })),
        questions: questions.map((q) => ({
          id: q.id,
          type: q.type,
          text: q.question_text,
          options: q.options || [],
          correctAnswer: q.correct_answer,
          config: q.config,
          mediaType: q.media_type,
          mediaUrl: q.media_url,
        })),
      });
    }),
  );

  // ---- Admin: qaysi papkalar o'qituvchilarga ko'rinadi ----
  app.get(
    "/api/admin/teacher-library",
    ...admin,
    run(async (_req, res) => {
      const { rows } = await pool.query(
        `SELECT f.id,f.name,f.creator_id,p.display_name,p.role,
           (SELECT count(*)::int FROM quizzes q WHERE q.folder_id=f.id AND q.total_questions>0) AS quizzes,
           lf.sort_order,lf.folder_id IS NOT NULL AS published
         FROM quiz_folders f LEFT JOIN user_profiles p ON p.user_id=f.creator_id
         LEFT JOIN teacher_library_folders lf ON lf.folder_id=f.id
         WHERE COALESCE(p.role,'') IN ('admin','teacher')
           AND NOT EXISTS(SELECT 1 FROM quizzes q JOIN teacher_library_copies c ON c.copy_quiz_id=q.id WHERE q.folder_id=f.id)
         ORDER BY lf.folder_id IS NULL,lf.sort_order,p.display_name,f.sort_order,f.name`,
      );
      res.json({
        folders: rows.map((r) => ({
          id: r.id,
          name: r.name,
          owner: r.display_name || (r.role === "admin" ? "Admin" : "O‘qituvchi"),
          ownerRole: r.role,
          quizzes: r.quizzes,
          published: r.published,
        })),
      });
    }),
  );

  app.put(
    "/api/admin/teacher-library",
    ...admin,
    run(async (req, res) => {
      const parsed = z.object({ folderIds: z.array(z.string().min(1).max(64)).max(500) }).strict().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Papkalar ro‘yxati noto‘g‘ri" });
      const ids = [...new Set(parsed.data.folderIds)];
      const known = (await pool.query("SELECT id FROM quiz_folders WHERE id=ANY($1::varchar[])", [ids])).rows.map(
        (r) => r.id,
      );
      if (known.length !== ids.length) return res.status(400).json({ message: "Papkalardan biri topilmadi" });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM teacher_library_folders WHERE NOT (folder_id=ANY($1::varchar[]))", [ids]);
        for (const [i, id] of ids.entries())
          await client.query(
            `INSERT INTO teacher_library_folders(folder_id,sort_order,published_by) VALUES($1,$2,$3)
             ON CONFLICT(folder_id) DO UPDATE SET sort_order=excluded.sort_order`,
            [id, i, req.userId],
          );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
      res.json({ published: ids.length });
    }),
  );
}
