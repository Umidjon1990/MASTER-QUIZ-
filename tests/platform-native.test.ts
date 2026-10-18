import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { installSchema } from "./schema-fixture";

test("native published quiz catalog, paid lock and learner grading use actual schema", async () => {
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = (probe.address() as any).port;
  await new Promise<void>((r) => probe.close(() => r()));
  const db = await PGlite.create(),
    socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port });
  await socket.start();
  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  process.env.PREVIEW_DATABASE = "pglite";
  process.env.PLATFORM_SERVICE_SECRET = "native-provider-key-" + randomUUID();
  const { pool } = await import("../server/db");
  const { registerQuizPlatform } = await import("../server/platform-provider");
  let server: any;
  try {
    await installSchema(pool);
    await pool.query(
      "INSERT INTO quizzes(id,title,creator_id,is_public,status,timer_enabled) VALUES('one','Native quiz','teacher',true,'published',true),('draft','Draft','teacher',true,'draft',false)",
    );
    await pool.query(
      "INSERT INTO questions(id,quiz_id,type,question_text,options,correct_answer) VALUES('q','one','multiple_choice','Choose',$1,'B')",
      [JSON.stringify(["A", "B", "C"])],
    );
    const app = express();
    app.use(express.json());
    await registerQuizPlatform(app);
    app.get("/api/quizzes/:id/questions/shuffled", (_req,res)=>res.json({leaked:true}));
    app.get("/api/quizzes/:id/play", (_req, res) => res.json({ native: true }));
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const order = randomUUID(),
      headers = {
        "x-platform-key": process.env.PLATFORM_SERVICE_SECRET,
        "x-platform-user": "learner",
        "x-platform-order": order,
        "content-type": "application/json",
      };
    const call = async (path: string, body?: any) => {
      const r = await fetch(base + path, {
        headers,
        method: body === undefined ? "GET" : "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.status, data: await r.json() };
    };
    const catalog = await call("/api/platform/catalog");
    assert.equal(catalog.data.products.length, 1);
    const p = catalog.data.products[0];
    assert.equal((await call("/api/quizzes/one/play")).status, 200);
    assert.equal(
      (await call("/api/platform/products/quiz%3Aone/sale", { enabled: true }))
        .status,
      200,
    );
    assert.equal((await call("/api/quizzes/one/play")).status, 403);
    assert.equal((await call("/api/quizzes/one/questions/shuffled")).status,403);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM platform_quiz_sale_locks",
        )
      ).rows[0].n,
      1,
    );
    const demo = await call("/api/platform/products/quiz%3Aone/demo");
    assert.equal(demo.data.items[0].correctAnswer, undefined);
    assert.equal(
      (
        await call("/api/platform/grants", {
          orderId: order,
          externalUserId: "learner",
          sourceId: p.sourceId,
          sourceVersion: p.sourceVersion,
          kind: "test",
          durationDays: 30,
          maxAttempts: 1,
        })
      ).status,
      200,
    );
    const start = await call(
      "/api/platform/native/course-exams/quiz%3Aone/start",
      {},
    );
    assert.equal(start.status, 200);
    const snapshot = (
        await pool.query(
          "SELECT snapshot FROM platform_exam_attempts WHERE id=$1",
          [start.data.id],
        )
      ).rows[0].snapshot,
      q = snapshot.questions[0];
    const option = q.options.find((o: any) => o.value === "B").id;
    const submitted = await call(
      "/api/platform/native/course-exam-attempts/" + start.data.id,
      { stageIndex: 0, answers: { q: option }, action: "finish" },
    );
    assert.equal(submitted.data.result.percentage, 100);
  } finally {
    if (server) await new Promise<void>((r) => server.close(() => r()));
    await pool.end();
    await socket.stop();
    await db.close();
  }
});
