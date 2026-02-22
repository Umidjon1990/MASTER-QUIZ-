import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "@shared/schema";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

async function runManualMigrations() {
  const client = await pool.connect();
  try {
    const alterQueries = [
      `ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "scheduled_telegram_quiz_chat_id" varchar(100)`,
      `ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "allow_replay" boolean NOT NULL DEFAULT false`,
      `ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "folder_id" varchar`,
      `CREATE TABLE IF NOT EXISTS "quiz_folders" ("id" varchar PRIMARY KEY DEFAULT gen_random_uuid(), "name" varchar(255) NOT NULL, "creator_id" varchar NOT NULL, "created_at" timestamp DEFAULT now())`,
      `ALTER TABLE "quiz_folders" ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0`,
      `ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "order_in_folder" integer NOT NULL DEFAULT 0`,
    ];
    for (const q of alterQueries) {
      try {
        await client.query(q);
      } catch (e: any) {
        if (!e.message?.includes("already exists")) {
          console.error("[DB] Manual migration error:", e.message);
        }
      }
    }
    console.log("[DB] Manual migrations checked");
  } finally {
    client.release();
  }
}

export async function runMigrations() {
  console.log("[DB] Running migrations...");
  try {
    const isProd = process.env.NODE_ENV === "production";
    const migrationsFolder = isProd
      ? path.resolve(process.cwd(), "dist", "migrations")
      : path.resolve(process.cwd(), "migrations");
    console.log("[DB] Migrations folder:", migrationsFolder);
    await migrate(db, { migrationsFolder });
    console.log("[DB] Migrations completed successfully");
  } catch (error: any) {
    if (error.message?.includes("already exists")) {
      console.log("[DB] Tables already exist, skipping migration");
    } else {
      console.error("[DB] Migration error:", error);
      throw error;
    }
  }
  await runManualMigrations();
}
