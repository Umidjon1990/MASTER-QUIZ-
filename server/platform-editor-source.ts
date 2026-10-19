import type { Express, Request, Response, NextFunction } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
export type EditorActor = {
  id: string;
  fullName: string;
  username: string;
  role: "admin";
};
export type EditorContext = {
  actor: EditorActor;
  nativeId: string;
  handle: string;
};
declare global {
  namespace Express {
    interface Request {
      platformEditor?: EditorContext;
    }
  }
}
type Options = {
  provider: string;
  editorPath: string;
  resolve: (actor: EditorActor) => Promise<string>;
  attach?: (req: Request, ctx: EditorContext) => void;
  prepareBrowser?: (ctx: EditorContext) => Record<string, string>;
  coreUrl?: string;
  portalUrl?: string;
  fetch?: typeof fetch;
};
const equal = (a: string, b: string) =>
  timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
const cookie = (req: Request, name: string) =>
  (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + "="))
    ?.slice(name.length + 1) || "";
const valid = (v: any) =>
  typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);
let currentAuthenticate:
  | ((req: Request) => Promise<EditorContext | null>)
  | undefined;
export const authenticateEditorRequest = (req: Request) =>
  currentAuthenticate ? currentAuthenticate(req) : Promise.resolve(null);
export function createEditorSource(app: Express, options: Options) {
  const core =
      options.coreUrl || "https://tube-mentor-production.up.railway.app",
    portal = options.portalUrl || "https://zamonaviy-talim.up.railway.app",
    request = options.fetch || fetch;
  const secure = process.env.NODE_ENV === "production",
    cookies = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
  const key = () => process.env.PLATFORM_SERVICE_SECRET || "";
  async function remote(path: string, body: any) {
    if (key().length < 32)
      throw Object.assign(new Error("Muharrir ulanishi sozlanmagan"), {
        status: 503,
      });
    const response = await request(core + "/api/platform/editor/" + path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-platform-key": key() },
      body: JSON.stringify({ ...body, provider: options.provider }),
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      throw Object.assign(
        new Error(
          response.status === 401
            ? "Asosiy hisobga qayta kiring"
            : "Muharrirga ulanib bo‘lmadi",
        ),
        { status: response.status === 401 ? 401 : 503 },
      );
    return response.json();
  }
  async function authenticate(req: Request): Promise<EditorContext | null> {
    const handle = cookie(req, "zt_editor");
    if (!valid(handle)) return null;
    const result = await remote("validate", { handle }),
      actor = result.actor;
    if (actor?.role !== "admin" || typeof actor.id !== "string")
      throw Object.assign(new Error("Admin ruxsati kerak"), { status: 403 });
    return { actor, nativeId: await options.resolve(actor), handle };
  }
  currentAuthenticate = authenticate;
  const middleware = (req: Request, res: Response, next: NextFunction) => {
    if (
      cookie(req, "zt_editor") &&
      [
        "/api/logout",
        "/api/auth/logout",
        "/api/login",
        "/api/auth/login",
        "/api/admin/login",
      ].includes(req.path)
    ) {
      const handle = cookie(req, "zt_editor");
      if ((req as any).session)
        delete (req as any).session.platformEditorHandle;
      res.clearCookie("zt_editor", cookies);
      void remote("revoke", { handle }).catch(() => {});
      return next();
    }
    if (
      !req.path.startsWith("/api/") ||
      req.path.startsWith("/api/platform/editor/") ||
      req.path.startsWith("/api/platform/")
    )
      return next();
    // Source writes with an editor cookie must come from this source origin.
    if (
      cookie(req, "zt_editor") &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin")
    ) {
      try {
        if (new URL(req.get("origin")!).host !== req.get("host"))
          return res
            .status(403)
            .json({ message: "So‘rov manbasi ruxsat etilmagan" });
      } catch {
        return res.status(403).json({ message: "So‘rov manbasi noto‘g‘ri" });
      }
    }
    void authenticate(req)
      .then((ctx) => {
        if (ctx) {
          req.platformEditor = ctx;
          options.attach?.(req, ctx);
        }
        next();
      })
      .catch((error: any) => {
        if (error.status === 401) res.clearCookie("zt_editor", cookies);
        res
          .status(error.status === 401 ? 401 : 503)
          .json({
            message: error.message || "Muharrir sessiyasini tekshirib bo‘lmadi",
          });
      });
  };
  function routes() {
    app.get("/api/platform/editor/start", (req, res) => {
      if (key().length < 32)
        return res.status(503).send("Muharrir ulanishi sozlanmagan");
      const state = randomBytes(32).toString("base64url");
      res.cookie("zt_editor_state", state, { ...cookies, maxAge: 300000 });
      res.set("Cache-Control", "no-store");
      const target = new URL(
        "/api/platform/editor/" + options.provider + "/authorize",
        portal,
      );
      target.searchParams.set("state", state);
      res.redirect(target.href);
    });
    app.get("/api/platform/editor/complete", (req, res) => {
      void (async () => {
        const state = String(req.query.state || ""),
          code = String(req.query.code || ""),
          saved = cookie(req, "zt_editor_state");
        res.clearCookie("zt_editor_state", cookies);
        if (
          !valid(state) ||
          !valid(code) ||
          !valid(saved) ||
          !equal(state, saved)
        )
          return res
            .status(403)
            .send("Kirish holati mos emas. Asosiy kabinetdan qayta oching.");
        const result = await remote("redeem", { code, state }),
          ctx: EditorContext = {
            actor: result.actor,
            nativeId: await options.resolve(result.actor),
            handle: result.handle,
          };
        if (!valid(ctx.handle) || ctx.actor?.role !== "admin")
          throw new Error("Kirish javobi noto‘g‘ri");
        res.cookie("zt_editor", ctx.handle, {
          ...cookies,
          maxAge: Math.min(
            8 * 3600000,
            Math.max(0, new Date(result.expiresAt).getTime() - Date.now()),
          ),
        });
        const cspNonce = randomBytes(18).toString("base64");
        res.set({
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy":
            "default-src 'none'; script-src 'nonce-" +
            cspNonce +
            "'; base-uri 'none'; frame-ancestors 'none'",
        });
        const values = options.prepareBrowser?.(ctx) || {},
          script =
            "const values=" +
            JSON.stringify(values).replace(/</g, "\\u003c") +
            ";for(const [k,v] of Object.entries(values))localStorage.setItem(k,v);location.replace(" +
            JSON.stringify(options.editorPath) +
            ");";
        return res
          .type("html")
          .send(
            '<!doctype html><meta name="referrer" content="no-referrer"><title>Muharrir ochilmoqda</title><script nonce="' +
              cspNonce +
              '">' +
              script +
              "</script>",
          );
      })().catch((e: any) =>
        res
          .status(e.status || 503)
          .send(
            "Muharrirni ochib bo‘lmadi. Asosiy kabinetdan qayta urinib ko‘ring.",
          ),
      );
    });
    app.post("/api/platform/editor/logout", (req, res) => {
      try {
        if (
          req.get("origin") &&
          new URL(req.get("origin")!).host !== req.get("host")
        )
          return res
            .status(403)
            .json({ message: "So‘rov manbasi ruxsat etilmagan" });
      } catch {
        return res.status(403).json({ message: "So‘rov manbasi noto‘g‘ri" });
      }
      const handle = cookie(req, "zt_editor");
      res.clearCookie("zt_editor", cookies);
      void remote("revoke", { handle }).catch(() => {});
      res.json({ success: true });
    });
  }
  return { middleware, routes, authenticate };
}
