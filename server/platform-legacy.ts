import type { Express } from "express";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { fail, type ExamDefinition } from "./platform-engine";

export type LegacyPurchase = {
  ref: any;
  sourceId: string;
  maxAttempts: number;
  usedAttempts: number;
  expiresAt: Date | null;
  active: boolean;
};
export type LegacyOptions = {
  provider: string;
  pool: any;
  definition: (id: string, purchased?: boolean) => Promise<ExamDefinition>;
  verify: (
    username: string,
    password: string,
  ) => Promise<{ id: string; fullName: string } | null>;
  purchases: (db: any, nativeId: string) => Promise<LegacyPurchase[]>;
};
export function legacyOrderId(provider: string, ref: any) {
  const hash = createHash("sha256")
    .update(provider + ":legacy:" + JSON.stringify(ref))
    .digest("hex");
  return (
    hash.slice(0, 8) +
    "-" +
    hash.slice(8, 12) +
    "-5" +
    hash.slice(13, 16) +
    "-a" +
    hash.slice(17, 20) +
    "-" +
    hash.slice(20, 32)
  );
}
export async function registerLegacyBridge(
  app: Express,
  engine: any,
  options: LegacyOptions,
) {
  const { pool, provider } = options;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS platform_legacy_links(external_user_id varchar PRIMARY KEY,native_user_id varchar NOT NULL UNIQUE,full_name text NOT NULL,linked_at timestamptz NOT NULL DEFAULT now());CREATE TABLE IF NOT EXISTS platform_legacy_link_audit(id uuid PRIMARY KEY,external_user_id varchar NOT NULL,native_user_id varchar NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`,
  );
  const failures = new Map<string, { n: number; until: number }>();
  async function imported(
    externalUserId: string,
    nativeId: string,
    fullName: string,
    claim: boolean,
  ) {
    const purchases = await options.purchases(pool, nativeId),
      items: any[] = [],
      warnings: string[] = [];
    for (const p of purchases) {
      try {
        items.push({
          purchase: p,
          definition: await options.definition(p.sourceId, true),
        });
      } catch {
        warnings.push(p.sourceId);
      }
    }
    return engine.transaction(async (client: any) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "legacy:" + nativeId,
      ]);
      const prior = (
        await client.query(
          "SELECT * FROM platform_legacy_links WHERE external_user_id=$1 OR native_user_id=$2 FOR UPDATE",
          [externalUserId, nativeId],
        )
      ).rows;
      if (
        prior.some(
          (r: any) =>
            r.external_user_id !== externalUserId ||
            r.native_user_id !== nativeId,
        )
      )
        fail(409, "Bu eski hisob boshqa hisobga bog‘langan");
      if (claim && !prior.length) {
        await client.query(
          "INSERT INTO platform_legacy_links(external_user_id,native_user_id,full_name) VALUES($1,$2,$3)",
          [externalUserId, nativeId, fullName],
        );
        await client.query(
          "INSERT INTO platform_legacy_link_audit(id,external_user_id,native_user_id) VALUES($1,$2,$3)",
          [randomUUID(), externalUserId, nativeId],
        );
      }
      if (!claim && !prior.length) fail(403, "Eski hisob tasdiqlanmagan");
      const grants = [];
      for (const item of items) {
        const p: LegacyPurchase = item.purchase,
          d: ExamDefinition = item.definition,
          orderId = legacyOrderId(provider, p.ref);
        const expires = p.active ? p.expiresAt : new Date(0);
        const previous = (
          await client.query(
            "SELECT external_user_id,revoked_at FROM platform_exam_grants WHERE order_id=$1 FOR UPDATE",
            [orderId],
          )
        ).rows[0];
        if (previous && previous.external_user_id !== externalUserId)
          fail(409, "Xarid boshqa hisobga bog‘langan");
        await client.query(
          "INSERT INTO platform_exam_grants(order_id,external_user_id,source_id,source_version,title,full_name,max_attempts,used_attempts,expires_at,legacy_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(order_id) DO UPDATE SET title=excluded.title,max_attempts=excluded.max_attempts,used_attempts=excluded.used_attempts,expires_at=CASE WHEN platform_exam_grants.revoked_at IS NULL THEN excluded.expires_at ELSE platform_exam_grants.expires_at END",
          [
            orderId,
            externalUserId,
            p.sourceId,
            d.version,
            d.title,
            fullName,
            p.maxAttempts,
            p.usedAttempts,
            expires,
            JSON.stringify({ ...p.ref, nativeId }),
          ],
        );
        grants.push({
          orderId,
          sourceId: p.sourceId,
          kind: "test",
          title: d.title,
          description: d.description || "",
          sourceVersion: d.version,
          expiresAt: expires,
          maxAttempts: p.maxAttempts,
          attemptsRemaining: Math.max(0, p.maxAttempts - p.usedAttempts),
          legacy: true,
          revoked: !!previous?.revoked_at,
        });
      }
      return { linked: true, provider, fullName, grants, warnings };
    });
  }
  app.post(
    "/api/platform/legacy/link",
    engine.auth,
    engine.run(async (req: any, res: any) => {
      const v = z
        .object({
          externalUserId: z.string().min(1).max(100),
          username: z.string().trim().min(1).max(200),
          password: z.string().min(1).max(1024),
        })
        .strict()
        .parse(req.body);
      const now = Date.now(),
        limit = failures.get(v.externalUserId);
      if (limit && limit.until > now && limit.n >= 8)
        fail(429, "Birozdan keyin qayta urinib ko‘ring");
      failures.set(v.externalUserId, {
        n: (limit && limit.until > now ? limit.n : 0) + 1,
        until: now + 900000,
      });
      if (failures.size > 10000)
        for (const [k, value] of failures)
          if (value.until < now) failures.delete(k);
      const account = await options.verify(v.username, v.password);
      if (!account)
        fail(
          401,
          "Eski hisob login yoki paroli noto‘g‘ri, yoxud hisob faol emas",
        );
      const result = await imported(
        v.externalUserId,
        account.id,
        account.fullName,
        true,
      );
      failures.delete(v.externalUserId);
      res.json(result);
    }),
  );
  app.get(
    "/api/platform/legacy/status/:externalUserId",
    engine.auth,
    engine.run(async (req: any, res: any) => {
      const external = z
        .string()
        .min(1)
        .max(100)
        .parse(req.params.externalUserId);
      const link = (
        await pool.query(
          "SELECT * FROM platform_legacy_links WHERE external_user_id=$1",
          [external],
        )
      ).rows[0];
      if (!link) return res.json({ linked: false, provider, grants: [] });
      res.json(
        await imported(external, link.native_user_id, link.full_name, false),
      );
    }),
  );
}
