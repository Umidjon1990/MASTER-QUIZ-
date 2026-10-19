import type { Express, Request, Response, NextFunction } from "express";
const paid = new Set<string>();
let activePool: any;
export async function quizRequiresPlatformAccess(id: string) {
  return activePool
    ? !!(
        await activePool.query(
          "SELECT 1 FROM platform_quiz_sale_locks WHERE quiz_id=$1",
          [id],
        )
      ).rowCount
    : paid.has(id);
}
export async function loadQuizSaleLocks(pool: any) {
  activePool = pool;
  await pool.query(
    "CREATE TABLE IF NOT EXISTS platform_quiz_sale_locks(quiz_id varchar PRIMARY KEY,locked_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const row of (
    await pool.query("SELECT quiz_id FROM platform_quiz_sale_locks")
  ).rows)
    paid.add(row.quiz_id);
}
export async function protectQuizSale(pool: any, sourceId: string) {
  const id = sourceId.slice(5);
  await pool.query(
    "INSERT INTO platform_quiz_sale_locks(quiz_id) VALUES($1) ON CONFLICT DO NOTHING",
    [id],
  );
  paid.add(id);
}
export function registerQuizSaleGuard(app: Express, pool: any) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      let id: string | undefined;
      const direct =
        /^\/api\/quizzes\/([^/]+)\/(?:play|replay|submit-public|questions\/shuffled)$/.exec(
          req.path,
        );
      if (direct) id = decodeURIComponent(direct[1]);
      const shared = /^\/api\/shared\/([^/]+)(?:\/|$)/.exec(req.path);
      if (shared)
        id = (
          await pool.query("SELECT quiz_id FROM shared_quizzes WHERE code=$1", [
            decodeURIComponent(shared[1]),
          ])
        ).rows[0]?.quiz_id;
      if (!id || !(await quizRequiresPlatformAccess(id))) return next();
      const userId = req.platformEditor?.nativeId || (req.session as any)?.userId;
      if (userId) {
        const row = (
          await pool.query(
            "SELECT q.creator_id,p.role,p.is_active FROM quizzes q LEFT JOIN user_profiles p ON p.user_id=$2 WHERE q.id=$1",
            [id, userId],
          )
        ).rows[0];
        if (
          row?.is_active &&
          (row.creator_id === userId || row.role === "admin")
        )
          return next();
      }
      res
        .status(403)
        .json({
          message: "Bu test yagona kabinetdan ishlanadi",
          url: "https://zamonaviy-talim.up.railway.app/marketplace?type=test",
        });
    })().catch(next);
  });
}
