import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();
const httpServer = createServer(app);
let isReady = false;

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Juda ko'p urinish. 15 daqiqadan so'ng qayta urinib ko'ring." },
});

app.use(["/api/auth/login", "/api/auth/register", "/api/reset-password"], authLimiter);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "10mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      log(`${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

app.get("/health", (_req, res) => {
  res.status(isReady ? 200 : 503).json({
    status: isReady ? "ok" : "starting",
    uptime: process.uptime(),
  });
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[CRITICAL] Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[CRITICAL] Uncaught Exception:", err);
});

const port = parseInt(process.env.PORT || "5000", 10);

if (process.env.NODE_ENV === "production") {
  httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`health ready on port ${port}, loading app...`);
  });
}

(async () => {
  const { runMigrations } = await import("./db");
  await runMigrations();

  const { registerRoutes } = await import("./routes");
  await registerRoutes(httpServer, app);

  if (process.env.PREVIEW_MODE !== "true") {
    const { restoreActiveBots } = await import("./ai-bot");
    const { storage } = await import("./storage");
    restoreActiveBots(storage).catch(err => console.error("[AI-BOT] Restore failed:", err));

    const { startFeedbackScheduler } = await import("./ai-feedback-scheduler");
    startFeedbackScheduler();
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    const { serveStatic } = await import("./static");
    serveStatic(app);
    isReady = true;
    log(`fully loaded, serving static files`);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
    isReady = true;
    httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
      log(`serving on port ${port}`);
    });
  }
})();
