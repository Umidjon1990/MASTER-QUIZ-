import type { Express, Request, Response, NextFunction } from "express";
import { randomUUID, randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import multer from "multer";

export type ExamDefinition = {
  id: string;
  title: string;
  description?: string;
  version: string;
  questions: any[];
  stages: {
    ids: string[];
    seconds: number | null;
    label: string;
    passage?: string;
  }[];
  passingScore?: number;
  showResult?: boolean;
};
export type EngineOptions = {
  pool: any;
  catalog(): Promise<any[]>;
  definition(id: string, purchased?: boolean): Promise<ExamDefinition>;
  grade(question: any, answer: any): number | null;
  refreshGrant?(client: any, grant: any): Promise<void>;
  consumeGrant?(client: any, grant: any): Promise<void>;
  manageGrant?(client: any, grant: any, input: any): Promise<void>;
  history?(client: any, grant: any): Promise<any[]>;
  onStarted?(
    client: any,
    grant: any,
    attemptId: string,
    snapshot: ExamDefinition,
  ): Promise<void>;
  onFinished?(client: any, attempt: any, result: any): Promise<void>;
  onSale?(sourceId: string): Promise<void>;
};
export const shuffle = <T>(input: T[]): T[] => {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
const id = z.string().min(1).max(200),
  uuid = z.string().uuid();
const grantInput = z.object({
  orderId: uuid,
  externalUserId: id,
  sourceId: id,
  sourceVersion: id,
  fullName: z.string().max(200).optional(),
  kind: z.literal("test"),
  durationDays: z.number().int().min(1).max(3650).nullable(),
  maxAttempts: z.number().int().min(1).max(1000),
});

export function safeQuestion(q: any) {
  return {
    id: q.id,
    type: q.type,
    questionText: q.questionText,
    points: q.points,
    passage: q.passage,
    audioUrl: q.audioUrl,
    imageUrl: q.imageUrl,
    preparationTime: q.preparationTime,
    speakingTime: q.speakingTime,
    options: (q.options || []).map((o: any) => ({
      id: o.id,
      optionText: o.optionText,
    })),
    correctCount: q.multiple ? 2 : 1,
    config: q.publicConfig || {},
  };
}
export function scoreSnapshot(
  options: Pick<EngineOptions, "grade">,
  definition: ExamDefinition,
  answers: Record<string, any>,
  scores: Record<string, number> = {},
) {
  let score = 0,
    totalPoints = 0;
  const manual: any[] = [],
    details: any[] = [];
  for (const q of definition.questions) {
    const points = Math.max(0, Number(q.points) || 0);
    totalPoints += points;
    const ratio = options.grade(q, answers[q.id]);
    let earned = 0;
    if (ratio === null && answers[q.id] !== undefined && answers[q.id] !== "") {
      manual.push({
        id: q.id,
        questionText: q.questionText,
        answer: answers[q.id],
        points,
        ...(q.type === "speaking" ? { audioUrl: answers[q.id] } : {}),
      });
      if (scores[q.id] !== undefined) earned = scores[q.id];
    } else if (ratio !== null)
      earned = points * Math.max(0, Math.min(1, Number(ratio) || 0));
    if (!Number.isFinite(earned) || earned < 0 || earned > points)
      fail(400, "Baho chegaradan tashqarida");
    score += earned;
    details.push({ questionId: q.id, score: earned, points });
  }
  const requiresManualReview = manual.some((q) => scores[q.id] === undefined);
  const percentage = totalPoints ? (score / totalPoints) * 100 : 0;
  return {
    score,
    totalPoints,
    percentage,
    requiresManualReview,
    manual,
    details,
    isPassed:
      !requiresManualReview && percentage >= (definition.passingScore || 0),
  };
}
export const ENGINE_SQL = `
CREATE TABLE IF NOT EXISTS platform_exam_grants(order_id uuid PRIMARY KEY,external_user_id varchar NOT NULL,source_id varchar NOT NULL,source_version varchar NOT NULL,title text NOT NULL,full_name text NOT NULL DEFAULT '',max_attempts integer NOT NULL CHECK(max_attempts>0),used_attempts integer NOT NULL DEFAULT 0 CHECK(used_attempts>=0),expires_at timestamptz,revoked_at timestamptz,legacy_ref jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS platform_exam_grants_user_idx ON platform_exam_grants(external_user_id,source_id);
CREATE TABLE IF NOT EXISTS platform_exam_tombstones(order_id uuid PRIMARY KEY,external_user_id varchar NOT NULL);
CREATE TABLE IF NOT EXISTS platform_exam_operations(operation_id uuid PRIMARY KEY,order_id uuid NOT NULL,kind varchar NOT NULL,result jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS platform_exam_attempts(id uuid PRIMARY KEY,grant_order_id uuid NOT NULL REFERENCES platform_exam_grants(order_id),external_user_id varchar NOT NULL,source_id varchar NOT NULL,snapshot jsonb NOT NULL,answers jsonb NOT NULL DEFAULT '{}',stage_index integer NOT NULL DEFAULT 0,deadline timestamptz,status varchar NOT NULL DEFAULT 'started' CHECK(status IN('started','submitted')),result jsonb,feedback text,graded_by varchar,graded_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz);
CREATE UNIQUE INDEX IF NOT EXISTS platform_exam_active_idx ON platform_exam_attempts(grant_order_id) WHERE status='started';
CREATE TABLE IF NOT EXISTS platform_exam_files(id uuid PRIMARY KEY,grant_order_id uuid NOT NULL REFERENCES platform_exam_grants(order_id),external_user_id varchar NOT NULL,attempt_id uuid NOT NULL REFERENCES platform_exam_attempts(id),question_id varchar NOT NULL,mime_type varchar NOT NULL,content bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(attempt_id,question_id));
CREATE TABLE IF NOT EXISTS platform_exam_review_audit(id uuid PRIMARY KEY,attempt_id uuid NOT NULL REFERENCES platform_exam_attempts(id),actor_id varchar NOT NULL,scores jsonb NOT NULL,feedback text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
`;

export async function registerExamProvider(
  app: Express,
  options: EngineOptions,
) {
  const { pool } = options;
  await pool.query(ENGINE_SQL);
  const auth = (req: Request, res: Response, next: NextFunction) => {
    const key = process.env.PLATFORM_SERVICE_SECRET || "",
      given = req.get("x-platform-key") || "";
    if (
      key.length < 32 ||
      Buffer.byteLength(given) !== Buffer.byteLength(key) ||
      !timingSafeEqual(Buffer.from(key), Buffer.from(given))
    )
      return res.status(403).json({ message: "Xizmat ruxsati yo‘q" });
    res.set("Cache-Control", "no-store");
    next();
  };
  const run =
    (fn: (req: any, res: Response) => Promise<any>) =>
    (req: Request, res: Response, next: NextFunction) => {
      void fn(req, res).catch((error) => {
        if (error instanceof z.ZodError)
          res.status(400).json({ message: "So‘rov formati noto‘g‘ri" });
        else if (Number.isInteger(error?.status))
          res.status(error.status).json({ message: error.message });
        else {
          console.error("Assessment provider request failed");
          res
            .status(503)
            .json({ message: "Test xizmatiga ulanish vaqtincha qiyinlashdi" });
        }
      });
    };
  async function transaction<T>(fn: (client: any) => Promise<T>) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async function grant(client: any, req: Request, active = true) {
    const user = id.parse(req.get("x-platform-user")),
      order = uuid.parse(req.get("x-platform-order"));
    const row = (
      await client.query(
        "SELECT * FROM platform_exam_grants WHERE order_id=$1 AND external_user_id=$2 FOR UPDATE",
        [order, user],
      )
    ).rows[0];
    if (row && options.refreshGrant) await options.refreshGrant(client, row);
    if (
      !row ||
      (active &&
        (row.revoked_at ||
          (row.expires_at && new Date(row.expires_at).getTime() <= Date.now())))
    )
      fail(403, "Mahsulotga faol kirish huquqi kerak");
    return row;
  }
  async function finish(client: any, row: any) {
    if (row.status !== "started") return;
    row.result = scoreSnapshot(options, row.snapshot, row.answers);
    row.status = "submitted";
    await client.query(
      "UPDATE platform_exam_attempts SET result=$2,status='submitted',finished_at=now() WHERE id=$1",
      [row.id, JSON.stringify(row.result)],
    );
    if (options.onFinished) await options.onFinished(client, row, row.result);
  }
  async function advance(client: any, row: any, automatic = false) {
    if (row.stage_index + 1 >= row.snapshot.stages.length)
      return finish(client, row);
    const start =
      automatic && row.deadline ? new Date(row.deadline).getTime() : Date.now();
    row.stage_index++;
    const seconds = row.snapshot.stages[row.stage_index].seconds;
    row.deadline = seconds ? new Date(start + seconds * 1000) : null;
    await client.query(
      "UPDATE platform_exam_attempts SET stage_index=$2,deadline=$3 WHERE id=$1",
      [row.id, row.stage_index, row.deadline],
    );
  }
  async function expire(client: any, row: any) {
    while (row.status === "started" && row.deadline) {
      const stage = row.snapshot.stages[row.stage_index];
      const grace = stage.ids.some(
        (qid: string) =>
          row.snapshot.questions.find((q: any) => q.id === qid)?.type ===
          "speaking",
      )
        ? 10000
        : 0;
      if (new Date(row.deadline).getTime() + grace > Date.now()) break;
      await advance(client, row, true);
    }
  }
  function resultDto(row: any) {
    const r = row.result;
    return {
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      finishedAt: row.finished_at,
      feedback: row.feedback,
      result: !r
        ? null
        : row.snapshot.showResult === false
          ? { requiresManualReview: r.requiresManualReview, hidden: true }
          : {
              score: r.score,
              totalPoints: r.totalPoints,
              percentage: r.percentage,
              isPassed: r.isPassed,
              requiresManualReview: r.requiresManualReview,
            },
    };
  }
  function view(row: any) {
    const stage = row.snapshot.stages[row.stage_index];
    return {
      ...resultDto(row),
      test: { id: row.source_id, title: row.snapshot.title },
      stageIndex: row.stage_index,
      stageCount: row.snapshot.stages.length,
      stageLabel: stage?.label,
      deadline: row.deadline,
      serverNow: new Date().toISOString(),
      questions:
        row.status === "started"
          ? stage.ids.map((q: string) =>
              safeQuestion(row.snapshot.questions.find((x: any) => x.id === q)),
            )
          : [],
      answers: row.answers,
      sections: stage?.passage
        ? [
            {
              id: String(row.stage_index),
              title: stage.label,
              readingPassage: stage.passage,
            },
          ]
        : [],
    };
  }
  async function attempt(client: any, req: Request) {
    const g = await grant(client, req);
    const row = (
      await client.query(
        "SELECT * FROM platform_exam_attempts WHERE id=$1 AND grant_order_id=$2 AND external_user_id=$3 FOR UPDATE",
        [uuid.parse(req.params.attemptId), g.order_id, g.external_user_id],
      )
    ).rows[0];
    if (!row) fail(404, "Urinish topilmadi");
    await expire(client, row);
    return row;
  }
  app.get(
    "/api/platform/catalog",
    auth,
    run(async (_req, res) => res.json({ products: await options.catalog() })),
  );
  app.get(
    "/api/platform/users/:userId/library",
    auth,
    run(async (req, res) => {
      const rows = await transaction(async (client) => {
        const rows = (
          await client.query(
            "SELECT * FROM platform_exam_grants WHERE external_user_id=$1 ORDER BY created_at DESC LIMIT 2000 FOR UPDATE",
            [id.parse(req.params.userId)],
          )
        ).rows;
        for (const g of rows)
          if (options.refreshGrant) await options.refreshGrant(client, g);
        return rows;
      });
      res.json({
        grants: rows.map((g: any) => ({
          orderId: g.order_id,
          sourceId: g.source_id,
          maxAttempts: g.max_attempts,
          attemptsRemaining: Math.max(0, g.max_attempts - g.used_attempts),
          expiresAt: g.expires_at,
          revoked: !!g.revoked_at,
        })),
      });
    }),
  );
  app.get("/api/platform/capabilities", auth, (_req, res) =>
    res.json({ native: true, attempts: true, manualReview: true }),
  );
  app.post(
    "/api/platform/products/:sourceId/sale",
    auth,
    run(async (req, res) => {
      const sourceId = id.parse(req.params.sourceId),
        v = z.object({ enabled: z.boolean() }).strict().parse(req.body);
      if (v.enabled) {
        await options.definition(sourceId);
        if (options.onSale) await options.onSale(sourceId);
      }
      res.json({ success: true });
    }),
  );
  app.get(
    "/api/platform/products/:sourceId/demo",
    auth,
    run(async (req, res) => {
      const d = await options.definition(id.parse(req.params.sourceId));
      res.json({
        kind: "test",
        title: d.title,
        items: d.questions.slice(0, 3).map(safeQuestion),
        note: "Bu qisqa demo. Natija va urinishlar hisobga olinmaydi.",
      });
    }),
  );
  app.post(
    "/api/platform/grants",
    auth,
    run(async (req, res) => {
      const v = grantInput.parse(req.body);
      const prior = (
        await pool.query(
          "SELECT * FROM platform_exam_grants WHERE order_id=$1",
          [v.orderId],
        )
      ).rows[0];
      if (prior) {
        if (
          prior.external_user_id !== v.externalUserId ||
          prior.source_id !== v.sourceId
        )
          fail(409, "Xarid mos emas");
        return res.json({
          orderId: v.orderId,
          active: !prior.revoked_at,
          expiresAt: prior.expires_at,
        });
      }
      // Snapshot reads happen before the transaction to avoid starving one-connection pools.
      const definition = await options.definition(v.sourceId);
      res.json(
        await transaction(async (client) => {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            "exam-grant:" + v.orderId,
          ]);
          const prior = (
            await client.query(
              "SELECT * FROM platform_exam_grants WHERE order_id=$1",
              [v.orderId],
            )
          ).rows[0];
          if (prior) {
            if (
              prior.external_user_id !== v.externalUserId ||
              prior.source_id !== v.sourceId
            )
              fail(409, "Xarid mos emas");
            return {
              orderId: v.orderId,
              active: !prior.revoked_at,
              expiresAt: prior.expires_at,
            };
          }
          if (
            (
              await client.query(
                "SELECT 1 FROM platform_exam_tombstones WHERE order_id=$1",
                [v.orderId],
              )
            ).rowCount
          )
            fail(409, "Xarid bekor qilingan");
          if (definition.version !== v.sourceVersion)
            fail(409, "Test yangilangan");
          const expiresAt = v.durationDays
            ? new Date(Date.now() + v.durationDays * 86400000)
            : null;
          await client.query(
            "INSERT INTO platform_exam_grants(order_id,external_user_id,source_id,source_version,title,full_name,max_attempts,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
            [
              v.orderId,
              v.externalUserId,
              v.sourceId,
              v.sourceVersion,
              definition.title,
              v.fullName || "O‘quvchi",
              v.maxAttempts,
              expiresAt,
            ],
          );
          return { orderId: v.orderId, active: true, expiresAt };
        }),
      );
    }),
  );
  app.post(
    "/api/platform/grants/:orderId/manage",
    auth,
    run(async (req, res) => {
      const order = uuid.parse(req.params.orderId),
        v = z
          .object({
            externalUserId: id,
            operationId: uuid,
            action: z.enum(["extend", "revoke"]),
            days: z.number().int().min(1).max(3650).optional(),
          })
          .strict()
          .parse(req.body);
      res.json(
        await transaction(async (client) => {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            "exam-grant:" + order,
          ]);
          const previous = (
            await client.query(
              "SELECT * FROM platform_exam_operations WHERE operation_id=$1",
              [v.operationId],
            )
          ).rows[0];
          if (previous) {
            if (previous.order_id !== order || previous.kind !== v.action)
              fail(409, "Amal kaliti mos emas");
            return previous.result;
          }
          const g = (
            await client.query(
              "SELECT * FROM platform_exam_grants WHERE order_id=$1 FOR UPDATE",
              [order],
            )
          ).rows[0];
          if (g && g.external_user_id !== v.externalUserId)
            fail(403, "Xarid egasi mos emas");
          if (g && options.manageGrant) await options.manageGrant(client, g, v);
          if (v.action === "revoke") {
            await client.query(
              "INSERT INTO platform_exam_tombstones(order_id,external_user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
              [order, v.externalUserId],
            );
            if (g)
              await client.query(
                "UPDATE platform_exam_grants SET revoked_at=now() WHERE order_id=$1",
                [order],
              );
          } else {
            if (!g || g.revoked_at || !g.expires_at || !v.days)
              fail(409, "Xaridni uzaytirib bo‘lmaydi");
            g.expires_at = new Date(
              Math.max(Date.now(), new Date(g.expires_at).getTime()) +
                v.days! * 86400000,
            );
            await client.query(
              "UPDATE platform_exam_grants SET expires_at=$2 WHERE order_id=$1",
              [order, g.expires_at],
            );
          }
          const result = {
            orderId: order,
            active: v.action === "extend",
            expiresAt: g?.expires_at || null,
          };
          await client.query(
            "INSERT INTO platform_exam_operations(operation_id,order_id,kind,result) VALUES($1,$2,$3,$4)",
            [v.operationId, order, v.action, JSON.stringify(result)],
          );
          return result;
        }),
      );
    }),
  );
  app.get(
    "/api/platform/owned/:sourceId/view",
    auth,
    run(async (req, res) =>
      res.json(
        await transaction(async (client) => {
          const g = await grant(client, req);
          if (g.source_id !== req.params.sourceId)
            fail(403, "Mahsulot mos emas");
          const attempts = (
            await client.query(
              "SELECT * FROM platform_exam_attempts WHERE grant_order_id=$1 ORDER BY created_at DESC",
              [g.order_id],
            )
          ).rows;
          for (const a of attempts) await expire(client, a);
          return {
            kind: "test",
            test: { id: g.source_id, title: g.title },
            maxAttempts: g.max_attempts,
            attemptsRemaining: Math.max(0, g.max_attempts - g.used_attempts),
            expiresAt: g.expires_at,
            attempts: [
              ...attempts.map(resultDto),
              ...(options.history ? await options.history(client, g) : []),
            ],
          };
        }),
      ),
    ),
  );
  app.get(
    "/api/platform/owned/:sourceId/history",
    auth,
    run(async (req, res) =>
      res.json(
        await transaction(async (client) => {
          const g = await grant(client, req, false);
          if (g.source_id !== req.params.sourceId)
            fail(403, "Mahsulot mos emas");
          return {
            attempts: [
              ...(
                await client.query(
                  "SELECT * FROM platform_exam_attempts WHERE grant_order_id=$1 AND status='submitted' ORDER BY created_at DESC",
                  [g.order_id],
                )
              ).rows.map(resultDto),
              ...(options.history ? await options.history(client, g) : []),
            ],
          };
        }),
      ),
    ),
  );
  app.post(
    "/api/platform/native/course-exams/:sourceId/start",
    auth,
    run(async (req, res) => {
      // Resume the immutable sitting before reading mutable source content.
      const resumed=await transaction(async client=>{
        const g=await grant(client,req);
        if(g.source_id!==req.params.sourceId)fail(403,"Mahsulot mos emas");
        const row=(await client.query("SELECT * FROM platform_exam_attempts WHERE grant_order_id=$1 AND status='started' FOR UPDATE",[g.order_id])).rows[0];
        if(!row)return null;
        await expire(client,row);return view(row);
      });
      if(resumed)return res.json(resumed);
      const definition = await options.definition(
        id.parse(req.params.sourceId),
        true,
      );
      res.json(
        await transaction(async (client) => {
          const g = await grant(client, req);
          if (g.source_id !== req.params.sourceId)
            fail(403, "Mahsulot mos emas");
          const existing = (
            await client.query(
              "SELECT * FROM platform_exam_attempts WHERE grant_order_id=$1 AND status='started' FOR UPDATE",
              [g.order_id],
            )
          ).rows[0];
          if (existing) {
            await expire(client, existing);
            return view(existing);
          }
          if (!definition.questions.length || !definition.stages.length)
            fail(409, "Testda savollar yo‘q");
          if (g.used_attempts >= g.max_attempts)
            fail(403, "Urinishlar tugagan");
          if (options.consumeGrant) await options.consumeGrant(client, g);
          const attemptId = randomUUID(),
            seconds = definition.stages[0].seconds,
            deadline = seconds ? new Date(Date.now() + seconds * 1000) : null;
          const row = (
            await client.query(
              "INSERT INTO platform_exam_attempts(id,grant_order_id,external_user_id,source_id,snapshot,deadline) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
              [
                attemptId,
                g.order_id,
                g.external_user_id,
                g.source_id,
                JSON.stringify(definition),
                deadline,
              ],
            )
          ).rows[0];
          if (options.onStarted)
            await options.onStarted(client, g, attemptId, definition);
          await client.query(
            "UPDATE platform_exam_grants SET used_attempts=used_attempts+1 WHERE order_id=$1",
            [g.order_id],
          );
          return view(row);
        }),
      );
    }),
  );
  app.get(
    "/api/platform/native/course-exam-attempts/:attemptId",
    auth,
    run(async (req, res) =>
      res.json(
        await transaction(async (client) => view(await attempt(client, req))),
      ),
    ),
  );
  app.post(
    "/api/platform/native/course-exam-attempts/:attemptId",
    auth,
    run(async (req, res) => {
      const v = z
        .object({
          stageIndex: z.number().int().min(0),
          answers: z.record(z.unknown()),
          action: z.enum(["save", "next", "finish"]),
        })
        .strict()
        .parse(req.body);
      if (JSON.stringify(v.answers).length > 100000)
        fail(413, "Javoblar juda katta");
      res.json(
        await transaction(async (client) => {
          const row = await attempt(client, req);
          if (row.status !== "started" || v.stageIndex !== row.stage_index)
            return view(row);
          const stage = row.snapshot.stages[row.stage_index];
          for (const [key, value] of Object.entries(v.answers)) {
            if (!stage.ids.includes(key))
              fail(400, "Javob bu bo‘limga tegishli emas");
            const question = row.snapshot.questions.find(
              (q: any) => q.id === key,
            );
            if (question.type === "speaking" && value) {
              const fileId =
                typeof value === "string" &&
                (value.startsWith("/api/private-files/") ||
                  value.startsWith("/api/platform/core/platform/owned/"))
                  ? value.split("/").pop()
                  : null;
              if (
                !uuid.safeParse(fileId).success ||
                !(
                  await client.query(
                    "SELECT 1 FROM platform_exam_files WHERE id=$1 AND grant_order_id=$2 AND attempt_id=$3 AND question_id=$4",
                    [fileId, row.grant_order_id, row.id, key],
                  )
                ).rowCount
              )
                fail(403, "Audio fayl sizga tegishli emas");
            }
            row.answers[key] =
              question.type === "speaking" && value
                ? "/api/private-files/" + String(value).split("/").pop()
                : value;
          }
          await client.query(
            "UPDATE platform_exam_attempts SET answers=$2 WHERE id=$1",
            [row.id, JSON.stringify(row.answers)],
          );
          if (
            v.action === "finish" &&
            row.stage_index + 1 < row.snapshot.stages.length
          )
            fail(409, "Avval barcha bo‘limlardan o‘ting");
          if (v.action !== "save") await advance(client, row);
          return view(row);
        }),
      );
    }),
  );
  app.get(
    "/api/platform/admin/exam-attempts",
    auth,
    run(async (_req, res) => {
      const rows = (
        await pool.query(
          "SELECT a.*,g.full_name FROM platform_exam_attempts a JOIN platform_exam_grants g ON g.order_id=a.grant_order_id WHERE a.status='submitted' AND a.result->>'requiresManualReview'='true' ORDER BY a.finished_at LIMIT 200",
        )
      ).rows;
      res.json({
        attempts: rows.map((a: any) => ({
          id: a.id,
          kind: "exam",
          title: a.snapshot.title,
          fullName: a.full_name,
          questions: a.result.manual,
        })),
      });
    }),
  );
  app.post(
    "/api/platform/admin/exam-attempts/:attemptId/grade",
    auth,
    run(async (req, res) => {
      const v = z
        .object({
          kind: z.literal("exam").optional(),
          actorId: id,
          scores: z.record(z.number().min(0).max(1000000)),
          feedback: z.string().trim().min(3).max(10000),
        })
        .strict()
        .parse(req.body);
      res.json(
        await transaction(async (client) => {
          const row = (
            await client.query(
              "SELECT * FROM platform_exam_attempts WHERE id=$1 AND status='submitted' FOR UPDATE",
              [uuid.parse(req.params.attemptId)],
            )
          ).rows[0];
          if (!row) fail(404, "Natija topilmadi");
          const expected = row.result.manual.map((q: any) => q.id).sort();
          if (
            JSON.stringify(expected) !==
            JSON.stringify(Object.keys(v.scores).sort())
          )
            fail(400, "Barcha yozma javoblarni baholang");
          const result = scoreSnapshot(
            options,
            row.snapshot,
            row.answers,
            v.scores,
          );
          await client.query(
            "INSERT INTO platform_exam_review_audit(id,attempt_id,actor_id,scores,feedback) VALUES($1,$2,$3,$4,$5)",
            [
              randomUUID(),
              row.id,
              v.actorId,
              JSON.stringify(v.scores),
              v.feedback,
            ],
          );
          await client.query(
            "UPDATE platform_exam_attempts SET result=$2,feedback=$3,graded_by=$4,graded_at=now() WHERE id=$1",
            [row.id, JSON.stringify(result), v.feedback, v.actorId],
          );
          if (options.onFinished)
            await options.onFinished(
              client,
              { ...row, feedback: v.feedback },
              result,
            );
          return { success: true };
        }),
      );
    }),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 },
  });
  app.post(
    "/api/platform/native/assessment-files",
    auth,
    upload.single("audio"),
    run(async (req, res) => {
      const v = z.object({ attemptId: uuid, questionId: id }).parse(req.body),
        file = req.file;
      if (
        !file?.buffer?.length ||
        !/^audio\/(webm|ogg|mpeg|mp4|wav|x-m4a)$/.test(file.mimetype)
      )
        fail(400, "Mos audio fayl yuboring");
      res.json(
        await transaction(async (client) => {
          const g = await grant(client, req),
            row = (
              await client.query(
                "SELECT * FROM platform_exam_attempts WHERE id=$1 AND grant_order_id=$2 FOR UPDATE",
                [v.attemptId, g.order_id],
              )
            ).rows[0];
          if (!row) fail(404, "Urinish topilmadi");
          await expire(client, row);
          if (
            row.status !== "started" ||
            !row.snapshot.stages[row.stage_index].ids.includes(v.questionId) ||
            row.snapshot.questions.find((q: any) => q.id === v.questionId)
              ?.type !== "speaking"
          )
            fail(409, "Bu audio bosqichi tugagan");
          const saved = (
            await client.query(
              "INSERT INTO platform_exam_files(id,grant_order_id,external_user_id,attempt_id,question_id,mime_type,content) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(attempt_id,question_id) DO UPDATE SET mime_type=excluded.mime_type,content=excluded.content RETURNING id",
              [
                randomUUID(),
                g.order_id,
                g.external_user_id,
                row.id,
                v.questionId,
                file.mimetype,
                file.buffer,
              ],
            )
          ).rows[0];
          row.answers[v.questionId] = "/api/private-files/" + saved.id;
          await client.query(
            "UPDATE platform_exam_attempts SET answers=$2 WHERE id=$1",
            [row.id, JSON.stringify(row.answers)],
          );
          return { url: "/api/private-files/" + saved.id };
        }),
      );
    }),
  );
  async function fileResponse(req: Request, res: Response, admin = false) {
    const file = (
      await pool.query("SELECT * FROM platform_exam_files WHERE id=$1", [
        uuid.parse(req.params.fileId),
      ])
    ).rows[0];
    if (!file) fail(404, "Audio topilmadi");
    if (!admin)
      await transaction(async (client) => {
        const g = await grant(client, req);
        if (g.order_id !== file.grant_order_id)
          fail(403, "Audio sizga tegishli emas");
      });
    res
      .set({
        "Content-Type": file.mime_type,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      })
      .send(file.content);
  }
  app.get(
    "/api/platform/files/:fileId",
    auth,
    run((req, res) => fileResponse(req, res)),
  );
  app.get(
    "/api/platform/admin/files/:fileId",
    auth,
    run((req, res) => fileResponse(req, res, true)),
  );
  return { auth, run, transaction };
}
