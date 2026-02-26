import type { Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replit_integrations/auth";
import { registerAuthRoutes } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { setupWebSocket, getScheduledQuizRoomCode, isRestorationComplete } from "./websocket";
import multer from "multer";
import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";
import { fisherYatesShuffle, balancedShuffleOptions } from "./shuffle";
import { generateQuizPDF, generateQuizDOCX } from "./quiz-export";
import { startAiBot, stopAiBot, activeBots } from "./ai-bot";

const upload = multer({ storage: multer.memoryStorage() });

function generateJoinCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);
  registerObjectStorageRoutes(app);

  app.post("/api/reset-password", async (req: any, res) => {
    try {
      const { email, newPassword, secret } = req.body;
      if (secret !== "quizlive-reset-2024") {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (!email || !newPassword) {
        return res.status(400).json({ message: "Email va yangi parol kerak" });
      }
      const user = await authStorage.getUserByEmail(email);
      if (!user) return res.status(404).json({ message: "User not found" });
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const { eq } = await import("drizzle-orm");
      const { users } = await import("@shared/schema");
      const { db } = await import("./db");
      await db.update(users).set({ password: hashedPassword }).where(eq(users.id, user.id));
      res.json({ success: true, message: "Password updated" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Error" });
    }
  });

  app.post("/api/setup-admin", async (req: any, res) => {
    try {
      const { email } = req.body;
      const allProfiles = await storage.getAllUserProfiles();
      const hasAdmin = allProfiles.some((p: any) => p.role === "admin");
      if (hasAdmin) {
        return res.status(403).json({ message: "Admin already exists" });
      }
      const user = await authStorage.getUserByEmail(email);
      if (!user) return res.status(404).json({ message: "User not found" });
      const existing = await storage.getUserProfile(user.id);
      if (existing) {
        await storage.updateUserProfile(user.id, { role: "admin", plan: "premium", quizLimit: 999 });
      } else {
        await storage.createUserProfile({ userId: user.id, role: "admin", displayName: email, plan: "premium", quizLimit: 999 });
      }
      res.json({ success: true, message: "Admin created" });
    } catch (error) {
      console.error("Setup admin error:", error);
      res.status(500).json({ message: "Error" });
    }
  });

  const requireAuth = isAuthenticated;

  const requireRole = (roles: string[]) => {
    return async (req: any, res: any, next: any) => {
      const userId = req.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getUserProfile(userId);
      if (!profile || !roles.includes(profile.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      req.userProfile = profile;
      next();
    };
  };

  async function isTeacherOrAssistant(userId: string, cls: any, permission?: string): Promise<{ allowed: boolean; isAssistant: boolean; assistant?: any }> {
    if (cls.teacherId === userId) return { allowed: true, isAssistant: false };
    const assistant = await storage.getClassAssistantByUserId(cls.id, userId);
    if (!assistant || assistant.status !== "active") return { allowed: false, isAssistant: false };
    if (permission) {
      const perms = assistant.permissions as any;
      if (!perms?.[permission]) return { allowed: false, isAssistant: true, assistant };
    }
    return { allowed: true, isAssistant: true, assistant };
  }

  app.get("/api/profile", requireAuth, async (req: any, res) => {
    try {
      const userId = req.userId;
      let profile = await storage.getUserProfile(userId);
      if (!profile) {
        profile = await storage.createUserProfile({
          userId,
          role: "student",
          displayName: req.userFirstName || req.userEmail || "User",
          plan: "free",
          quizLimit: 5,
        });
      }
      const { telegramBotToken, ...safeProfile } = profile as any;
      res.json({ ...safeProfile, hasTelegramBot: !!telegramBotToken, telegramBotToken: telegramBotToken ? `****${telegramBotToken.slice(-6)}` : null });
    } catch (error) {
      console.error("Error getting profile:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/profile", requireAuth, async (req: any, res) => {
    try {
      const userId = req.userId;
      const { telegramBotToken: _tbt, ...safeBody } = req.body;
      const updated = await storage.updateUserProfile(userId, safeBody);
      const { telegramBotToken, ...safeResult } = updated as any;
      res.json({ ...safeResult, hasTelegramBot: !!telegramBotToken, telegramBotToken: telegramBotToken ? `****${telegramBotToken.slice(-6)}` : null });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/users", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { db } = await import("./db");
      const { users } = await import("@shared/models/auth");
      const { userProfiles } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      const result = await db
        .select({
          id: userProfiles.id,
          userId: userProfiles.userId,
          role: userProfiles.role,
          displayName: userProfiles.displayName,
          plan: userProfiles.plan,
          quizLimit: userProfiles.quizLimit,
          bio: userProfiles.bio,
          subscriptionExpiresAt: userProfiles.subscriptionExpiresAt,
          isActive: userProfiles.isActive,
          createdAt: userProfiles.createdAt,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(userProfiles)
        .leftJoin(users, eq(userProfiles.userId, users.id))
        .orderBy(desc(userProfiles.createdAt));
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/admin/users/:userId/role", requireAuth, requireRole(["admin"]), async (req: any, res) => {
    try {
      const { role } = req.body;
      if (!["admin", "teacher", "student"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const updated = await storage.updateUserProfile(req.params.userId, { role });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/stats", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/admin/users", requireAuth, requireRole(["admin"]), async (req: any, res) => {
    try {
      const { email, password, firstName, lastName, role, displayName, plan, quizLimit, subscriptionDays } = req.body;
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

      const expiresAt = subscriptionDays
        ? new Date(Date.now() + Number(subscriptionDays) * 24 * 60 * 60 * 1000)
        : null;

      const profile = await storage.createUserProfile({
        userId: user.id,
        role: role || "student",
        displayName: displayName || `${firstName || ""} ${lastName || ""}`.trim() || email,
        plan: plan || "free",
        quizLimit: quizLimit || 5,
        subscriptionExpiresAt: expiresAt,
        isActive: true,
      });

      res.json({ user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName }, profile });
    } catch (error) {
      console.error("Admin create user error:", error);
      res.status(500).json({ message: "Foydalanuvchi yaratishda xatolik" });
    }
  });

  app.patch("/api/admin/users/:userId/subscription", requireAuth, requireRole(["admin"]), async (req: any, res) => {
    try {
      const { subscriptionDays, isActive, plan, quizLimit } = req.body;
      const updateData: any = {};

      if (subscriptionDays !== undefined) {
        updateData.subscriptionExpiresAt = new Date(Date.now() + Number(subscriptionDays) * 24 * 60 * 60 * 1000);
      }
      if (isActive !== undefined) updateData.isActive = isActive;
      if (plan !== undefined) updateData.plan = plan;
      if (quizLimit !== undefined) updateData.quizLimit = quizLimit;

      const updated = await storage.updateUserProfile(req.params.userId, updateData);
      if (!updated) return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/admin/users/:userId/password", requireAuth, requireRole(["admin"]), async (req: any, res) => {
    try {
      const { password } = req.body;
      if (!password || password.length < 4) {
        return res.status(400).json({ message: "Parol kamida 4 ta belgidan iborat bo'lishi kerak" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const { db } = await import("./db");
      const { users } = await import("@shared/models/auth");
      const { eq } = await import("drizzle-orm");
      await db.update(users).set({ password: hashedPassword }).where(eq(users.id, req.params.userId));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/public-stats", async (_req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/quizzes/public", async (req, res) => {
    try {
      const publicQuizzes = await storage.getPublicQuizzes();
      res.json(publicQuizzes);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/quizzes", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const userId = req.userId;
      const profile = req.userProfile;
      const myQuizzes = profile.role === "admin"
        ? await storage.getAllQuizzes()
        : await storage.getQuizzesByCreator(userId);
      res.json(myQuizzes);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/quizzes", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const userId = req.userId;
      const quiz = await storage.createQuiz({
        ...req.body,
        creatorId: userId,
        status: "draft",
      });
      res.json(quiz);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/quiz-categories", requireAuth, async (req: any, res) => {
    try {
      const cats = await storage.getQuizCategoriesByCreator(req.userId);
      res.json(cats);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/quiz-categories/all", async (_req, res) => {
    try {
      const cats = await storage.getAllQuizCategories();
      const unique = Array.from(new Map(cats.map(c => [c.name, c])).values());
      res.json(unique);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/quiz-categories", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const { name } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ message: "Nomi kerak" });
      const cat = await storage.createQuizCategory({ name: name.trim(), creatorId: req.userId });
      res.json(cat);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/quiz-categories/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      await storage.deleteQuizCategory(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/quizzes/:id", async (req, res) => {
    try {
      const quiz = await storage.getQuiz(req.params.id);
      if (!quiz) return res.status(404).json({ message: "Quiz not found" });
      res.json(quiz);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/quizzes/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const updated = await storage.updateQuiz(req.params.id, req.body);
      if (req.body.timePerQuestion !== undefined) {
        const questions = await storage.getQuestionsByQuiz(req.params.id);
        for (const q of questions) {
          await storage.updateQuestion(q.id, { timeLimit: req.body.timePerQuestion });
        }
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/quizzes/:id/schedule", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const { scheduledAt, requireCode, telegramChatId, telegramQuizChatId, allowReplay } = req.body;
      if (!scheduledAt) return res.status(400).json({ message: "Vaqt kerak" });

      const quiz = await storage.getQuiz(req.params.id);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });
      if (quiz.creatorId !== req.userId) return res.status(403).json({ message: "Ruxsat yo'q" });

      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate <= new Date()) return res.status(400).json({ message: "Vaqt kelajakda bo'lishi kerak" });

      const questions = await storage.getQuestionsByQuiz(req.params.id);
      if (questions.length === 0) return res.status(400).json({ message: "Quizda savollar yo'q" });

      const needCode = requireCode !== false;
      const code = String(Math.floor(100000 + Math.random() * 900000));

      const updated = await storage.updateQuiz(req.params.id, {
        scheduledAt: scheduledDate,
        scheduledStatus: "pending",
        scheduledCode: code,
        scheduledRoomCode: null,
        scheduledRequireCode: needCode,
        scheduledTelegramChatId: telegramChatId || null,
        scheduledTelegramQuizChatId: telegramQuizChatId || null,
        allowReplay: allowReplay === true,
        isPublic: true,
        status: "published",
      } as any);

      res.json(updated);
    } catch (error) {
      console.error("Schedule error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/quiz-folders", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const folders = await storage.getQuizFoldersByCreator(req.userId);
      res.json(folders);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/quiz-folders", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const { name } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ message: "Papka nomi kerak" });
      const folder = await storage.createQuizFolder({ name: name.trim(), creatorId: req.userId });
      res.json(folder);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/quiz-folders/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      await storage.deleteQuizFolder(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/quizzes/:id/move-to-folder", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const quiz = await storage.getQuiz(req.params.id);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });
      if (quiz.creatorId !== req.userId) return res.status(403).json({ message: "Ruxsat yo'q" });
      const { folderId } = req.body;
      let orderInFolder = 0;
      if (folderId) {
        const allQuizzes = await storage.getQuizzesByCreator(req.userId);
        const inFolder = allQuizzes.filter(q => q.folderId === folderId);
        orderInFolder = inFolder.reduce((max, q) => Math.max(max, (q as any).orderInFolder || 0), 0) + 1;
      }
      const updated = await storage.updateQuiz(req.params.id, { folderId: folderId || null, orderInFolder } as any);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/quiz-folders/reorder", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const { folderIds } = req.body;
      if (!Array.isArray(folderIds)) return res.status(400).json({ message: "folderIds kerak" });
      for (let i = 0; i < folderIds.length; i++) {
        await storage.updateQuizFolderOrder(folderIds[i], i + 1);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/quiz-folders/:folderId/reorder-quizzes", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const { quizIds } = req.body;
      if (!Array.isArray(quizIds)) return res.status(400).json({ message: "quizIds kerak" });
      for (let i = 0; i < quizIds.length; i++) {
        await storage.updateQuizOrderInFolder(quizIds[i], i + 1);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/quizzes/:id/replay", async (req, res) => {
    try {
      const quiz = await storage.getQuiz(req.params.id);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });
      if (!quiz.allowReplay) return res.status(403).json({ message: "Bu testni qayta yechish mumkin emas" });
      const questionsList = await storage.getQuestionsByQuiz(quiz.id);
      res.json({
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        category: quiz.category,
        coverImage: quiz.coverImage,
        totalQuestions: quiz.totalQuestions,
        timePerQuestion: quiz.timePerQuestion,
        timerEnabled: quiz.timerEnabled,
        shuffleQuestions: quiz.shuffleQuestions,
        shuffleOptions: quiz.shuffleOptions,
        showCorrectAnswers: quiz.showCorrectAnswers,
        questions: questionsList.map(q => ({
          id: q.id,
          questionText: q.questionText,
          type: q.type,
          options: q.options,
          correctAnswer: q.correctAnswer,
          points: q.points,
          timeLimit: q.timeLimit,
          mediaUrl: q.mediaUrl,
          mediaType: q.mediaType,
        })),
      });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // ===== SHARED QUIZ (Mustaqil test) =====
  app.post("/api/quizzes/:id/share", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const quiz = await storage.getQuiz(req.params.id);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });
      if (quiz.creatorId !== req.userId) return res.status(403).json({ message: "Ruxsat yo'q" });

      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const shared = await storage.createSharedQuiz({
        quizId: quiz.id,
        creatorId: req.userId,
        code,
        isActive: true,
      });
      res.json(shared);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/shared-quizzes", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const shared = await storage.getSharedQuizzesByCreator(req.userId);
      res.json(shared);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/shared-quizzes/:id/toggle", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const sharedList = await storage.getSharedQuizzesByCreator(req.userId);
      const shared = sharedList.find(s => s.id === req.params.id);
      if (!shared) return res.status(404).json({ message: "Topilmadi" });
      const updated = await storage.updateSharedQuiz(req.params.id, { isActive: !shared.isActive });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/shared-quizzes/:id/attempts", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const attempts = await storage.getSharedQuizAttempts(req.params.id);
      res.json(attempts);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // Public endpoints for students taking shared quiz
  app.get("/api/shared/:code", async (req, res) => {
    try {
      const shared = await storage.getSharedQuizByCode(req.params.code);
      if (!shared) return res.status(404).json({ message: "Test topilmadi" });
      if (!shared.isActive) return res.status(403).json({ message: "Bu test hozircha yopilgan" });

      const quiz = await storage.getQuiz(shared.quizId);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });

      const questionsList = await storage.getQuestionsByQuiz(quiz.id);
      res.json({
        sharedId: shared.id,
        quizId: quiz.id,
        title: quiz.title,
        description: quiz.description,
        category: quiz.category,
        coverImage: quiz.coverImage,
        totalQuestions: quiz.totalQuestions,
        timePerQuestion: quiz.timePerQuestion,
        timerEnabled: quiz.timerEnabled,
        shuffleQuestions: quiz.shuffleQuestions,
        shuffleOptions: quiz.shuffleOptions,
        showCorrectAnswers: quiz.showCorrectAnswers,
        questions: questionsList.map(q => ({
          id: q.id,
          questionText: q.questionText,
          type: q.type,
          options: q.options,
          correctAnswer: q.correctAnswer,
          points: q.points,
          timeLimit: q.timeLimit,
          mediaUrl: q.mediaUrl,
          mediaType: q.mediaType,
          orderIndex: q.orderIndex,
        })).sort((a, b) => a.orderIndex - b.orderIndex),
      });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/shared/:code/start", async (req, res) => {
    try {
      const { playerName } = req.body;
      if (!playerName || typeof playerName !== "string" || !playerName.trim()) {
        return res.status(400).json({ message: "Ism kiriting" });
      }
      const shared = await storage.getSharedQuizByCode(req.params.code);
      if (!shared) return res.status(404).json({ message: "Test topilmadi" });
      if (!shared.isActive) return res.status(403).json({ message: "Bu test hozircha yopilgan" });

      const quiz = await storage.getQuiz(shared.quizId);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });

      const attempt = await storage.createSharedQuizAttempt({
        sharedQuizId: shared.id,
        playerName: playerName.trim(),
        totalQuestions: quiz.totalQuestions,
      });
      res.json(attempt);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/shared/:code/submit", async (req, res) => {
    try {
      const { attemptId, answers, score, correctAnswers, totalQuestions } = req.body;
      if (!attemptId) return res.status(400).json({ message: "attemptId kerak" });

      const attempt = await storage.getSharedQuizAttempt(attemptId);
      if (!attempt) return res.status(404).json({ message: "Urinish topilmadi" });

      const updated = await storage.updateSharedQuizAttempt(attemptId, {
        answers: answers || {},
        score: score || 0,
        correctAnswers: correctAnswers || 0,
        totalQuestions: totalQuestions || 0,
        completedAt: new Date(),
      });

      // Increment totalPlays via raw query
      const shared = await storage.getSharedQuizByCode(req.params.code);
      if (shared) {
        const { db: dbInstance } = await import("./db");
        const { quizzes: quizzesTable } = await import("@shared/schema");
        const { eq: eqOp, sql: sqlOp } = await import("drizzle-orm");
        await dbInstance.update(quizzesTable).set({ totalPlays: sqlOp`COALESCE(total_plays, 0) + 1` } as any).where(eqOp(quizzesTable.id, shared.quizId));
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/quizzes/:id/cancel-schedule", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const quiz = await storage.getQuiz(req.params.id);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });
      if (quiz.creatorId !== req.userId) return res.status(403).json({ message: "Ruxsat yo'q" });

      const updated = await storage.updateQuiz(req.params.id, {
        scheduledAt: null,
        scheduledStatus: null,
        scheduledCode: null,
        scheduledRoomCode: null,
        scheduledRequireCode: true,
        scheduledTelegramChatId: null,
        scheduledTelegramQuizChatId: null,
      } as any);

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/scheduled-quiz/:code", async (req, res) => {
    try {
      const quiz = await storage.getQuizByScheduledCode(req.params.code);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });
      const memRoomCode = getScheduledQuizRoomCode(quiz.id);
      let effectiveStatus = quiz.scheduledStatus;
      let effectiveRoomCode: string | null = null;
      if (quiz.scheduledStatus === "started" && !memRoomCode && isRestorationComplete()) {
        await storage.updateQuiz(quiz.id, { scheduledStatus: "finished" } as any);
        effectiveStatus = "finished";
      } else if (quiz.scheduledStatus === "started" && memRoomCode) {
        effectiveRoomCode = memRoomCode;
      } else if (quiz.scheduledStatus === "started" && !memRoomCode && !isRestorationComplete()) {
        effectiveRoomCode = (quiz as any).scheduledRoomCode || null;
      }
      res.json({
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        category: quiz.category,
        coverImage: quiz.coverImage,
        totalQuestions: quiz.totalQuestions,
        scheduledAt: quiz.scheduledAt,
        scheduledStatus: effectiveStatus,
        scheduledCode: quiz.scheduledCode,
        scheduledRoomCode: effectiveRoomCode,
        scheduledRequireCode: quiz.scheduledRequireCode,
        allowReplay: quiz.allowReplay,
        creatorId: quiz.creatorId,
      });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/scheduled-quiz-by-id/:quizId", async (req, res) => {
    try {
      const quiz = await storage.getQuiz(req.params.quizId);
      if (!quiz || quiz.scheduledStatus !== "pending" || !quiz.scheduledAt) {
        return res.status(404).json({ message: "Rejalashtirilgan quiz topilmadi" });
      }
      if (quiz.scheduledRequireCode) {
        return res.status(403).json({ message: "Bu quiz faqat kod bilan kirish mumkin" });
      }
      res.json({
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        category: quiz.category,
        coverImage: quiz.coverImage,
        totalQuestions: quiz.totalQuestions,
        scheduledAt: quiz.scheduledAt,
        scheduledStatus: quiz.scheduledStatus,
        scheduledCode: quiz.scheduledCode,
        scheduledRequireCode: quiz.scheduledRequireCode,
        creatorId: quiz.creatorId,
      });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/scheduled-quiz-status/:quizId", async (req, res) => {
    try {
      const quiz = await storage.getQuiz(req.params.quizId);
      if (!quiz) {
        return res.status(404).json({ status: "not_found" });
      }
      const memRoomCode = getScheduledQuizRoomCode(quiz.id);
      if (quiz.scheduledStatus === "started" && !memRoomCode && isRestorationComplete()) {
        await storage.updateQuiz(quiz.id, { scheduledStatus: "finished" } as any);
        return res.json({
          scheduledStatus: "finished",
          roomCode: null,
          allowReplay: quiz.allowReplay,
        });
      }
      let roomCode: string | null = null;
      if (quiz.scheduledStatus === "started") {
        roomCode = memRoomCode || (!isRestorationComplete() ? ((quiz as any).scheduledRoomCode || null) : null);
      }
      res.json({
        scheduledStatus: quiz.scheduledStatus,
        roomCode,
        allowReplay: quiz.allowReplay,
      });
    } catch (error) {
      res.status(500).json({ status: "error" });
    }
  });

  app.delete("/api/quizzes/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      await storage.deleteQuestionsByQuiz(req.params.id);
      await storage.deleteQuiz(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/quizzes/:quizId/questions", async (req, res) => {
    try {
      const questionsList = await storage.getQuestionsByQuiz(req.params.quizId);
      res.json(questionsList);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/quizzes/:quizId/questions", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const { questionText, options, correctAnswer, points, timeLimit, mediaUrl, mediaType, orderIndex } = req.body;
      const type = req.body.type || "multiple_choice";
      if (!questionText || (!correctAnswer && type !== "poll")) {
        return res.status(400).json({ message: "Savol matni va to'g'ri javob kerak" });
      }
      if (type === "multiple_choice") {
        if (!options || !Array.isArray(options) || options.length < 2) {
          return res.status(400).json({ message: "Kamida 2 ta variant kerak" });
        }
        if (!options.includes(correctAnswer)) {
          return res.status(400).json({ message: "To'g'ri javob variantlar ichida bo'lishi kerak" });
        }
      }
      if (type === "true_false") {
        if (!["true", "false"].includes(correctAnswer)) {
          return res.status(400).json({ message: "To'g'ri/Noto'g'ri javob 'true' yoki 'false' bo'lishi kerak" });
        }
      }
      if (type === "poll") {
        if (!options || !Array.isArray(options) || options.length < 2) {
          return res.status(400).json({ message: "Kamida 2 ta variant kerak" });
        }
      }
      if (type === "multiple_select") {
        if (!options || !Array.isArray(options) || options.length < 2) {
          return res.status(400).json({ message: "Kamida 2 ta variant kerak" });
        }
        if (!correctAnswer || typeof correctAnswer !== "string") {
          return res.status(400).json({ message: "To'g'ri javoblarni tanlang" });
        }
      }
      const questionOptions = type === "multiple_choice" ? options
        : type === "true_false" ? ["To'g'ri", "Noto'g'ri"]
        : type === "poll" ? options
        : type === "multiple_select" ? options
        : null;
      const finalCorrectAnswer = type === "poll" ? (correctAnswer || "poll") : correctAnswer;
      const finalPoints = type === "poll" ? 0 : (points || 100);
      const question = await storage.createQuestion({
        quizId: req.params.quizId,
        questionText,
        options: questionOptions,
        correctAnswer: finalCorrectAnswer,
        type,
        points: finalPoints,
        timeLimit: timeLimit || 30,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        orderIndex: orderIndex || 0,
      });
      res.json(question);
    } catch (error: any) {
      console.error("Question create error:", error?.message || error);
      res.status(500).json({ message: error?.message || "Savol saqlashda xatolik" });
    }
  });

  app.patch("/api/questions/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const updated = await storage.updateQuestion(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  const mediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  app.post("/api/media/upload", requireAuth, requireRole(["teacher", "admin"]), mediaUpload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file" });
      const { ObjectStorageService, objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
      const objService = new ObjectStorageService();
      const privateDir = objService.getPrivateObjectDir();
      const ext = req.file.originalname.split(".").pop() || "bin";
      const filename = `media_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const fullPath = `${privateDir}/media/${filename}`;
      const parts = fullPath.startsWith("/") ? fullPath.slice(1).split("/") : fullPath.split("/");
      const bucketName = parts[0];
      const objectName = parts.slice(1).join("/");
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      await file.save(req.file.buffer, { contentType: req.file.mimetype });
      const objectPath = `/objects/media/${filename}`;
      res.json({ url: objectPath, mediaType: req.file.mimetype.startsWith("video") ? "video" : req.file.mimetype.startsWith("audio") ? "audio" : "image" });
    } catch (error) {
      console.error("Media upload error:", error);
      res.status(500).json({ message: "Upload failed" });
    }
  });

  app.delete("/api/questions/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      await storage.deleteQuestion(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/template/download", (req, res) => {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ["savol", "option_a", "option_b", "option_c", "option_d", "togri_javob", "ball", "vaqt"],
      ["2+2 nechaga teng?", "3", "4", "5", "6", "4", 100, 30],
      ["O'zbekiston poytaxti qaysi?", "Samarqand", "Buxoro", "Toshkent", "Namangan", "Toshkent", 100, 30],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 8 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws, "Savollar");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=quiz_shablon.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  });

  app.post("/api/quizzes/:quizId/import-text", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const { text } = req.body;
      if (!text) return res.status(400).json({ message: "Matn kerak" });

      const existingQuestions = await storage.getQuestionsByQuiz(req.params.quizId);
      const startIndex = existingQuestions.length;

      const rawLines = text.split("\n");
      const imported: any[] = [];
      let currentQ: any = null;

      const saveCurrentQ = async () => {
        if (!currentQ || !currentQ.questionText) return;
        const correct = currentQ.options.find((o: string) => o.endsWith(" *") || o.endsWith("*"));
        if (correct) {
          currentQ.correctAnswer = correct.replace(/\s*\*+$/, "").trim();
          currentQ.options = currentQ.options.map((o: string) => o.replace(/\s*\*+$/, "").trim());
        }
        const validOptions = currentQ.options.filter(Boolean);
        if (currentQ.correctAnswer && validOptions.length >= 2) {
          const question = await storage.createQuestion({
            quizId: req.params.quizId,
            orderIndex: startIndex + imported.length,
            type: "multiple_choice",
            questionText: currentQ.questionText.trim(),
            options: validOptions,
            correctAnswer: currentQ.correctAnswer,
            points: 100,
            timeLimit: 30,
          });
          imported.push(question);
        }
      };

      for (let li = 0; li < rawLines.length; li++) {
        const line = rawLines[li].replace(/^\s+/, "").replace(/\s+$/, "");

        if (!line) {
          if (currentQ && currentQ.options.length >= 2) {
            await saveCurrentQ();
            currentQ = null;
          }
          continue;
        }

        const optMatch = line.match(/^([A-Da-d])[\.\)\s]\s*(.*)/);
        const qMatch = line.match(/^(\d+)\s*[\.\)\-\t]\s*(.*)/);

        if (optMatch && currentQ) {
          currentQ.options.push(optMatch[2].trim());
        } else if (qMatch) {
          await saveCurrentQ();
          let qText = qMatch[2].trim();
          if (!qText) continue;
          currentQ = { questionText: qText, options: [], correctAnswer: "" };
        } else if (!optMatch) {
          if (currentQ && currentQ.options.length === 0) {
            currentQ.questionText += " " + line;
          } else {
            await saveCurrentQ();
            currentQ = { questionText: line, options: [], correctAnswer: "" };
          }
        }
      }

      await saveCurrentQ();

      res.json({ imported: imported.length, questions: imported });
    } catch (error) {
      console.error("Text import error:", error);
      res.status(500).json({ message: "Import xatosi" });
    }
  });

  app.post("/api/quizzes/:quizId/import", requireAuth, requireRole(["teacher", "admin"]), upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet) as any[];

      const imported: any[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const options = [row.option_a, row.option_b, row.option_c, row.option_d].filter(Boolean);
        const question = await storage.createQuestion({
          quizId: req.params.quizId,
          orderIndex: i,
          type: row.type || "multiple_choice",
          questionText: row.question || row.savol || "",
          options: options.length > 0 ? options : null,
          correctAnswer: String(row.correct_answer || row.togri_javob || ""),
          points: Number(row.points || row.ball || 100),
          timeLimit: Number(row.time_limit || row.vaqt || 30),
        });
        imported.push(question);
      }

      res.json({ imported: imported.length, questions: imported });
    } catch (error) {
      console.error("Import error:", error);
      res.status(500).json({ message: "Import failed" });
    }
  });

  app.post("/api/sessions", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const userId = req.userId;
      const quiz = await storage.getQuiz(req.body.quizId);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });
      if (quiz.status !== "published") return res.status(400).json({ message: "Quiz avval nashr qilinishi kerak" });

      const questionsList = await storage.getQuestionsByQuiz(req.body.quizId);
      if (questionsList.length === 0) return res.status(400).json({ message: "Quizda savollar yo'q. Avval savollar qo'shing" });

      const joinCode = generateJoinCode();
      const session = await storage.createLiveSession({
        quizId: req.body.quizId,
        hostId: userId,
        joinCode,
        password: req.body.password || null,
        status: "waiting",
      });
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getLiveSession(req.params.id);
      if (!session) return res.status(404).json({ message: "Session not found" });
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/sessions/join", async (req, res) => {
    try {
      const { code, guestName, userId, password } = req.body;
      const session = await storage.getLiveSessionByCode(code);
      if (!session) return res.status(404).json({ message: "Sessiya topilmadi" });
      if (session.status === "finished") return res.status(400).json({ message: "Sessiya tugagan" });

      if (session.password && session.password !== password) {
        return res.status(403).json({ message: "Parol noto'g'ri", requiresPassword: true });
      }

      const existingParticipants = await storage.getSessionParticipants(session.id);
      const nameToCheck = (guestName || "Guest").trim().toLowerCase();
      const nameExists = existingParticipants.some(p => (p.guestName || "").trim().toLowerCase() === nameToCheck);
      if (nameExists) {
        return res.status(400).json({ message: "Bu ism allaqachon ishlatilmoqda. Boshqa ism tanlang.", duplicateName: true });
      }

      const participant = await storage.addParticipant({
        sessionId: session.id,
        userId: userId || null,
        guestName: guestName || "Guest",
      });

      res.json({ session, participant });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/sessions/check", async (req, res) => {
    try {
      const { code } = req.body;
      const session = await storage.getLiveSessionByCode(code);
      if (!session) return res.status(404).json({ message: "Sessiya topilmadi" });
      if (session.status === "finished") return res.status(400).json({ message: "Sessiya tugagan" });
      res.json({ requiresPassword: !!session.password, sessionId: session.id });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/sessions/:id/participants", async (req, res) => {
    try {
      const participants = await storage.getSessionParticipants(req.params.id);
      res.json(participants);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/sessions/:id/results", async (req, res) => {
    try {
      const results = await storage.getResultsBySession(req.params.id);
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/sessions/:id/quiz-results", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const quiz = await storage.getQuiz(req.params.id);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });
      if (quiz.creatorId !== req.userId && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Bu quiz sizga tegishli emas" });
      }
      const results = await storage.getResultsByQuiz(req.params.id);

      const sharedQuizzes = await storage.getSharedQuizzesByQuizId(req.params.id);
      const sharedResults: any[] = [];
      for (const sq of sharedQuizzes) {
        const attempts = await storage.getSharedQuizAttempts(sq.id);
        for (const a of attempts) {
          if (a.completedAt) {
            sharedResults.push({
              id: a.id,
              sessionId: `shared_${sq.id}`,
              quizId: req.params.id,
              participantId: a.id,
              userId: null,
              guestName: a.playerName,
              totalScore: a.score,
              correctAnswers: a.correctAnswers,
              totalQuestions: a.totalQuestions,
              rank: null,
              completedAt: a.completedAt,
              _isShared: true,
            });
          }
        }
      }

      res.json([...results, ...sharedResults]);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/quiz-results/all/:quizId", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const quiz = await storage.getQuiz(req.params.quizId);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });
      if (quiz.creatorId !== req.userId && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Bu quiz sizga tegishli emas" });
      }

      const results = await storage.getResultsByQuiz(req.params.quizId);
      for (const r of results) {
        await storage.deleteResult(r.id);
      }

      const sharedQuizzes = await storage.getSharedQuizzesByQuizId(req.params.quizId);
      for (const sq of sharedQuizzes) {
        const attempts = await storage.getSharedQuizAttempts(sq.id);
        for (const a of attempts) {
          await storage.deleteSharedQuizAttempt(a.id);
        }
      }

      await storage.updateQuiz(req.params.quizId, { totalPlays: 0 } as any);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "O'chirishda xatolik" });
    }
  });

  app.delete("/api/quiz-results/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      await storage.deleteResult(req.params.id);
      res.json({ success: true });
    } catch (error1) {
      try {
        await storage.deleteSharedQuizAttempt(req.params.id);
        res.json({ success: true });
      } catch (error2) {
        res.status(500).json({ message: "O'chirishda xatolik" });
      }
    }
  });

  app.get("/api/sessions/:id/quiz-results/export", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const quiz = await storage.getQuiz(req.params.id);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });
      if (quiz.creatorId !== req.userId && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Bu quiz sizga tegishli emas" });
      }
      const liveResults = await storage.getResultsByQuiz(req.params.id);

      const sharedQuizzes = await storage.getSharedQuizzesByQuizId(req.params.id);
      const sharedResults: any[] = [];
      for (const sq of sharedQuizzes) {
        const attempts = await storage.getSharedQuizAttempts(sq.id);
        for (const a of attempts) {
          if (a.completedAt) {
            sharedResults.push({
              guestName: a.playerName,
              totalScore: a.score,
              correctAnswers: a.correctAnswers,
              totalQuestions: a.totalQuestions,
              participantId: a.id,
            });
          }
        }
      }

      const results: any[] = [...liveResults, ...sharedResults];
      if (results.length === 0) return res.status(400).json({ message: "Natijalar topilmadi" });

      results.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));

      const { Document, Packer, Paragraph, TextRun, AlignmentType } = await import("docx");

      const hasRtl = (s: string) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s);
      const makeRun = (text: string, bold: boolean, sz: number) => new TextRun({ text, bold, size: sz, font: "Arial", rightToLeft: hasRtl(text) });

      const titleHasRtl = hasRtl(quiz.title);
      const resultRows: InstanceType<typeof Paragraph>[] = [];

      resultRows.push(new Paragraph({ children: [makeRun(quiz.title, true, 36)], alignment: AlignmentType.CENTER, spacing: { after: 100 }, bidirectional: titleHasRtl }));
      resultRows.push(new Paragraph({ children: [makeRun(`Natijalar — ${new Date().toLocaleDateString("uz-UZ")}`, false, 22)], alignment: AlignmentType.CENTER, spacing: { after: 200 } }));
      resultRows.push(new Paragraph({ children: [makeRun("————————————————————————", false, 20)], spacing: { after: 100 } }));

      results.forEach((r: any, i: number) => {
        const name = r.guestName || `O'yinchi #${r.participantId.slice(-4)}`;
        const pct = r.totalQuestions > 0 ? Math.round((r.correctAnswers / r.totalQuestions) * 100) : 0;
        const line = `${i + 1}. ${name} — ${r.totalScore} ball — ${r.correctAnswers}/${r.totalQuestions} to'g'ri (${pct}%)`;
        const isBold = i < 3;
        resultRows.push(new Paragraph({ children: [makeRun(line, isBold, 22)], spacing: { after: 80 }, bidirectional: hasRtl(name) }));
      });

      const doc = new Document({
        sections: [{
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 720, right: 720, bottom: 720, left: 720 },
            },
          },
          children: resultRows,
        }],
      });

      const docxBuffer = await Packer.toBuffer(doc);
      const safeTitle = quiz.title.replace(/[^a-zA-Z0-9\u0400-\u04FF\u0600-\u06FF]/g, "_");

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}_natijalar.docx"`);
      res.send(Buffer.from(docxBuffer));
    } catch (error: any) {
      console.error("Export error:", error?.message || error);
      res.status(500).json({ message: "Export xatolik" });
    }
  });

  app.get("/api/sessions/:id/quiz-results/export-pdf", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const quiz = await storage.getQuiz(req.params.id);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });
      if (quiz.creatorId !== req.userId && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Bu quiz sizga tegishli emas" });
      }
      const liveResults = await storage.getResultsByQuiz(req.params.id);

      const sharedQuizzes = await storage.getSharedQuizzesByQuizId(req.params.id);
      const sharedResults: any[] = [];
      for (const sq of sharedQuizzes) {
        const attempts = await storage.getSharedQuizAttempts(sq.id);
        for (const a of attempts) {
          if (a.completedAt) {
            sharedResults.push({
              guestName: a.playerName,
              totalScore: a.score,
              correctAnswers: a.correctAnswers,
              totalQuestions: a.totalQuestions,
              participantId: a.id,
            });
          }
        }
      }

      const results: any[] = [...liveResults, ...sharedResults];
      if (results.length === 0) return res.status(400).json({ message: "Natijalar topilmadi" });

      results.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));

      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ size: "A4", margin: 40 });

      const safeTitle = quiz.title.replace(/[^a-zA-Z0-9\u0400-\u04FF\u0600-\u06FF]/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}_natijalar.pdf"`);
      doc.pipe(res);

      doc.fontSize(20).text(quiz.title, { align: "center" });
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor("#666").text(`Natijalar — ${new Date().toLocaleDateString("uz-UZ")}`, { align: "center" });
      doc.moveDown(0.8);

      doc.fillColor("#000");

      const colX = [45, 80, 280, 380, 450];
      const headerY = doc.y;
      doc.fontSize(10).font("Helvetica-Bold");
      doc.text("#", colX[0], headerY);
      doc.text("Ism", colX[1], headerY);
      doc.text("Ball", colX[2], headerY);
      doc.text("To'g'ri", colX[3], headerY);
      doc.text("%", colX[4], headerY);
      doc.moveDown(0.5);

      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#ccc").stroke();
      doc.moveDown(0.3);

      doc.font("Helvetica");
      results.forEach((r: any, i: number) => {
        const name = r.guestName || `O'yinchi #${r.participantId.slice(-4)}`;
        const pct = r.totalQuestions > 0 ? Math.round((r.correctAnswers / r.totalQuestions) * 100) : 0;

        if (doc.y > 750) {
          doc.addPage();
        }

        const rowY = doc.y;
        if (i < 3) doc.font("Helvetica-Bold"); else doc.font("Helvetica");
        doc.fontSize(10);
        doc.text(`${i + 1}`, colX[0], rowY);
        doc.text(name, colX[1], rowY, { width: 190 });
        doc.text(`${r.totalScore}`, colX[2], rowY);
        doc.text(`${r.correctAnswers}/${r.totalQuestions}`, colX[3], rowY);
        doc.text(`${pct}%`, colX[4], rowY);
        doc.moveDown(0.4);
      });

      doc.end();
    } catch (error: any) {
      console.error("PDF Export error:", error?.message || error);
      if (!res.headersSent) {
        res.status(500).json({ message: "PDF export xatolik" });
      }
    }
  });

  app.get("/api/my-results", requireAuth, async (req: any, res) => {
    try {
      const userId = req.userId;
      const results = await storage.getResultsByUser(userId);
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/telegram/send-quiz", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const { quizId, chatId } = req.body;
      if (!chatId) {
        return res.status(400).json({ message: "Chat ID kerak" });
      }

      const profile = await storage.getUserProfile(req.userId);
      if (!profile?.telegramBotToken) {
        return res.status(400).json({ message: "Avval Telegram bot sozlamalarida tokenni saqlang" });
      }

      const quiz = await storage.getQuiz(quizId);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });
      if (quiz.creatorId !== req.userId && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Bu quiz sizga tegishli emas" });
      }

      const questionsList = await storage.getQuestionsByQuiz(quizId);
      if (questionsList.length === 0) return res.status(400).json({ message: "Quizda savollar yo'q. Avval savollar qo'shing" });

      const TelegramBot = (await import("node-telegram-bot-api")).default;
      const bot = new TelegramBot(profile.telegramBotToken);

      let sent = 0;
      const targetChat = chatId.startsWith("@") || chatId.startsWith("-") ? chatId : (isNaN(Number(chatId)) ? `@${chatId}` : Number(chatId));
      const shouldShuffle = quiz.shuffleOptions === true || quiz.shuffleOptions === "true" as any;
      console.log(`[TG] Quiz "${quiz.title}" shuffleOptions=${quiz.shuffleOptions} (type: ${typeof quiz.shuffleOptions}), shouldShuffle=${shouldShuffle}`);

      const shuffleArray = <T>(arr: T[]): T[] => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };

      await bot.sendMessage(targetChat, `📝 *${quiz.title}*\n${quiz.description || ""}\n\n_${questionsList.length} ta savol_`, { parse_mode: "Markdown" });
      await new Promise(r => setTimeout(r, 2000));

      const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max - 1) + "…" : s;

      let baseDelay = questionsList.length > 20 ? 4000 : questionsList.length > 10 ? 3000 : 2000;
      const BATCH_SIZE = 10;

      const sendWithRetry = async (fn: () => Promise<any>, questionNum: number, maxRetries = 5) => {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            await fn();
            return true;
          } catch (err: any) {
            const retryAfter = err?.response?.body?.parameters?.retry_after
              || err?.response?.body?.retry_after;
            if (retryAfter && attempt < maxRetries) {
              const waitSec = Math.max(Number(retryAfter), 5) + 3;
              console.log(`[TG] Q${questionNum} rate limit (retry_after=${retryAfter}), waiting ${waitSec}s (attempt ${attempt + 1}/${maxRetries})...`);
              baseDelay = Math.min(Math.max(baseDelay + 500, 4500), 6000);
              await new Promise(r => setTimeout(r, waitSec * 1000));
              continue;
            }
            const is429 = err?.response?.statusCode === 429
              || err?.statusCode === 429
              || err?.message?.includes("429")
              || err?.message?.includes("Too Many Requests")
              || err?.message?.includes("ETELEGRAM");
            if (is429 && attempt < maxRetries) {
              const wait = Math.pow(2, attempt + 1) * 1000 + 5000;
              console.log(`[TG] Q${questionNum} 429 detected, retry after ${wait}ms (attempt ${attempt + 1}/${maxRetries})...`);
              baseDelay = Math.min(Math.max(baseDelay + 500, 4500), 6000);
              await new Promise(r => setTimeout(r, wait));
              continue;
            }
            console.error(`[TG] Q${questionNum} send failed (attempt ${attempt + 1}/${maxRetries}):`, err?.message);
            if (attempt >= maxRetries) return false;
            await new Promise(r => setTimeout(r, 5000));
          }
        }
        return false;
      };

      console.log(`[TG] Sending ${questionsList.length} questions, shuffle=${shouldShuffle}, baseDelay=${baseDelay}ms, batchSize=${BATCH_SIZE}`);

      for (let i = 0; i < questionsList.length; i++) {
        const q = questionsList[i];
        let success = false;
        const qNum = i + 1;
        const qText = truncate(q.questionText, 295);
        const trimOpts = (opts: string[]) => opts.map(o => truncate(o, 98));

        if (q.type === "open_ended") {
          success = await sendWithRetry(() => bot.sendMessage(targetChat, `<b>${qNum}. ${escHtml(qText)}</b>\n\n<i>Yozma javob talab qilinadi</i>\nTo'g'ri javob: <tg-spoiler>${escHtml(q.correctAnswer)}</tg-spoiler>`, { parse_mode: "HTML" }), qNum);
        } else if (q.type === "true_false") {
          const tfOptions = ["To'g'ri", "Noto'g'ri"];
          const correctIndex = q.correctAnswer === "true" ? 0 : 1;
          success = await sendWithRetry(() => bot.sendPoll(targetChat, qText, tfOptions, {
            type: "quiz",
            correct_option_id: correctIndex,
            is_anonymous: true,
          } as any), qNum);
        } else if (q.type === "poll" && q.options && q.options.length >= 2) {
          const opts = trimOpts(shouldShuffle ? shuffleArray(q.options) : q.options);
          if (shouldShuffle) console.log(`[TG] Q${qNum} poll shuffled: [${opts.join(", ")}]`);
          success = await sendWithRetry(() => bot.sendPoll(targetChat, qText, opts, {
            type: "regular",
            is_anonymous: true,
          } as any), qNum);
        } else if (q.type === "multiple_select" && q.options && q.options.length >= 2) {
          const opts = trimOpts(shouldShuffle ? shuffleArray(q.options) : q.options);
          if (shouldShuffle) console.log(`[TG] Q${qNum} multiple_select shuffled: [${opts.join(", ")}]`);
          success = await sendWithRetry(() => bot.sendPoll(targetChat, qText, opts, {
            type: "regular",
            allows_multiple_answers: true,
            is_anonymous: true,
          } as any), qNum);
        } else if (q.options && q.options.length >= 2) {
          let opts = trimOpts([...q.options]);
          const trimmedCorrect = truncate(q.correctAnswer, 98);
          let correctIdx = opts.indexOf(trimmedCorrect);
          if (correctIdx < 0) correctIdx = q.options.indexOf(q.correctAnswer);
          if (shouldShuffle) {
            const originalOpts = opts.join(", ");
            opts = shuffleArray(opts);
            correctIdx = opts.indexOf(trimmedCorrect);
            if (correctIdx < 0) correctIdx = 0;
            console.log(`[TG] Q${qNum} shuffled: [${originalOpts}] -> [${opts.join(", ")}], correct="${trimmedCorrect}" at idx=${correctIdx}`);
          }
          success = await sendWithRetry(() => bot.sendPoll(targetChat, qText, opts, {
            type: "quiz",
            correct_option_id: correctIdx >= 0 ? correctIdx : 0,
            is_anonymous: true,
          } as any), qNum);
        } else {
          console.log(`[TG] Q${qNum} skipped: type=${q.type}, options=${q.options?.length || 0}`);
        }
        if (success) sent++;
        console.log(`[TG] Q${qNum}/${questionsList.length} ${success ? "✓" : "✗"} (sent: ${sent}, delay=${baseDelay}ms)`);
        if (i < questionsList.length - 1) {
          if ((i + 1) % BATCH_SIZE === 0) {
            const batchPause = questionsList.length > 20 ? 12000 : 8000;
            console.log(`[TG] Batch pause after ${i + 1} messages, waiting ${batchPause / 1000}s...`);
            await new Promise(r => setTimeout(r, batchPause));
          } else {
            await new Promise(r => setTimeout(r, baseDelay));
          }
        }
      }

      console.log(`[TG] Send complete: ${sent}/${questionsList.length} questions sent, finalDelay=${baseDelay}ms`);
      res.json({ success: true, sent, total: questionsList.length });
    } catch (error: any) {
      console.error("Telegram error:", error?.message || error);
      const msg = error?.message?.includes("chat not found") ? "Chat topilmadi. Bot guruhga admin qilib qo'shilganligini tekshiring"
        : error?.message?.includes("Unauthorized") ? "Bot tokeni noto'g'ri. @BotFather dan to'g'ri tokenni oling"
        : error?.message?.includes("bot was blocked") ? "Bot bloklangan yoki guruhdan chiqarilgan"
        : "Telegramga yuborishda xatolik yuz berdi";
      res.status(500).json({ message: msg });
    }
  });

  app.post("/api/telegram/send-results", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const { quizId, sessionId, chatId } = req.body;
      if (!chatId) return res.status(400).json({ message: "Chat ID kerak" });

      const profile = await storage.getUserProfile(req.userId);
      if (!profile?.telegramBotToken) {
        return res.status(400).json({ message: "Avval Telegram bot sozlamalarida tokenni saqlang" });
      }

      const quiz = await storage.getQuiz(quizId);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });
      if (quiz.creatorId !== req.userId && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Bu quiz sizga tegishli emas" });
      }

      let results = sessionId
        ? await storage.getResultsBySession(sessionId)
        : await storage.getResultsByQuiz(quizId);

      const sharedQuizzes = await storage.getSharedQuizzesByQuizId(quizId);
      const sharedResults: any[] = [];
      for (const sq of sharedQuizzes) {
        const attempts = await storage.getSharedQuizAttempts(sq.id);
        for (const a of attempts) {
          if (a.completedAt) {
            sharedResults.push({
              id: a.id,
              sessionId: `shared_${sq.id}`,
              quizId: quizId,
              participantId: a.id,
              userId: null,
              guestName: a.playerName,
              totalScore: a.score,
              correctAnswers: a.correctAnswers,
              totalQuestions: a.totalQuestions,
              rank: null,
              completedAt: a.completedAt,
              _isShared: true,
            });
          }
        }
      }

      results = [...results, ...sharedResults];

      if (results.length === 0) return res.status(400).json({ message: "Natijalar topilmadi" });

      results.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));

      const TelegramBot = (await import("node-telegram-bot-api")).default;
      const bot = new TelegramBot(profile.telegramBotToken);
      const targetChat = chatId.startsWith("@") || chatId.startsWith("-") ? chatId : (isNaN(Number(chatId)) ? `@${chatId}` : Number(chatId));

      let quizChannelLink: string | undefined;
      if (quiz.scheduledTelegramQuizChatId) {
        const quizChatId = quiz.scheduledTelegramQuizChatId;
        console.log("Send results: resolving quiz channel link for chatId:", quizChatId);
        try {
          if (quizChatId.startsWith("@")) {
            quizChannelLink = `https://t.me/${quizChatId.slice(1)}`;
          } else {
            const numericId = quizChatId.startsWith("-") || !isNaN(Number(quizChatId))
              ? quizChatId
              : `@${quizChatId}`;
            const quizChat = await bot.getChat(numericId);
            if (quizChat?.username) {
              quizChannelLink = `https://t.me/${quizChat.username}`;
            } else if (quizChat?.invite_link) {
              quizChannelLink = quizChat.invite_link;
            } else {
              const rawId = String(quizChat?.id || quizChatId);
              if (rawId.startsWith("-100")) {
                quizChannelLink = `https://t.me/c/${rawId.slice(4)}`;
              }
            }
          }
        } catch (e: any) {
          console.log("Could not get quiz channel link via getChat:", e?.message);
          const raw = String(quizChatId);
          if (raw.startsWith("-100")) {
            quizChannelLink = `https://t.me/c/${raw.slice(4)}`;
          }
        }
        console.log("Resolved quiz channel link:", quizChannelLink || "none");
      }

      const msg = formatTelegramResults(quiz.title, results.map(r => ({
        name: r.guestName || `O'yinchi #${r.participantId.slice(-4)}`,
        score: r.totalScore || 0,
        correctAnswers: r.correctAnswers,
        totalQuestions: r.totalQuestions,
      })), escHtml, false, quizChannelLink);

      await bot.sendMessage(targetChat, msg, { parse_mode: "HTML" });

      const { Document, Packer, Paragraph, TextRun, AlignmentType } = await import("docx");

      const hasRtl = (s: string) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s);
      const makeRun = (text: string, bold: boolean, sz: number) => new TextRun({ text, bold, size: sz, font: "Arial", rightToLeft: hasRtl(text) });

      const titleHasRtl = hasRtl(quiz.title);
      const resultRows: InstanceType<typeof Paragraph>[] = [];

      resultRows.push(new Paragraph({ children: [makeRun(quiz.title, true, 36)], alignment: AlignmentType.CENTER, spacing: { after: 100 }, bidirectional: titleHasRtl }));
      resultRows.push(new Paragraph({ children: [makeRun(`Natijalar — ${new Date().toLocaleDateString("uz-UZ")}`, false, 22)], alignment: AlignmentType.CENTER, spacing: { after: 200 } }));
      resultRows.push(new Paragraph({ children: [makeRun("————————————————————————", false, 20)], spacing: { after: 100 } }));

      results.forEach((r: any, i: number) => {
        const name = r.guestName || `O'yinchi #${r.participantId.slice(-4)}`;
        const pct = r.totalQuestions > 0 ? Math.round((r.correctAnswers / r.totalQuestions) * 100) : 0;
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
        const line = `${medal} ${i + 1}. ${name} — ${r.totalScore} ball — ${r.correctAnswers}/${r.totalQuestions} to'g'ri (${pct}%)`;
        const isBold = i < 3;
        resultRows.push(new Paragraph({ children: [makeRun(line, isBold, 22)], spacing: { after: 80 }, bidirectional: hasRtl(name) }));
      });

      const doc = new Document({
        sections: [{
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 720, right: 720, bottom: 720, left: 720 },
            },
          },
          children: resultRows,
        }],
      });

      const docxBuffer = await Packer.toBuffer(doc);

      await bot.sendDocument(targetChat, Buffer.from(docxBuffer), {
        caption: `${quiz.title} — barcha natijalar`,
      }, {
        filename: `${quiz.title.replace(/[^a-zA-Z0-9\u0400-\u04FF]/g, "_")}_natijalar.docx`,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      res.json({ success: true, totalResults: results.length });
    } catch (error: any) {
      console.error("Telegram results error:", error?.message || error);
      const msg = error?.message?.includes("chat not found") ? "Chat topilmadi. Bot guruhga admin qilib qo'shilganligini tekshiring"
        : error?.message?.includes("Unauthorized") ? "Bot tokeni noto'g'ri"
        : error?.message?.includes("bot was blocked") ? "Bot bloklangan yoki guruhdan chiqarilgan"
        : "Natijalarni yuborishda xatolik yuz berdi";
      res.status(500).json({ message: msg });
    }
  });

  function formatTelegramResults(
    title: string,
    players: Array<{ name: string; score: number; correctAnswers: number; totalQuestions: number }>,
    escFn: (s: string) => string,
    isAuto = false,
    quizChannelLink?: string
  ): string {
    const medalLabels = ["[1-O'RIN]", "[2-O'RIN]", "[3-O'RIN]"];
    const barFull = "\u{2588}";
    const barEmpty = "\u{2591}";
    const line = "\u{2500}".repeat(24);

    let msg = `<b>${escFn(title)}</b>\n`;
    msg += `<i>Natijalar${isAuto ? " (avtomatik)" : ""}</i>\n`;
    msg += `${line}\n\n`;

    const top3 = players.slice(0, 3);
    for (let i = 0; i < top3.length; i++) {
      const r = top3[i];
      const pct = r.totalQuestions > 0 ? Math.round((r.correctAnswers / r.totalQuestions) * 100) : 0;
      const barLen = Math.round(pct / 10);
      const bar = barFull.repeat(barLen) + barEmpty.repeat(10 - barLen);

      msg += `${medalLabels[i]} <b>${escFn(r.name)}</b>\n`;
      msg += `   Ball: <b>${r.score}</b>\n`;
      msg += `   To'g'ri: ${r.correctAnswers}/${r.totalQuestions} (${pct}%)\n`;
      msg += `   ${bar}\n\n`;
    }

    if (players.length > 3) {
      msg += `<b>Boshqa ishtirokchilar:</b>\n`;
      msg += `${line}\n`;
      const rest = players.slice(3, 10);
      for (let i = 0; i < rest.length; i++) {
        const r = rest[i];
        const pct = r.totalQuestions > 0 ? Math.round((r.correctAnswers / r.totalQuestions) * 100) : 0;
        msg += `${i + 4}. ${escFn(r.name)} \u{2014} <b>${r.score}</b> ball (${pct}%)\n`;
      }
      msg += `\n`;
    }

    msg += `${line}\n`;
    const activePlayers = players.filter(p => p.correctAnswers > 0 || p.score > 0);
    msg += `Test yechganlar: <b>${activePlayers.length}</b>\n`;
    if (activePlayers.length < players.length) {
      msg += `Jami qo'shilganlar: <b>${players.length}</b>\n`;
    }
    msg += `${new Date().toLocaleDateString("uz-UZ", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" })}`;

    if (quizChannelLink) {
      msg += `\n\n\u{1F4DD} <a href="${quizChannelLink}">Testni Telegramda ishlash</a>`;
    }

    return msg;
  }

  function escHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  app.post("/api/telegram/save-token", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const { botToken } = req.body;
      if (!botToken || !botToken.trim()) {
        return res.status(400).json({ message: "Bot token kerak" });
      }
      const TelegramBot = (await import("node-telegram-bot-api")).default;
      const bot = new TelegramBot(botToken.trim());
      const me = await bot.getMe();
      await storage.updateUserProfile(req.userId, { telegramBotToken: botToken.trim() });
      res.json({ success: true, botName: me.username, botFirstName: me.first_name });
    } catch (error: any) {
      const msg = error?.message?.includes("Unauthorized") || error?.message?.includes("401")
        ? "Bot tokeni noto'g'ri. @BotFather dan to'g'ri tokenni oling"
        : "Bot tokenni tekshirishda xatolik";
      res.status(400).json({ message: msg });
    }
  });

  app.delete("/api/telegram/token", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      await storage.updateUserProfile(req.userId, { telegramBotToken: null, telegramChats: [] });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Tokenni o'chirishda xatolik" });
    }
  });

  app.post("/api/telegram/add-chat", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const { chatId } = req.body;
      if (!chatId || !chatId.trim()) {
        return res.status(400).json({ message: "Chat ID yoki kanal username kerak" });
      }
      const profile = await storage.getUserProfile(req.userId);
      if (!profile?.telegramBotToken) {
        return res.status(400).json({ message: "Avval bot tokenni saqlang" });
      }
      const TelegramBot = (await import("node-telegram-bot-api")).default;
      const bot = new TelegramBot(profile.telegramBotToken);
      const targetChat = chatId.trim().startsWith("@") || chatId.trim().startsWith("-") ? chatId.trim() : (isNaN(Number(chatId.trim())) ? `@${chatId.trim()}` : Number(chatId.trim()));
      const chatInfo = await bot.getChat(targetChat);
      const newChat = {
        chatId: String(chatInfo.id),
        title: chatInfo.title || chatInfo.username || String(chatInfo.id),
        type: chatInfo.type as "group" | "supergroup" | "channel",
        username: chatInfo.username || undefined,
      };
      const currentChats = (profile.telegramChats as any[]) || [];
      if (currentChats.some((c: any) => c.chatId === newChat.chatId)) {
        return res.status(400).json({ message: "Bu chat allaqachon qo'shilgan" });
      }
      const updatedChats = [...currentChats, newChat];
      await storage.updateUserProfile(req.userId, { telegramChats: updatedChats });
      res.json({ success: true, chat: newChat });
    } catch (error: any) {
      const msg = error?.message?.includes("chat not found") ? "Chat topilmadi. Botni guruhga admin qilib qo'shing"
        : error?.message?.includes("Unauthorized") ? "Bot tokeni noto'g'ri"
        : "Chatni qo'shishda xatolik";
      res.status(400).json({ message: msg });
    }
  });

  app.delete("/api/telegram/chats/:chatId", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const profile = await storage.getUserProfile(req.userId);
      if (!profile) return res.status(404).json({ message: "Profil topilmadi" });
      const currentChats = (profile.telegramChats as any[]) || [];
      const updatedChats = currentChats.filter((c: any) => c.chatId !== req.params.chatId);
      await storage.updateUserProfile(req.userId, { telegramChats: updatedChats });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Chatni o'chirishda xatolik" });
    }
  });

  // === Shuffled Questions Route ===
  app.get("/api/quizzes/:quizId/questions/shuffled", requireAuth, async (req: any, res) => {
    try {
      const quiz = await storage.getQuiz(req.params.quizId);
      if (!quiz) return res.status(404).json({ message: "Quiz not found" });
      let questionsList = await storage.getQuestionsByQuiz(req.params.quizId);

      if (quiz.shuffleQuestions) {
        questionsList = fisherYatesShuffle(questionsList);
      }

      if (quiz.shuffleOptions) {
        questionsList = balancedShuffleOptions(questionsList);
      }

      res.json(questionsList);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // === Assignment Routes ===
  app.post("/api/assignments", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const assignment = await storage.createAssignment({
        ...req.body,
        creatorId: req.userId,
      });
      res.json(assignment);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/assignments", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const list = await storage.getAssignmentsByCreator(req.userId);
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/assignments/student", requireAuth, async (req: any, res) => {
    try {
      const userId = req.userId;
      const myClasses = await storage.getClassesByStudent(userId);
      const classIds = myClasses.map(c => c.id);
      const allActive = await storage.getAssignmentsByStudent(userId);
      const filtered = allActive.filter(a => !a.classId || classIds.includes(a.classId));
      res.json(filtered);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/assignments/:id", requireAuth, async (req: any, res) => {
    try {
      const assignment = await storage.getAssignment(req.params.id);
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });
      res.json(assignment);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/assignments/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const updated = await storage.updateAssignment(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Assignment not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/assignments/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      await storage.deleteAssignment(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/assignments/:id/attempt", requireAuth, async (req: any, res) => {
    try {
      const assignment = await storage.getAssignment(req.params.id);
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });
      if (assignment.status !== "active") return res.status(400).json({ message: "Assignment is not active" });

      if (assignment.deadline && new Date(assignment.deadline) < new Date()) {
        return res.status(400).json({ message: "Deadline has passed" });
      }

      const existingAttempts = await storage.getAttemptsByUser(assignment.id, req.userId);
      if (existingAttempts.length >= assignment.attemptsLimit) {
        return res.status(400).json({ message: "Attempts limit reached" });
      }

      const quiz = await storage.getQuiz(assignment.quizId);
      if (!quiz) return res.status(404).json({ message: "Quiz not found" });

      let questionsList = await storage.getQuestionsByQuiz(assignment.quizId);

      if (quiz.shuffleQuestions) {
        questionsList = fisherYatesShuffle(questionsList);
      }

      const userAnswers: Record<string, string | string[]> = req.body.answers || {};
      let score = 0;
      let correctCount = 0;
      const answersDetail: Record<string, { answer: string | string[]; isCorrect: boolean; points: number }> = {};

      for (const q of questionsList) {
        const userAnswer = userAnswers[q.id];

        if (q.type === "poll") {
          answersDetail[q.id] = { answer: userAnswer || "", isCorrect: true, points: 0 };
          correctCount++;
          continue;
        }

        if (q.type === "multiple_select") {
          const selected = Array.isArray(userAnswer) ? userAnswer : [];
          const correctAnswers = q.correctAnswer ? q.correctAnswer.split(",").map((s: string) => s.trim()) : [];
          if (correctAnswers.length === 0) {
            answersDetail[q.id] = { answer: selected, isCorrect: true, points: 0 };
            correctCount++;
            continue;
          }
          let correctSelections = 0;
          let wrongSelections = 0;
          for (const s of selected) {
            if (correctAnswers.includes(s)) correctSelections++;
            else wrongSelections++;
          }
          const ratio = Math.max(0, (correctSelections - wrongSelections) / correctAnswers.length);
          const pts = Math.round(q.points * ratio);
          const isCorrect = ratio >= 1;
          if (isCorrect) correctCount++;
          score += pts;
          answersDetail[q.id] = { answer: selected, isCorrect, points: pts };
          continue;
        }

        const singleAnswer = typeof userAnswer === "string" ? userAnswer : "";
        const isCorrect = singleAnswer === q.correctAnswer;
        const pts = isCorrect ? q.points : 0;
        if (isCorrect) correctCount++;
        score += pts;
        answersDetail[q.id] = { answer: singleAnswer, isCorrect, points: pts };
      }

      const attempt = await storage.createAssignmentAttempt({
        assignmentId: assignment.id,
        userId: req.userId,
        score,
        correctAnswers: correctCount,
        totalQuestions: questionsList.length,
        answers: answersDetail,
      });

      res.json(attempt);
    } catch (error) {
      console.error("Assignment attempt error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/assignments/:id/attempts", requireAuth, async (req: any, res) => {
    try {
      const attempts = await storage.getAttemptsByAssignment(req.params.id);
      res.json(attempts);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/assignments/:id/my-attempts", requireAuth, async (req: any, res) => {
    try {
      const attempts = await storage.getAttemptsByUser(req.params.id, req.userId);
      res.json(attempts);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // === Teacher Stats ===
  app.get("/api/teacher/stats", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const userId = req.userId;
      const quizzesList = await storage.getQuizzesByCreator(userId);
      const classList = await storage.getClassesByTeacher(userId);
      const assignmentsList = await storage.getAssignmentsByCreator(userId);

      const totalQuizzes = quizzesList.length;
      const totalPlays = quizzesList.reduce((a, q) => a + q.totalPlays, 0);
      const totalLikes = quizzesList.reduce((a, q) => a + q.totalLikes, 0);
      const totalStudents = new Set<string>();

      for (const cls of classList) {
        const members = await storage.getClassMembers(cls.id);
        members.forEach((m) => totalStudents.add(m.userId));
      }

      let totalAttempts = 0;
      let totalScore = 0;
      let totalCorrect = 0;
      let totalQuestions = 0;
      const quizStats: { quizTitle: string; attempts: number; avgScore: number }[] = [];
      const categoryStats: Record<string, { plays: number; quizzes: number }> = {};

      const studentScores: Record<string, { attempts: number; totalScore: number; name: string }> = {};
      const questionCorrectness: Record<string, { correct: number; total: number; text: string }> = {};

      for (const assignment of assignmentsList) {
        const attempts = await storage.getAttemptsByAssignment(assignment.id);
        totalAttempts += attempts.length;

        const questions = await storage.getQuestionsByQuiz(assignment.quizId);
        const questionMap = new Map(questions.map((q) => [q.id, q]));

        for (const attempt of attempts) {
          totalScore += attempt.score;
          totalCorrect += attempt.correctAnswers;
          totalQuestions += attempt.totalQuestions;

          if (!studentScores[attempt.userId]) {
            const user = await authStorage.getUser(attempt.userId);
            studentScores[attempt.userId] = { attempts: 0, totalScore: 0, name: user?.firstName || user?.email || "Noma'lum" };
          }
          studentScores[attempt.userId].attempts += 1;
          studentScores[attempt.userId].totalScore += attempt.score;

          if (attempt.answers) {
            for (const [qId, detail] of Object.entries(attempt.answers)) {
              if (!questionCorrectness[qId]) {
                const q = questionMap.get(qId);
                questionCorrectness[qId] = { correct: 0, total: 0, text: q?.questionText?.slice(0, 40) || qId };
              }
              questionCorrectness[qId].total += 1;
              if (detail.isCorrect) questionCorrectness[qId].correct += 1;
            }
          }
        }
      }

      const topStudents = Object.entries(studentScores)
        .map(([id, s]) => ({ name: s.name, attempts: s.attempts, avgScore: s.attempts > 0 ? Math.round(s.totalScore / s.attempts) : 0 }))
        .sort((a, b) => b.avgScore - a.avgScore)
        .slice(0, 5);

      const hardestQuestions = Object.entries(questionCorrectness)
        .map(([id, q]) => ({ question: q.text, correctRate: q.total > 0 ? Math.round((q.correct / q.total) * 100) : 0, total: q.total }))
        .filter((q) => q.total >= 1)
        .sort((a, b) => a.correctRate - b.correctRate)
        .slice(0, 5);

      for (const quiz of quizzesList) {
        const cat = quiz.category || "Boshqa";
        if (!categoryStats[cat]) categoryStats[cat] = { plays: 0, quizzes: 0 };
        categoryStats[cat].plays += quiz.totalPlays;
        categoryStats[cat].quizzes += 1;

        quizStats.push({
          quizTitle: quiz.title.slice(0, 20),
          attempts: quiz.totalPlays,
          avgScore: 0,
        });
      }

      const categoryData = Object.entries(categoryStats).map(([name, data]) => ({
        name,
        plays: data.plays,
        quizzes: data.quizzes,
      }));

      res.json({
        totalQuizzes,
        totalPlays,
        totalLikes,
        totalStudents: totalStudents.size,
        totalClasses: classList.length,
        totalAssignments: assignmentsList.length,
        totalAttempts,
        avgScore: totalAttempts > 0 ? Math.round(totalScore / totalAttempts) : 0,
        avgCorrectRate: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
        quizStats: quizStats.slice(0, 10),
        categoryData,
        topStudents,
        hardestQuestions,
      });
    } catch (error) {
      console.error("Teacher stats error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // === Class Routes ===
  app.post("/api/classes", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { name, description, level, startDate, endDate, scheduleType, scheduleDays, totalLessons } = req.body;
      const cls = await storage.createClass({
        name,
        description: description || null,
        level: level || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        scheduleType: scheduleType || null,
        scheduleDays: scheduleDays || null,
        totalLessons: totalLessons ? Number(totalLessons) : null,
        teacherId: req.userId,
        joinCode,
      } as any);
      res.json(cls);
    } catch (error) {
      console.error("Create class error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/classes", requireAuth, async (req: any, res) => {
    try {
      const userId = req.userId;
      const profile = await storage.getUserProfile(userId);
      if (!profile) return res.status(401).json({ message: "Unauthorized" });

      if (profile.role === "teacher" || profile.role === "admin") {
        const classList = await storage.getClassesByTeacher(userId);
        res.json(classList);
      } else {
        const classList = await storage.getClassesByStudent(userId);
        res.json(classList);
      }
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/classes/:id", requireAuth, async (req: any, res) => {
    try {
      const cls = await storage.getClass(req.params.id);
      if (!cls) return res.status(404).json({ message: "Class not found" });
      res.json(cls);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/classes/join", requireAuth, async (req: any, res) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ message: "Code is required" });
      const cls = await storage.getClassByCode(code.toUpperCase());
      if (!cls) return res.status(404).json({ message: "Class not found" });

      const members = await storage.getClassMembers(cls.id);
      const alreadyMember = members.some(m => m.userId === req.userId);
      if (alreadyMember) return res.status(400).json({ message: "Already a member" });

      const member = await storage.addClassMember({ classId: cls.id, userId: req.userId });
      res.json({ class: cls, member });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/classes/:id/members", requireAuth, async (req: any, res) => {
    try {
      const members = await storage.getClassMembers(req.params.id);
      const membersWithProfiles = await Promise.all(
        members.map(async (m) => {
          const profile = await storage.getUserProfile(m.userId);
          const user = await authStorage.getUser(m.userId);
          const name = profile?.displayName || user?.name || "Unknown";
          return { ...m, displayName: name, userName: name };
        })
      );
      res.json(membersWithProfiles);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/classes/:id/bulk-add-students", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const cls = await storage.getClass(req.params.id);
      if (!cls) return res.status(404).json({ message: "Class not found" });
      if (cls.teacherId !== req.userId && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { students } = req.body;
      if (!students || !Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ message: "O'quvchilar ro'yxati kerak" });
      }

      const results: { name: string; email: string; password: string; status: string }[] = [];
      const existingMembers = await storage.getClassMembers(cls.id);

      for (const studentName of students) {
        const trimmedName = (studentName as string).trim();
        if (!trimmedName) continue;

        const nameParts = trimmedName.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/);
        const baseEmail = nameParts.join('.') || 'student';
        const randomSuffix = Math.random().toString(36).substring(2, 6);
        const email = `${baseEmail}.${randomSuffix}@student.local`;
        const password = Math.random().toString(36).substring(2, 10);

        try {
          const existing = await authStorage.getUserByEmail(email);
          if (existing) {
            results.push({ name: trimmedName, email, password: "", status: "email_exists" });
            continue;
          }

          const hashedPassword = await bcrypt.hash(password, 10);
          const user = await authStorage.upsertUser({
            email,
            password: hashedPassword,
            firstName: trimmedName.split(" ")[0] || trimmedName,
            lastName: trimmedName.split(" ").slice(1).join(" ") || null,
          });

          await storage.createUserProfile({
            userId: user.id,
            role: "student",
            displayName: trimmedName,
            plan: "free",
            quizLimit: 5,
            isActive: true,
          });

          const alreadyMember = existingMembers.some(m => m.userId === user.id);
          if (!alreadyMember) {
            await storage.addClassMember({ classId: cls.id, userId: user.id });
          }

          results.push({ name: trimmedName, email, password, status: "created" });
        } catch (e) {
          console.error("Bulk add student error for:", trimmedName, e);
          results.push({ name: trimmedName, email, password: "", status: "error" });
        }
      }

      res.json({ results, classId: cls.id, className: cls.name });
    } catch (error) {
      console.error("Bulk add students error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/classes/:id/members/:userId", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      await storage.removeClassMember(req.params.id, req.params.userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/classes/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const cls = await storage.getClass(req.params.id);
      if (!cls) return res.status(404).json({ message: "Class not found" });
      if (cls.teacherId !== req.userId && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteClass(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/classes/:id/generate-lessons", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const cls = await storage.getClass(req.params.id);
      if (!cls) return res.status(404).json({ message: "Class not found" });
      if (cls.teacherId !== req.userId && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { startDate, scheduleType, scheduleDays, totalLessons } = req.body;
      if (!startDate || !scheduleType || !totalLessons) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      const lessons = await storage.generateLessonsForClass(
        req.params.id,
        new Date(startDate),
        scheduleType,
        scheduleDays || [],
        totalLessons
      );
      res.json(lessons);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/classes/:id/lessons", requireAuth, async (req: any, res) => {
    try {
      const lessons = await storage.getLessonsByClass(req.params.id);
      res.json(lessons);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/classes/:id/lessons", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const cls = await storage.getClass(req.params.id);
      if (!cls) return res.status(404).json({ message: "Class not found" });
      const { allowed: lessonAllowed } = await isTeacherOrAssistant(req.userId, cls, "canEditLessons");
      if (!lessonAllowed && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { lessonNo, date, title } = req.body;
      if (!lessonNo || !date) return res.status(400).json({ message: "lessonNo va date kerak" });

      const lesson = await storage.createClassLesson({
        classId: req.params.id,
        lessonNo: Number(lessonNo),
        date: new Date(date),
        title: title || `Dars ${lessonNo}`,
      } as any);

      const taskCols = await storage.getTaskColumnsByClass(req.params.id);
      for (const col of taskCols) {
        await storage.createLessonTask({
          lessonId: lesson.id,
          taskColumnId: col.id,
          dueDate: new Date(date),
        } as any);
      }

      res.json(lesson);
    } catch (error) {
      console.error("Add lesson error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/class-lessons/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const lesson = await storage.getClassLesson(req.params.id);
      if (!lesson) return res.status(404).json({ message: "Lesson not found" });
      const cls = await storage.getClass(lesson.classId);
      if (!cls) return res.status(404).json({ message: "Class not found" });
      const { allowed: editAllowed } = await isTeacherOrAssistant(req.userId, cls, "canEditLessons");
      if (!editAllowed && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const updates: any = {};
      if (req.body.title !== undefined) updates.title = req.body.title;
      if (req.body.date !== undefined) updates.date = new Date(req.body.date);
      if (req.body.lessonNo !== undefined) updates.lessonNo = Number(req.body.lessonNo);

      const updated = await storage.updateClassLesson(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Update lesson error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/class-lessons/:id/duplicate", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const original = await storage.getClassLesson(req.params.id);
      if (!original) return res.status(404).json({ message: "Lesson not found" });
      const cls = await storage.getClass(original.classId);
      if (!cls) return res.status(404).json({ message: "Class not found" });
      const { allowed: dupAllowed } = await isTeacherOrAssistant(req.userId, cls, "canEditLessons");
      if (!dupAllowed && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { date, lessonNo } = req.body;
      const allLessons = await storage.getLessonsByClass(original.classId);
      const newLessonNo = lessonNo ? Number(lessonNo) : (allLessons.length > 0 ? Math.max(...allLessons.map(l => l.lessonNo)) + 1 : 1);

      const newLesson = await storage.createClassLesson({
        classId: original.classId,
        lessonNo: newLessonNo,
        date: date ? new Date(date) : original.date,
        title: original.title ? `${original.title} (nusxa)` : `Dars ${newLessonNo}`,
      } as any);

      const originalTasks = (await storage.getLessonTasksByClass(original.classId)).filter(lt => lt.lessonId === original.id);
      for (const task of originalTasks) {
        await storage.createLessonTask({
          lessonId: newLesson.id,
          taskColumnId: task.taskColumnId,
          dueDate: date ? new Date(date) : task.dueDate,
        } as any);
      }

      res.json(newLesson);
    } catch (error) {
      console.error("Duplicate lesson error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/class-lessons/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const lesson = await storage.getClassLesson(req.params.id);
      if (!lesson) return res.status(404).json({ message: "Lesson not found" });
      const cls = await storage.getClass(lesson.classId);
      if (!cls) return res.status(404).json({ message: "Class not found" });
      const { allowed: delAllowed } = await isTeacherOrAssistant(req.userId, cls, "canEditLessons");
      if (!delAllowed && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteClassLesson(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete lesson error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/class-lessons/:id/tasks", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const lesson = await storage.getClassLesson(req.params.id);
      if (!lesson) return res.status(404).json({ message: "Lesson not found" });
      const cls = await storage.getClass(lesson.classId);
      if (!cls) return res.status(404).json({ message: "Class not found" });
      const { allowed: taskAllowed } = await isTeacherOrAssistant(req.userId, cls, "canEditLessons");
      if (!taskAllowed && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { taskColumnId, dueDate } = req.body;
      if (!taskColumnId) return res.status(400).json({ message: "taskColumnId kerak" });

      const existing = (await storage.getLessonTasksByClass(lesson.classId)).filter(
        lt => lt.lessonId === lesson.id && lt.taskColumnId === taskColumnId
      );
      if (existing.length > 0) {
        return res.status(400).json({ message: "Bu vazifa allaqachon qo'shilgan" });
      }

      const task = await storage.createLessonTask({
        lessonId: lesson.id,
        taskColumnId,
        dueDate: dueDate ? new Date(dueDate) : lesson.date,
      } as any);
      res.json(task);
    } catch (error) {
      console.error("Add lesson task error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/lesson-tasks/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const allClasses = await storage.getClassesByTeacher(req.userId);
      let found = false;
      for (const cls of allClasses) {
        const tasks = await storage.getLessonTasksByClass(cls.id);
        if (tasks.some(t => t.id === req.params.id)) {
          found = true;
          break;
        }
      }
      if (!found && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteLessonTask(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete lesson task error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/classes/:id/task-columns", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const cls = await storage.getClass(req.params.id);
      if (!cls) return res.status(404).json({ message: "Class not found" });
      const { allowed: colAllowed } = await isTeacherOrAssistant(req.userId, cls, "canEditLessons");
      if (!colAllowed && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const col = await storage.createTaskColumn({
        classId: req.params.id,
        title: req.body.title,
        sortOrder: req.body.sortOrder || 0,
      });
      res.json(col);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/classes/:id/task-columns", requireAuth, async (req: any, res) => {
    try {
      const columns = await storage.getTaskColumnsByClass(req.params.id);
      res.json(columns);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/classes/:id/task-columns/:colId", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const cls = await storage.getClass(req.params.id);
      if (!cls) return res.status(404).json({ message: "Class not found" });
      const { allowed: colPatchAllowed } = await isTeacherOrAssistant(req.userId, cls, "canEditLessons");
      if (!colPatchAllowed && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const updates: any = {};
      if (req.body.title !== undefined) updates.title = req.body.title;
      if (req.body.sortOrder !== undefined) updates.sortOrder = req.body.sortOrder;
      const updated = await storage.updateTaskColumn(req.params.colId, updates);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/classes/:id/task-columns/:colId", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      await storage.deleteTaskColumn(req.params.colId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // === Class Assistant Routes ===
  app.post("/api/classes/:id/assistants", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const cls = await storage.getClass(req.params.id);
      if (!cls || (cls.teacherId !== req.userId && req.userProfile?.role !== "admin")) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const { password, permissions } = req.body;
      let hashedPassword: string | null = null;
      if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
      }
      const assistant = await storage.createClassAssistant({
        classId: cls.id,
        inviteCode,
        password: hashedPassword,
        permissions: permissions || { canMarkTasks: true, canSendTelegram: false, canEditLessons: false, canViewTracker: true },
        invitedBy: req.userId,
        status: "pending",
      } as any);
      res.json(assistant);
    } catch (error) {
      console.error("Create assistant error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/classes/:id/assistants", requireAuth, async (req: any, res) => {
    try {
      const cls = await storage.getClass(req.params.id);
      if (!cls) return res.status(404).json({ message: "Class not found" });
      const { allowed } = await isTeacherOrAssistant(req.userId, cls);
      if (!allowed && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const assistants = await storage.getClassAssistants(req.params.id);
      const result = await Promise.all(assistants.map(async (a) => {
        let userName = null;
        if (a.userId) {
          const user = await authStorage.getUser(a.userId);
          userName = user?.name || user?.email || null;
        }
        return { ...a, password: a.password ? "***" : null, userName };
      }));
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/class-assistants/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const assistants = await storage.getClassAssistants(req.body.classId || "");
      const target = assistants.find(a => a.id === req.params.id);
      if (!target) {
        const allClasses = await storage.getClassesByTeacher(req.userId);
        let found: any = null;
        for (const c of allClasses) {
          const classAssists = await storage.getClassAssistants(c.id);
          found = classAssists.find(a => a.id === req.params.id);
          if (found) break;
        }
        if (!found) return res.status(404).json({ message: "Not found" });
      }
      const updates: any = {};
      if (req.body.permissions !== undefined) updates.permissions = req.body.permissions;
      if (req.body.status !== undefined) updates.status = req.body.status;
      const updated = await storage.updateClassAssistant(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Update assistant error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/class-assistants/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      await storage.deleteClassAssistant(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/invite-info/:code", async (req, res) => {
    try {
      const assistant = await storage.getClassAssistantByCode(req.params.code);
      if (!assistant) return res.status(404).json({ message: "Noto'g'ri invite kod" });
      if (assistant.status === "revoked") return res.status(403).json({ message: "Bu taklif bekor qilingan" });
      const cls = await storage.getClass(assistant.classId);
      let teacherName = "—";
      if (cls) {
        try {
          const teacherUser = await authStorage.getUser(cls.teacherId);
          teacherName = teacherUser?.name || teacherUser?.email || "—";
        } catch {}
      }
      res.json({
        hasPassword: !!assistant.password,
        className: cls?.name || "Sinf",
        teacherName,
        status: assistant.status,
        alreadyClaimed: !!assistant.userId,
      });
    } catch (error) {
      console.error("Invite info error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/classes/join-assistant", requireAuth, async (req: any, res) => {
    try {
      const { inviteCode, password } = req.body;
      if (!inviteCode) return res.status(400).json({ message: "Invite kodi kerak" });
      const assistant = await storage.getClassAssistantByCode(inviteCode);
      if (!assistant) return res.status(404).json({ message: "Noto'g'ri invite kod" });
      if (assistant.status === "revoked") return res.status(403).json({ message: "Bu taklif bekor qilingan" });
      if (assistant.userId && assistant.userId !== req.userId) {
        return res.status(400).json({ message: "Bu taklif boshqa foydalanuvchiga tegishli" });
      }
      if (assistant.password) {
        if (!password) return res.status(400).json({ message: "Parol kerak", requirePassword: true });
        const valid = await bcrypt.compare(password, assistant.password);
        if (!valid) return res.status(403).json({ message: "Noto'g'ri parol" });
      }
      const updated = await storage.updateClassAssistant(assistant.id, {
        userId: req.userId,
        status: "active",
      } as any);
      const cls = await storage.getClass(assistant.classId);
      res.json({ assistant: updated, class: cls });
    } catch (error) {
      console.error("Join assistant error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/assistant-classes", requireAuth, async (req: any, res) => {
    try {
      const assistantRecords = await storage.getAssistantClasses(req.userId);
      const result = await Promise.all(assistantRecords.map(async (a) => {
        const cls = await storage.getClass(a.classId);
        if (!cls) return null;
        let teacherName = "—";
        try {
          const teacherUser = await authStorage.getUser(cls.teacherId);
          teacherName = teacherUser?.name || teacherUser?.email || "—";
        } catch {}
        return { ...a, className: cls.name, teacherName };
      }));
      res.json(result.filter(Boolean));
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // === Question Bank Routes ===
  app.get("/api/question-bank", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const bankQuestions = await storage.getBankQuestionsByCreator(req.userId);
      res.json(bankQuestions);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/question-bank", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const item = await storage.createBankQuestion({
        ...req.body,
        creatorId: req.userId,
      });
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/question-bank/from-quiz/:quizId", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const questionsList = await storage.getQuestionsByQuiz(req.params.quizId);
      const created = [];
      for (const q of questionsList) {
        const item = await storage.createBankQuestion({
          creatorId: req.userId,
          type: q.type,
          questionText: q.questionText,
          options: q.options,
          correctAnswer: q.correctAnswer,
          points: q.points,
          timeLimit: q.timeLimit,
          category: null,
          tags: null,
        });
        created.push(item);
      }
      res.json({ imported: created.length, questions: created });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/question-bank/to-quiz/:quizId", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const { questionIds } = req.body;
      if (!questionIds || !Array.isArray(questionIds)) {
        return res.status(400).json({ message: "questionIds array required" });
      }
      const existingQuestions = await storage.getQuestionsByQuiz(req.params.quizId);
      let orderIndex = existingQuestions.length;
      const created = [];
      for (const bankId of questionIds) {
        const bankQ = await storage.getBankQuestion(bankId);
        if (bankQ) {
          const q = await storage.createQuestion({
            quizId: req.params.quizId,
            orderIndex: orderIndex++,
            type: bankQ.type,
            questionText: bankQ.questionText,
            options: bankQ.options,
            correctAnswer: bankQ.correctAnswer,
            points: bankQ.points,
            timeLimit: bankQ.timeLimit,
            mediaUrl: null,
            mediaType: null,
          });
          created.push(q);
        }
      }
      res.json({ added: created.length, questions: created });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/question-bank/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      await storage.deleteBankQuestion(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // === Discover / Likes Routes ===
  app.get("/api/discover", async (req, res) => {
    try {
      const { q, category, sort } = req.query as { q?: string; category?: string; sort?: string };
      let publicQuizzes = await storage.getPublicQuizzes();

      if (q) {
        const search = q.toLowerCase();
        publicQuizzes = publicQuizzes.filter(quiz =>
          quiz.title.toLowerCase().includes(search) ||
          (quiz.description && quiz.description.toLowerCase().includes(search))
        );
      }

      if (category) {
        publicQuizzes = publicQuizzes.filter(quiz => quiz.category === category);
      }

      if (sort === "popular") {
        publicQuizzes.sort((a, b) => b.totalPlays - a.totalPlays);
      } else if (sort === "likes") {
        publicQuizzes.sort((a, b) => b.totalLikes - a.totalLikes);
      }

      res.json(publicQuizzes);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/quizzes/:id/like", requireAuth, async (req: any, res) => {
    try {
      const result = await storage.toggleQuizLike(req.params.id, req.userId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/quizzes/:id/liked", requireAuth, async (req: any, res) => {
    try {
      const liked = await storage.isQuizLiked(req.params.id, req.userId);
      res.json({ liked });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // === Public Quiz Play Routes ===
  app.get("/api/quizzes/:id/play", async (req, res) => {
    try {
      const quiz = await storage.getQuiz(req.params.id);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });
      if (!quiz.isPublic) return res.status(403).json({ message: "Bu quiz ommaviy emas" });

      let questionsList = await storage.getQuestionsByQuiz(req.params.id);

      if (quiz.shuffleQuestions) {
        questionsList = fisherYatesShuffle(questionsList);
      }

      if (quiz.shuffleOptions) {
        questionsList = balancedShuffleOptions(questionsList);
      }

      const safeQuestions = questionsList.map(q => ({
        id: q.id,
        questionText: q.questionText,
        type: q.type,
        options: q.options,
        points: q.points,
        timeLimit: q.timeLimit,
        mediaUrl: q.mediaUrl,
        mediaType: q.mediaType,
      }));

      res.json({
        quiz: { id: quiz.id, title: quiz.title, description: quiz.description, category: quiz.category, totalQuestions: quiz.totalQuestions, practiceMode: quiz.practiceMode ?? false },
        questions: safeQuestions,
      });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/quizzes/:id/submit-public", async (req, res) => {
    try {
      const quiz = await storage.getQuiz(req.params.id);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });
      if (!quiz.isPublic) return res.status(403).json({ message: "Bu quiz ommaviy emas" });

      const questionsList = await storage.getQuestionsByQuiz(req.params.id);
      const userAnswers: Record<string, string | string[]> = req.body.answers || {};
      const playerName = req.body.playerName || "Mehmon";
      let score = 0;
      let correctCount = 0;
      const results: Record<string, { answer: string | string[]; isCorrect: boolean; correctAnswer: string; points: number }> = {};

      for (const q of questionsList) {
        const userAnswer = userAnswers[q.id];

        if (q.type === "poll") {
          results[q.id] = { answer: userAnswer || "", isCorrect: true, correctAnswer: "", points: 0 };
          continue;
        }

        if (q.type === "multiple_select") {
          const selected = Array.isArray(userAnswer) ? userAnswer : [];
          const correctAnswers = q.correctAnswer ? q.correctAnswer.split(",").map((s: string) => s.trim()) : [];
          const isCorrect = correctAnswers.length > 0 &&
            selected.length === correctAnswers.length &&
            selected.every((a: string) => correctAnswers.includes(a));
          if (isCorrect) { correctCount++; score += (q.points || 10); }
          results[q.id] = { answer: selected, isCorrect, correctAnswer: q.correctAnswer || "", points: isCorrect ? (q.points || 10) : 0 };
          continue;
        }

        const isCorrect = userAnswer !== undefined && userAnswer !== null &&
          String(userAnswer).trim().toLowerCase() === String(q.correctAnswer || "").trim().toLowerCase();
        if (isCorrect) { correctCount++; score += (q.points || 10); }
        results[q.id] = { answer: userAnswer || "", isCorrect, correctAnswer: q.correctAnswer || "", points: isCorrect ? (q.points || 10) : 0 };
      }

      if (!quiz.practiceMode) {
        await storage.incrementQuizPlays(req.params.id);
      }

      const showCorrect = quiz.showCorrectAnswers !== false;
      const safeResults = showCorrect ? results : Object.fromEntries(
        Object.entries(results).map(([k, v]) => [k, { ...v, correctAnswer: "" }])
      );

      res.json({
        score,
        correctAnswers: correctCount,
        totalQuestions: questionsList.length,
        playerName,
        results: safeResults,
        showCorrectAnswers: showCorrect,
        practiceMode: quiz.practiceMode ?? false,
      });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // === CSV Export Routes ===
  app.get("/api/sessions/:id/export-csv", requireAuth, async (req: any, res) => {
    try {
      const results = await storage.getResultsBySession(req.params.id);
      const session = await storage.getLiveSession(req.params.id);
      if (!session) return res.status(404).json({ message: "Session not found" });

      let csv = "Name,Score,Correct,Total,Rank,CompletedAt\n";
      for (const r of results) {
        const name = (r.guestName || r.userId || "Unknown").replace(/,/g, " ");
        csv += `${name},${r.totalScore},${r.correctAnswers},${r.totalQuestions},${r.rank || ""},${r.completedAt ? new Date(r.completedAt).toISOString() : ""}\n`;
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=session_${req.params.id}_results.csv`);
      res.send(csv);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/assignments/:id/export-csv", requireAuth, async (req: any, res) => {
    try {
      const assignment = await storage.getAssignment(req.params.id);
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });

      const attempts = await storage.getAttemptsByAssignment(req.params.id);

      let csv = "UserId,Score,Correct,Total,CompletedAt\n";
      for (const a of attempts) {
        const profile = await storage.getUserProfile(a.userId);
        const name = (profile?.displayName || a.userId).replace(/,/g, " ");
        csv += `${name},${a.score},${a.correctAnswers},${a.totalQuestions},${a.completedAt ? new Date(a.completedAt).toISOString() : ""}\n`;
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=assignment_${req.params.id}_results.csv`);
      res.send(csv);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/live-lessons", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const { title, lessonType, pdfUrl, pdfFileName, requireCode, totalPages } = req.body;
      if (!title) return res.status(400).json({ message: "Title is required" });
      const type = lessonType === "voice" ? "voice" : "pdf";
      if (type === "pdf" && !pdfUrl) return res.status(400).json({ message: "PDF is required for PDF lessons" });
      const joinCode = generateJoinCode();
      const lesson = await storage.createLiveLesson({
        teacherId: req.userId,
        title,
        lessonType: type,
        pdfUrl: pdfUrl || null,
        pdfFileName: pdfFileName || null,
        joinCode,
        requireCode: requireCode !== false,
        status: "waiting",
        totalPages: totalPages || 0,
      });
      res.json(lesson);
    } catch (error) {
      console.error("Create live lesson error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/live-lessons", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const lessons = await storage.getLiveLessonsByTeacher(req.userId);
      res.json(lessons);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/live-lessons/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const lesson = await storage.getLiveLesson(req.params.id);
      if (!lesson) return res.status(404).json({ message: "Lesson not found" });
      if (lesson.teacherId !== req.userId) return res.status(403).json({ message: "Forbidden" });
      res.json(lesson);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/live-lessons/join/:code", async (req: any, res) => {
    try {
      const lesson = await storage.getLiveLessonByCode(req.params.code);
      if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
      if (lesson.status === "ended") return res.status(400).json({ message: "Dars tugagan" });
      res.json({
        id: lesson.id,
        title: lesson.title,
        lessonType: lesson.lessonType || "pdf",
        pdfUrl: lesson.pdfUrl,
        status: lesson.status,
        currentPage: lesson.currentPage,
        totalPages: lesson.totalPages,
        requireCode: lesson.requireCode,
        joinCode: lesson.joinCode,
      });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/live-lessons/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const lesson = await storage.getLiveLesson(req.params.id);
      if (!lesson || lesson.teacherId !== req.userId) return res.status(403).json({ message: "Forbidden" });
      const allowedFields = ["title", "status", "currentPage", "requireCode", "totalPages", "startedAt", "endedAt"] as const;
      const safeUpdate: Record<string, any> = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          if ((key === "startedAt" || key === "endedAt") && typeof req.body[key] === "string") {
            safeUpdate[key] = new Date(req.body[key]);
          } else {
            safeUpdate[key] = req.body[key];
          }
        }
      }
      const updated = await storage.updateLiveLesson(req.params.id, safeUpdate);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/live-lessons/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const lesson = await storage.getLiveLesson(req.params.id);
      if (!lesson || lesson.teacherId !== req.userId) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteLiveLesson(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/quizzes/:quizId/export/:format", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const { quizId, format } = req.params;
      const includeAnswers = req.query.answers === "true";

      if (!["pdf", "docx"].includes(format)) {
        return res.status(400).json({ message: "Format faqat pdf yoki docx bo'lishi mumkin" });
      }

      const quiz = await storage.getQuiz(quizId);
      if (!quiz) {
        return res.status(404).json({ message: "Quiz topilmadi" });
      }

      const questions = await storage.getQuestionsByQuiz(quizId);
      if (!questions || questions.length === 0) {
        return res.status(400).json({ message: "Quizda savollar mavjud emas" });
      }

      const quizData = {
        title: quiz.title,
        description: quiz.description,
        category: quiz.category,
      };

      const questionData = questions.map((q: any) => ({
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        type: q.type,
        points: q.points,
      }));

      if (format === "pdf") {
        const pdfBuffer = await generateQuizPDF(quizData, questionData, includeAnswers);
        const filename = `${quiz.title.replace(/[^a-zA-Z0-9\u0400-\u04FF\u0600-\u06FF ]/g, "").trim()}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
        res.send(pdfBuffer);
      } else {
        const docxBuffer = await generateQuizDOCX(quizData, questionData, includeAnswers);
        const filename = `${quiz.title.replace(/[^a-zA-Z0-9\u0400-\u04FF\u0600-\u06FF ]/g, "").trim()}.docx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
        res.send(docxBuffer);
      }
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ message: "Eksport xatosi" });
    }
  });

  app.get("/api/classes/:id/tracker", requireAuth, async (req: any, res) => {
    try {
      const cls = await storage.getClass(req.params.id);
      if (!cls) return res.status(404).json({ message: "Class not found" });
      const { allowed } = await isTeacherOrAssistant(req.userId, cls, "canViewTracker");
      if (!allowed && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const [members, lessons, taskColumnsData, existingLessonTasks, submissionsData] = await Promise.all([
        storage.getClassMembers(req.params.id),
        storage.getLessonsByClass(req.params.id),
        storage.getTaskColumnsByClass(req.params.id),
        storage.getLessonTasksByClass(req.params.id),
        storage.getSubmissionsByClass(req.params.id),
      ]);

      let lessonTasksData = existingLessonTasks;
      if (lessonTasksData.length === 0 && lessons.length > 0 && taskColumnsData.length > 0) {
        const created: any[] = [];
        for (const lesson of lessons) {
          for (const col of taskColumnsData) {
            const lt = await storage.createLessonTask({
              lessonId: lesson.id,
              taskColumnId: col.id,
              dueDate: lesson.date || null,
            } as any);
            created.push(lt);
          }
        }
        lessonTasksData = created;
      }

      const membersWithProfiles = await Promise.all(
        members.map(async (m) => {
          const profile = await storage.getUserProfile(m.userId);
          const user = await authStorage.getUser(m.userId);
          const name = profile?.displayName || user?.name || "Unknown";
          return { ...m, displayName: name, userName: name };
        })
      );

      const { isAssistant, assistant } = await isTeacherOrAssistant(req.userId, cls);
      res.json({
        classInfo: cls,
        students: membersWithProfiles,
        lessons,
        taskColumns: taskColumnsData,
        lessonTasks: lessonTasksData,
        submissions: submissionsData,
        isAssistant,
        assistantPermissions: isAssistant ? assistant?.permissions : null,
      });
    } catch (error) {
      console.error("Tracker error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/submissions", requireAuth, async (req: any, res) => {
    try {
      const { studentId, lessonTaskId, status, score, feedback } = req.body;
      if (!studentId || !lessonTaskId) {
        return res.status(400).json({ message: "studentId va lessonTaskId kerak" });
      }
      const profile = await storage.getUserProfile(req.userId);
      if (!profile) return res.status(403).json({ message: "Forbidden" });
      if (profile.role === "admin") {
      } else if (profile.role === "teacher") {
      } else {
        const allAssistants = await storage.getAssistantClasses(req.userId);
        const hasMarkPermission = allAssistants.some(a => {
          const perms = a.permissions as any;
          return a.status === "active" && perms?.canMarkTasks;
        });
        if (!hasMarkPermission) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      const submission = await storage.createOrUpdateSubmission({
        studentId,
        lessonTaskId,
        status: status || "pending",
        score: score !== undefined ? Number(score) : null,
        feedback: feedback || null,
      });
      res.json(submission);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/classes/:id/debtors", requireAuth, async (req: any, res) => {
    try {
      const cls = await storage.getClass(req.params.id);
      if (!cls) return res.status(404).json({ message: "Class not found" });
      const profile = await storage.getUserProfile(req.userId);
      const { allowed: debtorAllowed } = await isTeacherOrAssistant(req.userId, cls, "canViewTracker");
      if (!debtorAllowed && profile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const debtors = await storage.getDebtors(req.params.id);
      const members = await storage.getClassMembers(req.params.id);
      const profileMap = new Map<string, string>();
      for (const m of members) {
        const profile = await storage.getUserProfile(m.userId);
        profileMap.set(m.userId, profile?.displayName || "Unknown");
      }

      const debtorsWithNames = debtors.map(d => ({
        ...d,
        studentName: profileMap.get(d.studentId) || "Unknown",
      }));

      res.json(debtorsWithNames);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/classes/:id/telegram-notify", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const cls = await storage.getClass(req.params.id);
      if (!cls) return res.status(404).json({ message: "Class not found" });
      const { allowed: tgAllowed } = await isTeacherOrAssistant(req.userId, cls, "canSendTelegram");
      if (!tgAllowed && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const ownerProfile = await storage.getUserProfile(cls.teacherId);
      if (!ownerProfile?.telegramBotToken) {
        return res.status(400).json({ message: "Sinf egasi Telegram bot tokenini saqlamagan" });
      }
      const profile = ownerProfile;

      const { chatId, type, lessonId } = req.body;
      if (!chatId) return res.status(400).json({ message: "Chat ID kerak" });
      const validTypes = ["today_task", "debtors", "weekly_report", "monthly_report", "lesson_report"];
      if (!type || !validTypes.includes(type)) {
        return res.status(400).json({ message: `type: ${validTypes.join(" | ")}` });
      }

      const TelegramBot = (await import("node-telegram-bot-api")).default;
      const bot = new TelegramBot(profile.telegramBotToken);
      const targetChat = chatId.startsWith("@") || chatId.startsWith("-") ? chatId : (isNaN(Number(chatId)) ? `@${chatId}` : Number(chatId));

      const sendLongMessage = async (text: string) => {
        const MAX_LEN = 4000;
        if (text.length <= MAX_LEN) {
          await bot.sendMessage(targetChat, text, { parse_mode: "Markdown" });
          return;
        }
        const lines = text.split("\n");
        let chunk = "";
        for (const line of lines) {
          if ((chunk + line + "\n").length > MAX_LEN && chunk.length > 0) {
            await bot.sendMessage(targetChat, chunk.trim(), { parse_mode: "Markdown" });
            chunk = "";
          }
          chunk += line + "\n";
        }
        if (chunk.trim()) {
          await bot.sendMessage(targetChat, chunk.trim(), { parse_mode: "Markdown" });
        }
      };

      const generateTrackerPDF = async (options: {
        title: string;
        subtitle: string;
        columns: string[];
        rows: { name: string; cells: { text: string; color?: string }[]; summary?: string }[];
        stats?: { label: string; value: string }[];
      }): Promise<Buffer> => {
        const PDFDocument = (await import("pdfkit")).default;
        const path = (await import("path")).default;
        const fs = (await import("fs")).default;

        return new Promise((resolve, reject) => {
          const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30, bufferPages: true });
          const chunks: Buffer[] = [];
          doc.on("data", (c: Buffer) => chunks.push(c));
          doc.on("end", () => resolve(Buffer.concat(chunks)));
          doc.on("error", reject);

          const fontDir = path.join(process.cwd(), "server", "fonts");
          const regularFont = path.join(fontDir, "NotoSans-Regular.ttf");
          const arabicFont = path.join(fontDir, "NotoSansArabic-Regular.ttf");
          const hasRegular = fs.existsSync(regularFont);
          const hasArabic = fs.existsSync(arabicFont);
          if (hasRegular) doc.registerFont("NotoSans", regularFont);
          if (hasArabic) doc.registerFont("NotoArabic", arabicFont);
          const mainFont = hasRegular ? "NotoSans" : "Helvetica";

          const RTL = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
          const writeText = (text: string, x: number, y: number, opts: any = {}) => {
            if (RTL.test(text) && hasArabic) {
              doc.font("NotoArabic");
            } else {
              doc.font(mainFont);
            }
            doc.text(text, x, y, { lineBreak: false, ...opts });
          };

          const pageW = 841.89 - 60;
          const nameColW = 140;
          const numColW = 30;
          const summaryColW = 60;
          const dataAreaW = pageW - nameColW - numColW - summaryColW;
          const colCount = options.columns.length || 1;
          const cellW = Math.min(Math.max(dataAreaW / colCount, 30), 80);

          doc.font(mainFont).fontSize(14).text(options.title, 30, 30, { align: "center", width: pageW });
          doc.fontSize(10).fillColor("#666").text(options.subtitle, 30, doc.y + 2, { align: "center", width: pageW });
          doc.moveDown(0.6);
          doc.fillColor("#000");

          const headerY = doc.y;
          const rowH = 18;

          doc.fontSize(7).font(mainFont);
          doc.rect(30, headerY, pageW, rowH).fill("#2563eb");
          doc.fillColor("#fff");
          writeText("№", 32, headerY + 4, { width: numColW });
          writeText("Ism", 32 + numColW, headerY + 4, { width: nameColW - 4 });
          let hx = 30 + numColW + nameColW;
          for (const col of options.columns) {
            writeText(col, hx + 2, headerY + 4, { width: cellW - 4 });
            hx += cellW;
          }
          writeText("Jami", hx + 2, headerY + 4, { width: summaryColW - 4 });
          doc.fillColor("#000");

          let currentY = headerY + rowH;
          options.rows.forEach((row, i) => {
            if (currentY > 550) {
              doc.addPage();
              currentY = 30;
            }

            const bgColor = i % 2 === 0 ? "#f8fafc" : "#ffffff";
            doc.rect(30, currentY, pageW, rowH).fill(bgColor);
            doc.fillColor("#000").fontSize(7);

            writeText(`${i + 1}`, 32, currentY + 4, { width: numColW });
            writeText(row.name, 32 + numColW, currentY + 4, { width: nameColW - 4 });

            let cx = 30 + numColW + nameColW;
            for (const cell of row.cells) {
              if (cell.color) {
                doc.rect(cx, currentY, cellW, rowH).fill(cell.color);
              }
              doc.fillColor("#000").fontSize(7);
              writeText(cell.text, cx + 2, currentY + 4, { width: cellW - 4 });
              cx += cellW;
            }

            if (row.summary) {
              doc.fillColor("#000").fontSize(7);
              writeText(row.summary, cx + 2, currentY + 4, { width: summaryColW - 4 });
            }

            currentY += rowH;
          });

          if (options.stats && options.stats.length > 0) {
            currentY += 10;
            if (currentY > 540) { doc.addPage(); currentY = 30; }
            doc.font(mainFont).fontSize(9).fillColor("#000");
            for (const stat of options.stats) {
              doc.text(`${stat.label}: ${stat.value}`, 35, currentY);
              currentY += 14;
            }
          }

          doc.end();
        });
      };

      const sendPdfDocument = async (pdfBuffer: Buffer, filename: string, caption: string) => {
        await bot.sendDocument(targetChat, pdfBuffer, {
          caption: caption.substring(0, 1024),
        }, {
          filename,
          contentType: "application/pdf",
        });
      };

      const getProfileMap = async (classId: string) => {
        const members = await storage.getClassMembers(classId);
        const profileMap = new Map<string, string>();
        for (const m of members) {
          const user = await authStorage.getUser(m.userId);
          const p = await storage.getUserProfile(m.userId);
          profileMap.set(m.userId, p?.displayName || user?.username || user?.email || "Noma'lum");
        }
        return { members, profileMap };
      };

      const escMd = (s: string) => s.replace(/([_*`\[])/g, "\\$1");

      const statusEmoji = (status: string) => {
        if (status === "submitted") return "✅";
        if (status === "missing") return "❌";
        if (status === "pending") return "⏳";
        if (status === "rework") return "🔄";
        return "➖";
      };

      if (type === "today_task") {
        const lessons = await storage.getLessonsByClass(req.params.id);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const todayLesson = lessons.find(l => {
          const d = new Date(l.date);
          return d >= today && d < tomorrow;
        });
        if (!todayLesson) {
          return res.status(400).json({ message: "Bugun dars topilmadi" });
        }
        const lessonTasksData = await storage.getLessonTasksByClass(req.params.id);
        const taskColumnsData = await storage.getTaskColumnsByClass(req.params.id);
        const columnMap = new Map(taskColumnsData.map(c => [c.id, c.title]));
        const todayTasks = lessonTasksData.filter(lt => lt.lessonId === todayLesson.id);
        const taskNames = todayTasks.map(t => columnMap.get(t.taskColumnId) || "Vazifa").join(", ");
        const message = `📚 *${escMd(cls.name)} — Dars ${todayLesson.lessonNo}*\n${escMd(todayLesson.title || "")}\n\n📝 Vazifalar: ${escMd(taskNames || "Vazifa yo'q")}`;
        await bot.sendMessage(targetChat, message, { parse_mode: "Markdown" });
        res.json({ success: true, message: "Bugungi vazifa yuborildi" });

      } else if (type === "lesson_report") {
        if (!lessonId) return res.status(400).json({ message: "lessonId kerak" });
        const lesson = await storage.getClassLesson(lessonId);
        if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });

        const lessonTasksData = await storage.getLessonTasksByClass(req.params.id);
        const taskColumnsData = await storage.getTaskColumnsByClass(req.params.id);
        const submissions = await storage.getSubmissionsByClass(req.params.id);
        const { members, profileMap } = await getProfileMap(req.params.id);

        const columnMap = new Map(taskColumnsData.map(c => [c.id, c.title]));
        const lessonTasks = lessonTasksData.filter(lt => lt.lessonId === lessonId);
        const submissionMap = new Map<string, any>();
        for (const s of submissions) {
          submissionMap.set(`${s.studentId}_${s.lessonTaskId}`, s);
        }

        const dateStr = new Date(lesson.date).toLocaleDateString("uz-UZ", { day: "numeric", month: "long", year: "numeric" });
        let text = `📋 *${escMd(cls.name)}*\n`;
        text += `📖 *Dars ${lesson.lessonNo}* — ${escMd(dateStr)}\n`;
        if (lesson.title) text += `${escMd(lesson.title)}\n`;
        text += `\n`;

        const colHeaders = lessonTasks.map(lt => columnMap.get(lt.taskColumnId) || "?");
        text += `📝 Vazifalar: ${escMd(colHeaders.join(" | "))}\n\n`;

        let allDone = 0;
        let hasDebt = 0;
        for (const m of members) {
          const name = profileMap.get(m.userId) || "Noma'lum";
          const statuses: string[] = [];
          let studentDone = 0;
          for (const lt of lessonTasks) {
            const sub = submissionMap.get(`${m.userId}_${lt.id}`);
            const status = sub?.status || "missing";
            statuses.push(statusEmoji(status));
            if (status === "submitted") studentDone++;
          }
          const scoreStr = lessonTasks.length > 0 ? ` (${studentDone}/${lessonTasks.length})` : "";
          const line = `${statuses.join(" ")} — ${escMd(name)}${scoreStr}\n`;
          text += line;
          if (studentDone === lessonTasks.length) allDone++;
          else hasDebt++;
        }

        text += `\n📊 Jami: ${members.length} ta o'quvchi\n`;
        text += `✅ Barchasi bajarilgan: ${allDone}\n`;
        text += `❌ Qarzdor: ${hasDebt}\n`;

        const statusLabel = (st: string) => st === "submitted" ? "+" : st === "missing" ? "-" : st === "pending" ? "?" : "R";
        const statusColor = (st: string) => st === "submitted" ? "#dcfce7" : st === "missing" ? "#fecaca" : st === "pending" ? "#fef9c3" : "#dbeafe";

        const pdfRows = members.map(m => {
          const name = profileMap.get(m.userId) || "Noma'lum";
          let done = 0;
          const cells = lessonTasks.map(lt => {
            const sub = submissionMap.get(`${m.userId}_${lt.id}`);
            const st = sub?.status || "missing";
            if (st === "submitted") done++;
            const scoreText = sub?.score != null ? `${statusLabel(st)} ${sub.score}` : statusLabel(st);
            return { text: scoreText, color: statusColor(st) };
          });
          return { name, cells, summary: `${done}/${lessonTasks.length}` };
        });

        const pdfBuf = await generateTrackerPDF({
          title: `${cls.name} — Dars ${lesson.lessonNo}`,
          subtitle: `${dateStr}${lesson.title ? " | " + lesson.title : ""}`,
          columns: colHeaders,
          rows: pdfRows,
          stats: [
            { label: "Jami o'quvchilar", value: `${members.length}` },
            { label: "Barchasi bajarilgan", value: `${allDone}` },
            { label: "Qarzdor", value: `${hasDebt}` },
          ],
        });

        await sendPdfDocument(pdfBuf, `Dars_${lesson.lessonNo}_hisobot.pdf`, `📋 ${cls.name} — Dars ${lesson.lessonNo} hisoboti`);
        await sendLongMessage(text);
        res.json({ success: true, message: "Dars hisoboti yuborildi" });

      } else if (type === "debtors") {
        const debtors = await storage.getDebtors(req.params.id);
        if (debtors.length === 0) {
          const message = `✅ *${escMd(cls.name)}*\n\nBarcha vazifalar bajarilgan! Qarzdorlar yo'q.`;
          await bot.sendMessage(targetChat, message, { parse_mode: "Markdown" });
          return res.json({ success: true, message: "Qarzdorlar yo'q" });
        }

        const { profileMap } = await getProfileMap(req.params.id);

        const grouped = new Map<string, { tasks: string[]; count: number }>();
        for (const d of debtors) {
          const name = profileMap.get(d.studentId) || "Noma'lum";
          if (!grouped.has(d.studentId)) grouped.set(d.studentId, { tasks: [], count: 0 });
          const g = grouped.get(d.studentId)!;
          g.tasks.push(`Dars ${d.lessonNo}: ${d.taskTitle}`);
          g.count++;
        }

        const sortedDebtors = Array.from(grouped.entries())
          .map(([id, data]) => ({ name: profileMap.get(id) || "Noma'lum", ...data }))
          .sort((a, b) => b.count - a.count);

        let text = `⚠️ *${escMd(cls.name)} — Qarzdorlar*\n`;
        text += `📅 ${new Date().toLocaleDateString("uz-UZ", { day: "numeric", month: "long", year: "numeric" })}\n\n`;

        for (let i = 0; i < sortedDebtors.length; i++) {
          const d = sortedDebtors[i];
          text += `${i + 1}. ${escMd(d.name)} — ${d.count} ta ❌\n`;
          for (const t of d.tasks.slice(0, 3)) {
            text += `   └ ${escMd(t)}\n`;
          }
          if (d.tasks.length > 3) text += `   └ ... va yana ${d.tasks.length - 3} ta\n`;
        }

        text += `\n📊 Jami qarzdor: ${sortedDebtors.length} ta o'quvchi, ${debtors.length} ta vazifa`;

        const debtorPdfRows = sortedDebtors.map(d => ({
          name: d.name,
          cells: [
            { text: `${d.count}`, color: d.count > 5 ? "#fecaca" : d.count > 2 ? "#fef9c3" : "#fff" },
            { text: d.tasks.slice(0, 6).join(", "), color: undefined },
          ],
          summary: `${d.count} ta`,
        }));

        const debtorPdf = await generateTrackerPDF({
          title: `${cls.name} — Qarzdorlar`,
          subtitle: new Date().toLocaleDateString("uz-UZ", { day: "numeric", month: "long", year: "numeric" }),
          columns: ["Soni", "Bajarilmagan vazifalar"],
          rows: debtorPdfRows,
          stats: [
            { label: "Jami qarzdor", value: `${sortedDebtors.length} ta o'quvchi` },
            { label: "Jami bajarilmagan", value: `${debtors.length} ta vazifa` },
          ],
        });

        await sendPdfDocument(debtorPdf, `Qarzdorlar_${cls.name.replace(/\s+/g, "_")}.pdf`, `⚠️ ${cls.name} — Qarzdorlar ro'yxati`);
        await sendLongMessage(text);
        res.json({ success: true, message: "Qarzdorlar ro'yxati yuborildi" });

      } else if (type === "weekly_report" || type === "monthly_report") {
        const isMonthly = type === "monthly_report";
        const periodLabel = isMonthly ? "Oylik" : "Haftalik";

        const lessons = await storage.getLessonsByClass(req.params.id);
        const submissions = await storage.getSubmissionsByClass(req.params.id);
        const lessonTasksData = await storage.getLessonTasksByClass(req.params.id);
        const taskColumnsData = await storage.getTaskColumnsByClass(req.params.id);
        const { members, profileMap } = await getProfileMap(req.params.id);

        const now = new Date();
        const periodStart = new Date(now);
        if (isMonthly) {
          periodStart.setDate(1);
        } else {
          const dayOfWeek = periodStart.getDay();
          periodStart.setDate(periodStart.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        }
        periodStart.setHours(0, 0, 0, 0);

        const periodEnd = new Date(now);
        periodEnd.setHours(23, 59, 59, 999);

        const periodLessons = lessons.filter(l => {
          const d = new Date(l.date);
          return d >= periodStart && d <= periodEnd;
        }).sort((a, b) => a.lessonNo - b.lessonNo);

        const periodLessonIds = new Set(periodLessons.map(l => l.id));
        const periodLessonTasks = lessonTasksData.filter(lt => periodLessonIds.has(lt.lessonId));
        const periodLtIds = new Set(periodLessonTasks.map(lt => lt.id));

        const submissionMap = new Map<string, any>();
        for (const s of submissions) {
          if (periodLtIds.has(s.lessonTaskId)) {
            submissionMap.set(`${s.studentId}_${s.lessonTaskId}`, s);
          }
        }

        const columnMap = new Map(taskColumnsData.map(c => [c.id, c.title]));

        const studentStats = members.map(m => {
          let submitted = 0;
          let missing = 0;
          let totalScore = 0;
          let scoredCount = 0;
          for (const lt of periodLessonTasks) {
            const sub = submissionMap.get(`${m.userId}_${lt.id}`);
            const status = sub?.status || "missing";
            if (status === "submitted") {
              submitted++;
              if (sub?.score != null) {
                totalScore += sub.score;
                scoredCount++;
              }
            } else {
              missing++;
            }
          }
          return {
            name: profileMap.get(m.userId) || "Noma'lum",
            submitted,
            missing,
            total: periodLessonTasks.length,
            avg: scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0,
            pct: periodLessonTasks.length > 0 ? Math.round((submitted / periodLessonTasks.length) * 100) : 0,
          };
        }).sort((a, b) => b.pct - a.pct || b.avg - a.avg);

        const startStr = periodStart.toLocaleDateString("uz-UZ", { day: "numeric", month: "short" });
        const endStr = periodEnd.toLocaleDateString("uz-UZ", { day: "numeric", month: "short", year: "numeric" });

        let text = `📊 *${escMd(cls.name)} — ${periodLabel} hisobot*\n`;
        text += `📅 ${escMd(startStr)} — ${escMd(endStr)}\n`;
        text += `📖 Darslar: ${periodLessons.length} ta | Vazifalar: ${periodLessonTasks.length} ta\n\n`;

        if (studentStats.length === 0) {
          text += `O'quvchilar topilmadi.\n`;
        } else {
          const medals = ["🥇", "🥈", "🥉"];

          text += `*🏆 Reyting:*\n\n`;
          for (let i = 0; i < studentStats.length; i++) {
            const s = studentStats[i];
            const medal = i < 3 ? medals[i] : `${i + 1}.`;
            const bar = s.pct >= 80 ? "🟢" : s.pct >= 50 ? "🟡" : "🔴";
            const avgStr = s.avg > 0 ? ` | ball: ${s.avg}` : "";
            text += `${medal} ${escMd(s.name)}\n`;
            text += `   ${bar} ${s.submitted}/${s.total} (${s.pct}%)${avgStr}\n`;
            if (s.missing > 0) text += `   ❌ Qarzdor: ${s.missing} ta\n`;
            text += `\n`;
          }

          const totalSubmitted = studentStats.reduce((a, b) => a + b.submitted, 0);
          const totalPossible = studentStats.reduce((a, b) => a + b.total, 0);
          const overallPct = totalPossible > 0 ? Math.round((totalSubmitted / totalPossible) * 100) : 0;
          text += `━━━━━━━━━━━━━━━\n`;
          text += `📈 Umumiy bajarilish: ${overallPct}%\n`;
          text += `👥 O'quvchilar: ${members.length} ta\n`;
          const perfect = studentStats.filter(s => s.pct === 100).length;
          if (perfect > 0) text += `⭐ 100% bajargan: ${perfect} ta\n`;
          const zeroStudents = studentStats.filter(s => s.pct === 0).length;
          if (zeroStudents > 0) text += `⚠️ 0% bajargan: ${zeroStudents} ta\n`;
        }

        const periodPdfRows = studentStats.map(s => ({
          name: s.name,
          cells: [
            { text: `${s.submitted}`, color: undefined },
            { text: `${s.missing}`, color: s.missing > 0 ? "#fecaca" : "#dcfce7" },
            { text: `${s.pct}%`, color: s.pct >= 80 ? "#dcfce7" : s.pct >= 50 ? "#fef9c3" : "#fecaca" },
            { text: s.avg > 0 ? `${s.avg}` : "—", color: undefined },
          ],
          summary: `${s.pct}%`,
        }));

        const totalSubmittedPdf = studentStats.reduce((a, b) => a + b.submitted, 0);
        const totalPossiblePdf = studentStats.reduce((a, b) => a + b.total, 0);
        const overallPctPdf = totalPossiblePdf > 0 ? Math.round((totalSubmittedPdf / totalPossiblePdf) * 100) : 0;

        const periodPdf = await generateTrackerPDF({
          title: `${cls.name} — ${periodLabel} hisobot`,
          subtitle: `${startStr} — ${endStr} | Darslar: ${periodLessons.length} ta`,
          columns: ["Bajarildi", "Qarzdor", "Foiz", "O'rtacha ball"],
          rows: periodPdfRows,
          stats: [
            { label: "Umumiy bajarilish", value: `${overallPctPdf}%` },
            { label: "O'quvchilar soni", value: `${members.length}` },
            { label: "Darslar", value: `${periodLessons.length} ta` },
            { label: "Vazifalar", value: `${periodLessonTasks.length} ta` },
          ],
        });

        await sendPdfDocument(periodPdf, `${periodLabel}_hisobot_${cls.name.replace(/\s+/g, "_")}.pdf`, `📊 ${cls.name} — ${periodLabel} hisobot`);
        await sendLongMessage(text);
        res.json({ success: true, message: `${periodLabel} hisobot yuborildi` });
      }
    } catch (error) {
      console.error("Telegram notify error:", error);
      res.status(500).json({ message: "Telegram xabar yuborishda xatolik" });
    }
  });

  // ===================== AI SINF ENDPOINTLARI =====================

  app.post("/api/ai-classes", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const { name, telegramBotToken, instructions, tasks, students } = req.body;
      if (!name) return res.status(400).json({ message: "Sinf nomi kerak" });

      if (telegramBotToken) {
        try {
          const TelegramBot = (await import("node-telegram-bot-api")).default;
          const testBot = new TelegramBot(telegramBotToken);
          await testBot.getMe();
        } catch {
          return res.status(400).json({ message: "Telegram bot token noto'g'ri" });
        }
      }

      const aiClass = await storage.createAiClass({
        name,
        teacherId: req.userId,
        telegramBotToken: telegramBotToken || null,
        instructions: instructions || null,
        status: "active",
      });

      if (tasks && Array.isArray(tasks)) {
        const lessonGroups: Record<number, number> = {};
        for (let i = 0; i < tasks.length; i++) {
          const lessonNum = tasks[i].lessonNumber || 1;
          if (!lessonGroups[lessonNum]) lessonGroups[lessonNum] = 0;
          await storage.createAiTask({
            aiClassId: aiClass.id,
            lessonNumber: lessonNum,
            title: tasks[i].title,
            orderIndex: lessonGroups[lessonNum]++,
            prompt: tasks[i].prompt || null,
            referenceText: tasks[i].referenceText || null,
            type: tasks[i].type || "audio",
          });
        }
      }

      if (students && Array.isArray(students)) {
        for (const s of students) {
          if (s.name && s.phone) {
            await storage.createAiStudent({
              aiClassId: aiClass.id,
              name: s.name,
              phone: s.phone.replace(/\D/g, ""),
              status: "active",
            });
          }
        }
      }

      res.json(aiClass);
    } catch (error) {
      console.error("Create AI class error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/ai-classes", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const classes = await storage.getAiClasses(req.userId);
      const result = await Promise.all(classes.map(async (c) => {
        const students = await storage.getAiStudents(c.id);
        const tasks = await storage.getAiTasks(c.id);
        return { ...c, studentCount: students.length, taskCount: tasks.length };
      }));
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/ai-classes/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const aiClass = await storage.getAiClass(req.params.id);
      if (!aiClass) return res.status(404).json({ message: "AI sinf topilmadi" });
      if (aiClass.teacherId !== req.userId && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const tasks = await storage.getAiTasks(aiClass.id);
      const students = await storage.getAiStudents(aiClass.id);
      const submissions = await storage.getAiSubmissionsByClass(aiClass.id);
      const botActive = activeBots.has(aiClass.id);
      res.json({ ...aiClass, tasks, students, submissions, botActive });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/ai-classes/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const aiClass = await storage.getAiClass(req.params.id);
      if (!aiClass) return res.status(404).json({ message: "AI sinf topilmadi" });
      if (aiClass.teacherId !== req.userId && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const updated = await storage.updateAiClass(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/ai-classes/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const aiClass = await storage.getAiClass(req.params.id);
      if (!aiClass) return res.status(404).json({ message: "AI sinf topilmadi" });
      if (aiClass.teacherId !== req.userId && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      stopAiBot(aiClass.id);
      await storage.deleteAiClass(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/ai-classes/:id/tasks", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const aiClass = await storage.getAiClass(req.params.id);
      if (!aiClass || (aiClass.teacherId !== req.userId && req.userProfile?.role !== "admin")) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { title, prompt, referenceText, type, lessonNumber } = req.body;
      const existingTasks = await storage.getAiTasks(req.params.id);
      const ln = lessonNumber || 1;
      const lessonTasks = existingTasks.filter(t => t.lessonNumber === ln);
      const task = await storage.createAiTask({
        aiClassId: req.params.id,
        lessonNumber: ln,
        title: title || "Vazifa",
        orderIndex: lessonTasks.length,
        prompt: prompt || null,
        referenceText: referenceText || null,
        type: type || "audio",
      });
      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/ai-tasks/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const updated = await storage.updateAiTask(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/ai-tasks/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      await storage.deleteAiTask(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/ai-classes/:id/students", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const aiClass = await storage.getAiClass(req.params.id);
      if (!aiClass || (aiClass.teacherId !== req.userId && req.userProfile?.role !== "admin")) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { name, phone } = req.body;
      if (!name || !phone) return res.status(400).json({ message: "Ism va telefon kerak" });
      const cleanPhone = phone.replace(/\D/g, "");
      const existing = await storage.getAiStudentByPhone(req.params.id, cleanPhone);
      if (existing) return res.status(400).json({ message: "Bu telefon raqam allaqachon qo'shilgan" });
      const student = await storage.createAiStudent({
        aiClassId: req.params.id,
        name,
        phone: cleanPhone,
        status: "active",
      });
      res.json(student);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/ai-classes/:id/students/bulk", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const aiClass = await storage.getAiClass(req.params.id);
      if (!aiClass || (aiClass.teacherId !== req.userId && req.userProfile?.role !== "admin")) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { students } = req.body;
      if (!Array.isArray(students)) return res.status(400).json({ message: "students massiv kerak" });
      const created = [];
      for (const s of students) {
        if (s.name && s.phone) {
          const cleanPhone = s.phone.replace(/\D/g, "");
          const existing = await storage.getAiStudentByPhone(req.params.id, cleanPhone);
          if (!existing) {
            const student = await storage.createAiStudent({
              aiClassId: req.params.id,
              name: s.name,
              phone: cleanPhone,
              status: "active",
            });
            created.push(student);
          }
        }
      }
      res.json({ created: created.length });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/ai-students/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      await storage.deleteAiStudent(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/ai-classes/:id/results", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const aiClass = await storage.getAiClass(req.params.id);
      if (!aiClass || (aiClass.teacherId !== req.userId && req.userProfile?.role !== "admin")) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const students = await storage.getAiStudents(req.params.id);
      const tasks = await storage.getAiTasks(req.params.id);
      const submissions = await storage.getAiSubmissionsByClass(req.params.id);

      const sortedTasks = [...tasks].sort((a, b) => {
        if (a.lessonNumber !== b.lessonNumber) return a.lessonNumber - b.lessonNumber;
        return a.orderIndex - b.orderIndex;
      });

      const lessonNumbers = [...new Set(sortedTasks.map(t => t.lessonNumber))].sort((a, b) => a - b);
      const lessons = lessonNumbers.map(num => ({
        lessonNumber: num,
        tasks: sortedTasks.filter(t => t.lessonNumber === num),
      }));

      const results = students.map(student => {
        const studentSubs = submissions.filter(s => s.aiStudentId === student.id);
        const taskResults = sortedTasks.map(task => {
          const sub = studentSubs.find(s => s.aiTaskId === task.id);
          return {
            taskId: task.id,
            taskTitle: task.title,
            lessonNumber: task.lessonNumber,
            score: sub?.score || null,
            status: sub?.status || "pending",
            transcription: sub?.transcription || null,
            aiResponse: sub?.aiResponse || null,
            submittedAt: sub?.submittedAt || null,
          };
        });

        const lessonScores: Record<number, { total: number; count: number }> = {};
        for (const tr of taskResults) {
          if (tr.score) {
            if (!lessonScores[tr.lessonNumber]) lessonScores[tr.lessonNumber] = { total: 0, count: 0 };
            lessonScores[tr.lessonNumber].total += tr.score;
            lessonScores[tr.lessonNumber].count++;
          }
        }
        const lessonAvgs: Record<number, number> = {};
        for (const [ln, data] of Object.entries(lessonScores)) {
          lessonAvgs[Number(ln)] = Math.round((data.total / data.count) * 10) / 10;
        }

        const scoredTasks = taskResults.filter(t => t.score);
        const avgScore = scoredTasks.length > 0 ? Math.round((scoredTasks.reduce((s, t) => s + (t.score || 0), 0) / scoredTasks.length) * 10) / 10 : 0;

        return { studentId: student.id, studentName: student.name, phone: student.phone, connected: !!student.telegramChatId, taskResults, lessonAvgs, avgScore };
      });
      res.json({ tasks: sortedTasks, lessons, results });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/ai-classes/:id/send-results", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const { chatId, lessonNumber } = req.body;
      if (!chatId) return res.status(400).json({ message: "Chat ID kerak" });

      const aiClass = await storage.getAiClass(req.params.id);
      if (!aiClass || (aiClass.teacherId !== req.userId && req.userProfile?.role !== "admin")) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const profile = await storage.getUserProfile(req.userId);
      if (!profile?.telegramBotToken) {
        return res.status(400).json({ message: "Avval Telegram bot sozlamalarida tokenni saqlang" });
      }

      const students = await storage.getAiStudents(req.params.id);
      const tasks = await storage.getAiTasks(req.params.id);
      const submissions = await storage.getAiSubmissionsByClass(req.params.id);

      const filteredTasks = lessonNumber
        ? tasks.filter(t => t.lessonNumber === lessonNumber).sort((a, b) => a.orderIndex - b.orderIndex)
        : [...tasks].sort((a, b) => { if (a.lessonNumber !== b.lessonNumber) return a.lessonNumber - b.lessonNumber; return a.orderIndex - b.orderIndex; });

      const studentResults = students.map(student => {
        const studentSubs = submissions.filter(s => s.aiStudentId === student.id);
        const scores = filteredTasks.map(task => {
          const sub = studentSubs.find(s => s.aiTaskId === task.id);
          return sub?.score || 0;
        });
        const totalScore = scores.reduce((s, v) => s + v, 0);
        const maxScore = filteredTasks.length * 10;
        const percent = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
        return { name: student.name, scores, totalScore, maxScore, percent };
      }).sort((a, b) => b.totalScore - a.totalScore);

      const title = lessonNumber ? `${aiClass.name} — ${lessonNumber}-dars natijalari` : `${aiClass.name} — barcha natijalar`;
      let message = `📊 <b>${title}</b>\n\n`;

      const top3 = studentResults.slice(0, 3);
      const medals = ["🥇", "🥈", "🥉"];
      top3.forEach((r, i) => {
        const bar = "█".repeat(Math.round(r.percent / 10)) + "░".repeat(10 - Math.round(r.percent / 10));
        message += `${medals[i]} <b>${r.name}</b>\n   ${bar} ${r.totalScore}/${r.maxScore} (${r.percent}%)\n\n`;
      });

      if (studentResults.length > 3) {
        message += `📋 <b>Barcha natijalar:</b>\n`;
        studentResults.forEach((r, i) => {
          message += `${i + 1}. ${r.name} — ${r.totalScore}/${r.maxScore} (${r.percent}%)\n`;
        });
      }

      message += `\n👥 Jami: ${studentResults.length} o'quvchi`;

      const TelegramBot = (await import("node-telegram-bot-api")).default;
      const bot = new TelegramBot(profile.telegramBotToken);
      const targetChat = chatId.startsWith("@") || chatId.startsWith("-") ? chatId : (isNaN(Number(chatId)) ? `@${chatId}` : Number(chatId));

      await bot.sendMessage(targetChat, message, { parse_mode: "HTML" });

      const PDFDocument = (await import("pdfkit")).default;
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));

      const fontPath = path.join(process.cwd(), "server", "fonts");
      const regularFont = path.join(fontPath, "NotoSans-Regular.ttf");
      const boldFont = path.join(fontPath, "NotoSans-Bold.ttf");
      const hasCustomFonts = fs.existsSync(regularFont) && fs.existsSync(boldFont);
      if (hasCustomFonts) {
        doc.registerFont("Regular", regularFont);
        doc.registerFont("Bold", boldFont);
      }
      const fontR = hasCustomFonts ? "Regular" : "Helvetica";
      const fontB = hasCustomFonts ? "Bold" : "Helvetica-Bold";

      doc.font(fontB).fontSize(16).text(title, { align: "center" });
      doc.moveDown(0.5);
      doc.font(fontR).fontSize(9).text(`Sana: ${new Date().toLocaleDateString("uz-UZ")}`, { align: "center" });
      doc.moveDown(1);

      const lessonNums = lessonNumber ? [lessonNumber] : [...new Set(filteredTasks.map(t => t.lessonNumber))].sort((a, b) => a - b);
      const colStart = 40;
      const nameW = 120;
      const scoreW = lessonNums.length > 6 ? 35 : 45;
      const avgW = 45;
      const totalW = nameW + lessonNums.length * scoreW + avgW;
      let y = doc.y;

      doc.font(fontB).fontSize(8);
      doc.rect(colStart, y, totalW, 20).fill("#7c3aed");
      doc.fill("#ffffff").text("O'quvchi", colStart + 4, y + 5, { width: nameW - 8 });
      lessonNums.forEach((ln, i) => {
        doc.text(`${ln}-dars`, colStart + nameW + i * scoreW, y + 5, { width: scoreW, align: "center" });
      });
      doc.text("O'rtacha", colStart + nameW + lessonNums.length * scoreW, y + 5, { width: avgW, align: "center" });
      y += 20;

      doc.fill("#000000");
      studentResults.forEach((r, idx) => {
        if (y > 750) { doc.addPage(); y = 40; }
        const bgColor = idx % 2 === 0 ? "#f5f3ff" : "#ffffff";
        doc.rect(colStart, y, totalW, 18).fill(bgColor);
        doc.fill("#000000").font(fontR).fontSize(8);
        doc.text(`${idx + 1}. ${r.name}`, colStart + 4, y + 4, { width: nameW - 8 });

        lessonNums.forEach((ln, i) => {
          const lessonTasks = filteredTasks.filter(t => t.lessonNumber === ln);
          const lessonScore = lessonTasks.reduce((sum, t) => {
            const tIdx = filteredTasks.indexOf(t);
            return sum + (r.scores[tIdx] || 0);
          }, 0);
          const lessonMax = lessonTasks.length * 10;
          const pct = lessonMax > 0 ? Math.round((lessonScore / lessonMax) * 100) : 0;
          const color = pct >= 70 ? "#16a34a" : pct >= 40 ? "#ca8a04" : "#dc2626";
          doc.fill(color).text(`${lessonScore}/${lessonMax}`, colStart + nameW + i * scoreW, y + 4, { width: scoreW, align: "center" });
        });

        const avgColor = r.percent >= 70 ? "#16a34a" : r.percent >= 40 ? "#ca8a04" : "#dc2626";
        doc.fill(avgColor).font(fontB).text(`${r.percent}%`, colStart + nameW + lessonNums.length * scoreW, y + 4, { width: avgW, align: "center" });
        y += 18;
      });

      await new Promise<void>((resolve) => { doc.on("end", resolve); doc.end(); });
      const pdfBuffer = Buffer.concat(chunks);
      const fileName = lessonNumber ? `${aiClass.name}_${lessonNumber}_dars.pdf` : `${aiClass.name}_natijalar.pdf`;
      await bot.sendDocument(targetChat, pdfBuffer, { caption: `📄 ${title}` }, { filename: fileName, contentType: "application/pdf" });

      res.json({ success: true, message: "Natijalar yuborildi" });
    } catch (error: any) {
      console.error("AI class send results error:", error);
      res.status(500).json({ message: error.message || "Xatolik yuz berdi" });
    }
  });

  // Bot start/stop
  app.post("/api/ai-classes/:id/bot/start", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const aiClass = await storage.getAiClass(req.params.id);
      if (!aiClass || (aiClass.teacherId !== req.userId && req.userProfile?.role !== "admin")) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (!aiClass.telegramBotToken) return res.status(400).json({ message: "Bot token sozlanmagan" });
      await startAiBot(aiClass.id, aiClass.telegramBotToken, storage);
      res.json({ success: true, message: "Bot ishga tushdi" });
    } catch (error: any) {
      console.error("Bot start error:", error);
      res.status(500).json({ message: error.message || "Bot ishga tushmadi" });
    }
  });

  app.post("/api/ai-classes/:id/bot/stop", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      stopAiBot(req.params.id);
      res.json({ success: true, message: "Bot to'xtatildi" });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  setupWebSocket(httpServer);

  return httpServer;
}
