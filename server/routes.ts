import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replit_integrations/auth";
import { registerAuthRoutes } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { setupWebSocket } from "./websocket";
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
      res.json(profile);
    } catch (error) {
      console.error("Error getting profile:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/profile", requireAuth, async (req: any, res) => {
    try {
      const userId = req.userId;
      const updated = await storage.updateUserProfile(userId, req.body);
      res.json(updated);
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
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
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
      if (!questionText || !correctAnswer) {
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
      const questionOptions = type === "multiple_choice" ? options
        : type === "true_false" ? ["To'g'ri", "Noto'g'ri"]
        : null;
      const question = await storage.createQuestion({
        quizId: req.params.quizId,
        questionText,
        options: questionOptions,
        correctAnswer,
        type,
        points: points || 100,
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
      const { quizId, botToken, chatId } = req.body;
      if (!botToken || !chatId) {
        return res.status(400).json({ message: "Telegram bot token va chat ID kerak" });
      }

      const quiz = await storage.getQuiz(quizId);
      if (!quiz) return res.status(404).json({ message: "Quiz topilmadi" });
      if (quiz.creatorId !== req.userId && req.userProfile?.role !== "admin") {
        return res.status(403).json({ message: "Bu quiz sizga tegishli emas" });
      }

      const questionsList = await storage.getQuestionsByQuiz(quizId);
      if (questionsList.length === 0) return res.status(400).json({ message: "Quizda savollar yo'q. Avval savollar qo'shing" });

      const TelegramBot = (await import("node-telegram-bot-api")).default;
      const bot = new TelegramBot(botToken);

      let sent = 0;
      const targetChat = chatId.startsWith("@") || chatId.startsWith("-") ? chatId : (isNaN(Number(chatId)) ? `@${chatId}` : Number(chatId));

      await bot.sendMessage(targetChat, `📝 *${quiz.title}*\n${quiz.description || ""}\n\n_${questionsList.length} ta savol_`, { parse_mode: "Markdown" });

      for (let i = 0; i < questionsList.length; i++) {
        const q = questionsList[i];
        if (q.type === "open_ended") {
          const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

  setupWebSocket(httpServer);

  return httpServer;
}
