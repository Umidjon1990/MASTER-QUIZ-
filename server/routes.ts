import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replit_integrations/auth";
import { registerAuthRoutes } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { setupWebSocket, getScheduledQuizRoomCode, isRestorationComplete } from "./websocket";
import multer from "multer";
import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";

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
      const { scheduledAt, requireCode, telegramChatId } = req.body;
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
        isPublic: true,
        status: "published",
      } as any);

      res.json(updated);
    } catch (error) {
      console.error("Schedule error:", error);
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
        });
      }
      let roomCode: string | null = null;
      if (quiz.scheduledStatus === "started") {
        roomCode = memRoomCode || (!isRestorationComplete() ? ((quiz as any).scheduledRoomCode || null) : null);
      }
      res.json({
        scheduledStatus: quiz.scheduledStatus,
        roomCode,
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

      const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);
      const imported: any[] = [];
      let currentQ: any = null;

      for (const line of lines) {
        const qMatch = line.match(/^(\d+[\.\)]\s*|Savol:\s*)(.*)/i);
        const optMatch = line.match(/^([A-Da-d])[\.\)]\s*(.*)/);

        if (qMatch && !optMatch) {
          if (currentQ && currentQ.questionText) {
            const correct = currentQ.options.find((o: string) => o.endsWith(" *"));
            if (correct) {
              currentQ.correctAnswer = correct.replace(/\s*\*$/, "");
              currentQ.options = currentQ.options.map((o: string) => o.replace(/\s*\*$/, ""));
            }
            if (currentQ.correctAnswer) {
              const question = await storage.createQuestion({
                quizId: req.params.quizId,
                orderIndex: startIndex + imported.length,
                type: "multiple_choice",
                questionText: currentQ.questionText,
                options: currentQ.options.filter(Boolean),
                correctAnswer: currentQ.correctAnswer,
                points: 100,
                timeLimit: 30,
              });
              imported.push(question);
            }
          }
          currentQ = { questionText: qMatch[2].trim(), options: [], correctAnswer: "" };
        } else if (optMatch && currentQ) {
          currentQ.options.push(optMatch[2].trim());
        }
      }

      if (currentQ && currentQ.questionText) {
        const correct = currentQ.options.find((o: string) => o.endsWith(" *"));
        if (correct) {
          currentQ.correctAnswer = correct.replace(/\s*\*$/, "");
          currentQ.options = currentQ.options.map((o: string) => o.replace(/\s*\*$/, ""));
        }
        if (currentQ.correctAnswer) {
          const question = await storage.createQuestion({
            quizId: req.params.quizId,
            orderIndex: startIndex + imported.length,
            type: "multiple_choice",
            questionText: currentQ.questionText,
            options: currentQ.options.filter(Boolean),
            correctAnswer: currentQ.correctAnswer,
            points: 100,
            timeLimit: 30,
          });
          imported.push(question);
        }
      }

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
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
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

      await bot.sendMessage(targetChat, `📝 *${quiz.title}*\n${quiz.description || ""}\n\n_${questionsList.length} ta savol_`, { parse_mode: "Markdown" });

      for (let i = 0; i < questionsList.length; i++) {
        const q = questionsList[i];
        if (q.type === "open_ended") {
          
          await bot.sendMessage(targetChat, `<b>${i + 1}. ${escHtml(q.questionText)}</b>\n\n<i>Yozma javob talab qilinadi</i>\nTo'g'ri javob: <tg-spoiler>${escHtml(q.correctAnswer)}</tg-spoiler>`, { parse_mode: "HTML" });
          sent++;
        } else if (q.type === "true_false") {
          const tfOptions = ["To'g'ri", "Noto'g'ri"];
          const correctIndex = q.correctAnswer === "true" ? 0 : 1;
          await bot.sendPoll(targetChat, q.questionText, tfOptions, {
            type: "quiz",
            correct_option_id: correctIndex,
            is_anonymous: true,
          } as any);
          sent++;
        } else if (q.type === "poll" && q.options && q.options.length >= 2) {
          await bot.sendPoll(targetChat, q.questionText, q.options, {
            type: "regular",
            is_anonymous: true,
          } as any);
          sent++;
        } else if (q.type === "multiple_select" && q.options && q.options.length >= 2) {
          await bot.sendPoll(targetChat, q.questionText, q.options, {
            type: "regular",
            allows_multiple_answers: true,
            is_anonymous: true,
          } as any);
          sent++;
        } else if (q.options && q.options.length >= 2) {
          const correctIndex = q.options.indexOf(q.correctAnswer);
          await bot.sendPoll(targetChat, q.questionText, q.options, {
            type: "quiz",
            correct_option_id: correctIndex >= 0 ? correctIndex : 0,
            is_anonymous: true,
          } as any);
          sent++;
        }
        if (i < questionsList.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      res.json({ success: true, sent });
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

      if (results.length === 0) return res.status(400).json({ message: "Natijalar topilmadi" });

      results.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));

      const TelegramBot = (await import("node-telegram-bot-api")).default;
      const bot = new TelegramBot(profile.telegramBotToken);
      const targetChat = chatId.startsWith("@") || chatId.startsWith("-") ? chatId : (isNaN(Number(chatId)) ? `@${chatId}` : Number(chatId));

      const msg = formatTelegramResults(quiz.title, results.map(r => ({
        name: r.guestName || `O'yinchi #${r.participantId.slice(-4)}`,
        score: r.totalScore || 0,
        correctAnswers: r.correctAnswers,
        totalQuestions: r.totalQuestions,
      })), escHtml);

      await bot.sendMessage(targetChat, msg, { parse_mode: "HTML" });

      const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType, TableLayoutType } = await import("docx");

      const hasRtl = (s: string) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s);
      const makeRun = (text: string, bold: boolean, sz: number) => new TextRun({ text, bold, size: sz, font: "Arial", rightToLeft: hasRtl(text) });
      const makePara = (text: string, bold: boolean, sz: number, align?: (typeof AlignmentType)[keyof typeof AlignmentType]) =>
        new Paragraph({ children: [makeRun(text, bold, sz)], alignment: align, bidirectional: hasRtl(text) });

      const colWidths = [900, 4200, 1600, 1800, 1600];

      const headerCells = ["#", "Ism", "Ball", "To'g'ri", "Foiz"].map((text, ci) =>
        new TableCell({
          children: [makePara(text, true, 20)],
          width: { size: colWidths[ci], type: WidthType.DXA },
        })
      );

      const dataRows = results.map((r: any, i: number) => {
        const name = r.guestName || `O'yinchi #${r.participantId.slice(-4)}`;
        const pct = r.totalQuestions > 0 ? Math.round((r.correctAnswers / r.totalQuestions) * 100) : 0;
        const isBold = i < 3;
        const cells = [
          `${i + 1}`,
          name,
          `${r.totalScore}`,
          `${r.correctAnswers}/${r.totalQuestions}`,
          `${pct}%`,
        ].map((text, ci) =>
          new TableCell({
            children: [makePara(text, isBold, 18)],
            width: { size: colWidths[ci], type: WidthType.DXA },
          })
        );
        return new TableRow({ children: cells });
      });

      const titleHasRtl = hasRtl(quiz.title);
      const doc = new Document({
        sections: [{
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 720, right: 720, bottom: 720, left: 720 },
            },
          },
          children: [
            new Paragraph({ children: [makeRun(quiz.title, true, 36)], alignment: AlignmentType.CENTER, spacing: { after: 100 }, bidirectional: titleHasRtl }),
            new Paragraph({ children: [makeRun(`Natijalar — ${new Date().toLocaleDateString("uz-UZ")}`, false, 22)], alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
            new Table({
              rows: [new TableRow({ children: headerCells }), ...dataRows],
              width: { size: 10100, type: WidthType.DXA },
              layout: TableLayoutType.FIXED,
            }),
          ],
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
    isAuto = false
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
        for (let i = questionsList.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [questionsList[i], questionsList[j]] = [questionsList[j], questionsList[i]];
        }
      }

      if (quiz.shuffleOptions) {
        questionsList = questionsList.map(q => {
          if (!q.options || q.options.length < 2) return q;
          const opts = [...q.options];
          for (let i = opts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [opts[i], opts[j]] = [opts[j], opts[i]];
          }
          return { ...q, options: opts };
        });
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
        for (let i = questionsList.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [questionsList[i], questionsList[j]] = [questionsList[j], questionsList[i]];
        }
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
      const cls = await storage.createClass({
        ...req.body,
        teacherId: req.userId,
        joinCode,
      });
      res.json(cls);
    } catch (error) {
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
          return { ...m, displayName: profile?.displayName || "Unknown" };
        })
      );
      res.json(membersWithProfiles);
    } catch (error) {
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
        for (let i = questionsList.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [questionsList[i], questionsList[j]] = [questionsList[j], questionsList[i]];
        }
      }

      if (quiz.shuffleOptions) {
        questionsList = questionsList.map(q => {
          if (!q.options || q.options.length < 2) return q;
          const opts = [...q.options];
          for (let i = opts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [opts[i], opts[j]] = [opts[j], opts[i]];
          }
          return { ...q, options: opts };
        });
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
        quiz: { id: quiz.id, title: quiz.title, description: quiz.description, category: quiz.category, totalQuestions: quiz.totalQuestions },
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

      await storage.incrementQuizPlays(req.params.id);

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

  setupWebSocket(httpServer);

  return httpServer;
}
