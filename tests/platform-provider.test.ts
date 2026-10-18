import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import express from "express";
import {
  registerExamProvider,
  safeQuestion,
  type ExamDefinition,
} from "../server/platform-engine";

test("source assessment transactions protect grants, frozen timed attempts, review and private audio", async (t) => {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = (probe.address() as any).port;
  await new Promise<void>((r) => probe.close(() => r()));
  const db = await PGlite.create();
  const socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port });
  await socket.start();
  const pool = new Pool({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${port}/postgres`,
    max: 1,
  });
  process.env.PLATFORM_SERVICE_SECRET =
    "integration-provider-key-" + randomUUID();
  const questions = [
    {
      id: "choice",
      type: "multiple_choice",
      questionText: "اخْتَرْ",
      points: 2,
      options: [
        { id: "opaque-a", optionText: "A", value: "A" },
        { id: "opaque-b", optionText: "B", value: "B" },
      ],
      correctAnswer: "B",
    },
    {
      id: "writing",
      type: "essay",
      questionText: "اُكْتُبْ",
      points: 4,
      options: [],
    },
    {
      id: "voice",
      type: "speaking",
      questionText: "تَكَلَّمْ",
      points: 4,
      options: [],
    },
  ];
  let definition: ExamDefinition = {
    id: "test:one",
    title: "SQL fixture",
    version: "one",
    showResult: true,
    passingScore: 60,
    questions,
    stages: [
      { ids: ["choice"], seconds: 60, label: "Choice" },
      { ids: ["writing", "voice"], seconds: 60, label: "Manual" },
    ],
  };
  const app = express();
  app.use(express.json());
  await registerExamProvider(app, {
    pool,
    catalog: async () => [{ sourceId: definition.id }],
    definition: async () => structuredClone(definition),
    grade: (q, a) =>
      q.type === "essay" || q.type === "speaking"
        ? null
        : q.options.find((o: any) => o.id === a)?.value === q.correctAnswer
          ? 1
          : 0,
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/platform`;
  const user = "external-user",
    order = randomUUID(),
    headers = {
      "x-platform-key": process.env.PLATFORM_SERVICE_SECRET,
      "x-platform-user": user,
      "x-platform-order": order,
    };
  async function call(
    path: string,
    body?: unknown,
    extra: Record<string, string> = {},
  ) {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...headers,
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...extra,
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
    return {
      status: response.status,
      data: await response.json().catch(() => null),
    };
  }
  const grant = {
    orderId: order,
    externalUserId: user,
    sourceId: definition.id,
    sourceVersion: "one",
    kind: "test",
    fullName: "Fixture student",
    durationDays: 30,
    maxAttempts: 1,
  };
  try {
    await t.test(
      "service auth and preview reveal no private answer configuration",
      async () => {
        assert.equal((await fetch(base + "/catalog")).status, 403);
        const demo = await call("/products/test%3Aone/demo");
        assert.equal(demo.status, 200);
        assert.equal(demo.data.items.length, 3);
        for (const q of demo.data.items) {
          assert.equal(q.correctAnswer, undefined);
          assert.equal(q.native, undefined);
          assert.equal(q.options?.[0]?.value, undefined);
        }
        assert.equal(
          safeQuestion({
            id: "x",
            options: [],
            config: { accepted: ["secret"] },
          }).config.accepted,
          undefined,
        );
      },
    );
    await t.test(
      "delivery retries, ownership and revoke-before-delivery are durable",
      async () => {
        assert.equal((await call("/grants", grant)).status, 200);
        assert.equal((await call("/grants", grant)).status, 200);
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM platform_exam_grants",
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (await call("/grants", { ...grant, externalUserId: "other" })).status,
          409,
        );
        const cancelled = randomUUID();
        assert.equal(
          (
            await call(`/grants/${cancelled}/manage`, {
              externalUserId: user,
              operationId: randomUUID(),
              action: "revoke",
            })
          ).status,
          200,
        );
        assert.equal(
          (await call("/grants", { ...grant, orderId: cancelled })).status,
          409,
        );
      },
    );
    let active: any;
    await t.test(
      "concurrent start consumes once and snapshots survive source edits",
      async () => {
        const started = await Promise.all([
          call("/native/course-exams/test%3Aone/start", {}),
          call("/native/course-exams/test%3Aone/start", {}),
        ]);
        assert.ok(started.every((r) => r.status === 200));
        assert.equal(started[0].data.id, started[1].data.id);
        active = started[0].data;
        assert.equal(
          (
            await pool.query(
              "SELECT used_attempts FROM platform_exam_grants WHERE order_id=$1",
              [order],
            )
          ).rows[0].used_attempts,
          1,
        );
        definition = {
          ...definition,
          title: "Changed",
          questions: [
            { ...questions[0], questionText: "Edited" },
            ...questions.slice(1),
          ],
        };
        const resumed = await call("/native/course-exams/test%3Aone/start", {});
        assert.equal(resumed.data.id, active.id);
        assert.equal(resumed.data.questions[0].questionText, "اخْتَرْ");
        assert.equal(
          (
            await call(`/native/course-exam-attempts/${active.id}`, undefined, {
              "x-platform-user": "attacker",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await call(`/native/course-exam-attempts/${active.id}`, {
              stageIndex: 0,
              answers: { writing: "future" },
              action: "save",
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "answers are server graded; private recordings are scoped and retry-safe",
      async () => {
        const next = await call(`/native/course-exam-attempts/${active.id}`, {
          stageIndex: 0,
          answers: { choice: "opaque-b" },
          action: "next",
        });
        assert.equal(next.status, 200);
        assert.equal(next.data.stageIndex, 1);
        const form = () => {
          const f = new FormData();
          f.set("attemptId", active.id);
          f.set("questionId", "voice");
          f.set(
            "audio",
            new Blob(["test recording"], { type: "audio/webm" }),
            "answer.webm",
          );
          return f;
        };
        await pool.query(
          "UPDATE platform_exam_attempts SET deadline=now()-interval '1 second' WHERE id=$1",
          [active.id],
        );
        const uploaded = await call("/native/assessment-files", form());
        assert.equal(uploaded.status, 200);
        assert.equal(
          (await call("/native/assessment-files", form())).data.url,
          uploaded.data.url,
        );
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM platform_exam_files",
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await pool.query(
              "SELECT answers FROM platform_exam_attempts WHERE id=$1",
              [active.id],
            )
          ).rows[0].answers.voice,
          uploaded.data.url,
        );
        const fileId = uploaded.data.url.split("/").pop();
        assert.equal(
          (await fetch(base + "/files/" + fileId, { headers })).status,
          200,
        );
        assert.equal(
          (
            await fetch(base + "/files/" + fileId, {
              headers: { ...headers, "x-platform-user": "other" },
            })
          ).status,
          403,
        );
        const submitted = await call(
          `/native/course-exam-attempts/${active.id}`,
          {
            stageIndex: 1,
            answers: { writing: "My original essay", voice: uploaded.data.url },
            action: "finish",
          },
        );
        assert.equal(submitted.data.result.score, 2);
        assert.equal(submitted.data.result.requiresManualReview, true);
        assert.equal(
          (
            await call(`/native/course-exam-attempts/${active.id}`, {
              stageIndex: 1,
              answers: { writing: "changed" },
              action: "finish",
            })
          ).data.status,
          "submitted",
        );
        assert.equal(
          (await call("/native/course-exams/test%3Aone/start", {})).status,
          403,
        );
        const reviews = await call("/admin/exam-attempts");
        assert.equal(reviews.data.attempts.length, 1);
        assert.equal(
          (
            await call(`/admin/exam-attempts/${active.id}/grade`, {
              actorId: "verified-admin",
              kind: "exam",
              scores: { writing: 5, voice: 4 },
              feedback: "Good effort",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await call(`/admin/exam-attempts/${active.id}/grade`, {
              actorId: "verified-admin",
              kind: "exam",
              scores: { writing: 3, voice: 4 },
              feedback: "Good effort",
            })
          ).status,
          200,
        );
        const result = await call(`/native/course-exam-attempts/${active.id}`);
        assert.equal(result.data.result.score, 9);
        assert.equal(result.data.result.requiresManualReview, false);
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM platform_exam_review_audit",
            )
          ).rows[0].n,
          1,
        );
        const library = await call("/users/external-user/library");
        assert.equal(library.data.grants[0].attemptsRemaining, 0);
      },
    );
    await t.test(
      "server expiry drops late answers and extension/revocation retry once",
      async () => {
        const timedOrder = randomUUID(),
          extra = { "x-platform-order": timedOrder };
        assert.equal(
          (await call("/grants", { ...grant, orderId: timedOrder })).status,
          200,
        );
        const started = await call(
          "/native/course-exams/test%3Aone/start",
          {},
          extra,
        );
        await pool.query(
          "UPDATE platform_exam_attempts SET deadline=now()-interval '1 second' WHERE id=$1",
          [started.data.id],
        );
        const late = await call(
          `/native/course-exam-attempts/${started.data.id}`,
          { stageIndex: 0, answers: { choice: "opaque-b" }, action: "save" },
          extra,
        );
        assert.equal(late.data.stageIndex, 1);
        assert.equal(late.data.answers.choice, undefined);
        const operationId = randomUUID(),
          v = { externalUserId: user, operationId, action: "extend", days: 2 };
        const first = await call(`/grants/${timedOrder}/manage`, v),
          again = await call(`/grants/${timedOrder}/manage`, v);
        assert.equal(first.status, 200);
        assert.equal(first.data.expiresAt, again.data.expiresAt);
        await pool.query(
          "UPDATE platform_exam_grants SET expires_at=now()-interval '1 second' WHERE order_id=$1",
          [timedOrder],
        );
        assert.equal(
          (
            await call(
              `/native/course-exam-attempts/${started.data.id}`,
              undefined,
              extra,
            )
          ).status,
          403,
        );
        assert.equal(
          (await call("/owned/test%3Aone/history", undefined, extra)).status,
          200,
        );
        assert.equal(
          (
            await call(`/grants/${timedOrder}/manage`, {
              externalUserId: user,
              operationId: randomUUID(),
              action: "revoke",
            })
          ).status,
          200,
        );
        assert.equal(
          (await call("/grants", { ...grant, orderId: timedOrder })).data
            .active,
          false,
        );
      },
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await pool.end();
    await socket.stop();
    await db.close();
  }
});
