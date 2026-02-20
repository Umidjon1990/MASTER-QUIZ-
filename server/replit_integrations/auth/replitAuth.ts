import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { authStorage } from "./storage";
import { db } from "../../db";
import { userProfiles } from "@shared/schema";
import { eq } from "drizzle-orm";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET || "quizlive-secret-key-2024",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email va parol kerak" });
      }

      const existing = await authStorage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ message: "Bu email allaqachon ro'yxatdan o'tgan" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await authStorage.upsertUser({
        email,
        password: hashedPassword,
        firstName: firstName || null,
        lastName: lastName || null,
      });

      const { sql } = await import("drizzle-orm");
      const [existingUsersCount] = await db.select({ count: sql<number>`count(*)` }).from(userProfiles);
      const isFirstUser = Number(existingUsersCount.count) === 0;
      const finalRole = isFirstUser ? "admin" : "student";

      await db.insert(userProfiles).values({
        userId: user.id,
        role: finalRole,
        displayName: `${firstName || ""} ${lastName || ""}`.trim() || email,
        plan: isFirstUser ? "premium" : "free",
        quizLimit: isFirstUser ? 999 : 5,
      });

      (req.session as any).userId = user.id;
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ message: "Ro'yxatdan o'tishda xatolik" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email va parol kerak" });
      }

      const user = await authStorage.getUserByEmail(email);
      if (!user || !user.password) {
        return res.status(401).json({ message: "Email yoki parol noto'g'ri" });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Email yoki parol noto'g'ri" });
      }

      (req.session as any).userId = user.id;
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Kirishda xatolik" });
    }
  });

  app.get("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = await authStorage.getUser(userId);
  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, user.id));
  if (profile) {
    if (!profile.isActive) {
      return res.status(403).json({ message: "Hisobingiz faolsizlantirilgan. Admin bilan bog'laning." });
    }
    if (profile.subscriptionExpiresAt && new Date(profile.subscriptionExpiresAt) < new Date()) {
      return res.status(403).json({ message: "Obuna muddatingiz tugagan. Admin bilan bog'laning." });
    }
  }

  (req as any).userId = user.id;
  (req as any).userEmail = user.email;
  (req as any).userFirstName = user.firstName;
  next();
};
