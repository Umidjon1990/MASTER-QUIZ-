import {
  loadQuizSaleLocks,
  protectQuizSale,
  registerQuizSaleGuard,
} from "./platform-sale-locks";
import bcrypt from "bcryptjs";
import { registerLegacyBridge } from "./platform-legacy";
import {
  types,
  quizVersion,
  quizQuestion,
  gradeQuizQuestion,
} from "./platform-quiz-policy";
import type { Express } from "express";
import { pool } from "./db";
import {
  registerExamProvider,
  shuffle,
  fail,
  type ExamDefinition,
} from "./platform-engine";

export async function registerQuizPlatform(app: Express) {
  await loadQuizSaleLocks(pool);
  registerQuizSaleGuard(app, pool);
  async function load(sourceId: string, purchased = false) {
    if (!sourceId.startsWith("quiz:")) fail(404, "Quiz topilmadi");
    const quiz = (
      await pool.query("SELECT * FROM quizzes WHERE id=$1", [sourceId.slice(5)])
    ).rows[0];
    if (
      !quiz ||
      (!purchased && (!quiz.is_public || quiz.status !== "published"))
    )
      fail(404, "Quiz nashrda mavjud emas");
    const native = (
      await pool.query(
        "SELECT * FROM questions WHERE quiz_id=$1 ORDER BY order_index,id",
        [quiz.id],
      )
    ).rows.map((q: any) => ({
      id: q.id,
      type: q.type,
      questionText: q.question_text,
      options: q.options,
      correctAnswer: q.correct_answer,
      config: q.config,
      points: q.points,
      timeLimit: q.time_limit,
      mediaType: q.media_type,
      mediaUrl: q.media_url
        ? new URL(q.media_url, "https://web-production-73482.up.railway.app")
            .href
        : null,
    }));
    return { quiz, native };
  }
  const definition = async (
    sourceId: string,
    purchased = false,
  ): Promise<ExamDefinition> => {
    const { quiz, native } = await load(sourceId, purchased);
    if (native.some((q: any) => !types.has(q.type)))
      fail(409, "Quizda imtihon rejimiga mos bo‘lmagan savol turi mavjud");
    let questions = native.map((q: any, index: number) => {
      const section = (quiz.question_sections || []).find(
        (s: any) => index + 1 >= s.fromIndex && index + 1 <= s.toIndex,
      );
      return {
        ...quizQuestion(q, quiz.shuffle_options, section?.passageText),
        seconds:
          section?.timePerQuestion ||
          q.timeLimit ||
          quiz.time_per_question ||
          30,
      };
    });
    if (quiz.shuffle_questions) questions = shuffle(questions);
    return {
      id: sourceId,
      title: quiz.title,
      description: quiz.description,
      version: quizVersion(quiz, native),
      questions,
      passingScore: 60,
      showResult: true,
      stages: quiz.timer_enabled
        ? questions.map((q: any) => ({
            ids: [q.id],
            seconds: Math.max(1, q.seconds),
            label: "Savol",
          }))
        : [
            {
              ids: questions.map((q: any) => q.id),
              seconds: null,
              label: quiz.title,
            },
          ],
    };
  };
  const engine = await registerExamProvider(app, {
    pool,
    definition,
    grade: gradeQuizQuestion,
    onSale: (sourceId) => protectQuizSale(pool, sourceId),
    catalog: async () => {
      const quizzes = (
        await pool.query(
          "SELECT id FROM quizzes WHERE status='published' AND is_public=true ORDER BY updated_at DESC LIMIT 1000",
        )
      ).rows;
      const products = [];
      for (const row of quizzes) {
        const sourceId = "quiz:" + row.id,
          { quiz, native } = await load(sourceId);
        products.push({
          sourceId,
          kind: "test",
          title: quiz.title,
          description: quiz.description || "",
          thumbnailUrl: quiz.cover_image,
          sourceVersion: quizVersion(quiz, native),
          demoRef: sourceId,
          recommendedDurationDays: 30,
          recommendedMaxAttempts: 1,
          features: { teacherSubscription: false, serverGraded: true },
          readyForSale:
            native.length > 0 && native.every((q: any) => types.has(q.type)),
          saleNote: native.some((q: any) => !types.has(q.type))
            ? "So‘rovnoma savollari pullik imtihonga mos emas"
            : null,
        });
      }
      return products;
    },
  });
  await registerLegacyBridge(app, engine, {
    provider: "quiz",
    pool,
    definition,
    purchases: async () => [],
    verify: async (username, password) => {
      const rows = (
        await pool.query(
          "SELECT u.*,p.is_active FROM users u JOIN user_profiles p ON p.user_id=u.id WHERE lower(u.email)=lower($1)",
          [username],
        )
      ).rows;
      const user = rows.length === 1 ? rows[0] : null;
      if (
        !user?.is_active ||
        !user.password ||
        !(await bcrypt.compare(password, user.password))
      )
        return null;
      return {
        id: user.id,
        fullName:
          [user.first_name, user.last_name].filter(Boolean).join(" ") ||
          user.email,
      };
    },
  });
}
