import { spawn } from "node:child_process";
import path from "node:path";

async function startPreviewDatabase() {
  const [{ PGlite }, { PGLiteSocketServer }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("@electric-sql/pglite-socket"),
  ]);

  const database = await PGlite.create("memory://");
  const databaseServer = new PGLiteSocketServer({
    db: database,
    host: "127.0.0.1",
    port: 55432,
  });
  await databaseServer.start();

  process.env.DATABASE_URL = "postgres://postgres@127.0.0.1:55432/postgres";
  process.env.SESSION_SECRET ||= "local-preview-session-secret";
  process.env.OPENAI_API_KEY ||= "sk-local-preview-not-a-real-key";
  process.env.PREVIEW_MODE = "true";
  process.env.PREVIEW_DATABASE = "pglite";

  const executable = path.resolve(
    "node_modules",
    ".bin",
    process.platform === "win32" ? "drizzle-kit.cmd" : "drizzle-kit",
  );

  await new Promise<void>((resolve, reject) => {
    const schemaPush = spawn(executable, ["push", "--force"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    schemaPush.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Schema push failed: ${code}`)));
  });

  const cleanup = async () => {
    await databaseServer.stop();
    await database.close();
  };
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);
}

process.env.NODE_ENV ||= "development";

const portFlagIndex = process.argv.indexOf("--port");
if (portFlagIndex >= 0 && process.argv[portFlagIndex + 1]) {
  process.env.PORT = process.argv[portFlagIndex + 1];
}

if (!process.env.DATABASE_URL) {
  console.log("[DEV] DATABASE_URL topilmadi — vaqtinchalik preview bazasi ishga tushirilmoqda");
  await startPreviewDatabase();
}

await import("../server/index");
