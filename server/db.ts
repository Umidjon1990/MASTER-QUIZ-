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
}
