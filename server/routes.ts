import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replit_integrations/auth";
import { registerAuthRoutes } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { setupWebSocket } from "./websocket";
import multer from "multer";
import * as XLSX from "xlsx";

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
      const profiles = await storage.getAllProfiles();
      res.json(profiles);
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
      const question = await storage.createQuestion({
        ...req.body,
        quizId: req.params.quizId,
      });
      res.json(question);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
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

  app.delete("/api/questions/:id", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      await storage.deleteQuestion(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
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
      const joinCode = generateJoinCode();
      const session = await storage.createLiveSession({
        quizId: req.body.quizId,
        hostId: userId,
        joinCode,
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
      const { code, guestName, userId } = req.body;
      const session = await storage.getLiveSessionByCode(code);
      if (!session) return res.status(404).json({ message: "Session not found" });
      if (session.status === "finished") return res.status(400).json({ message: "Session ended" });

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

  app.post("/api/telegram/share", requireAuth, requireRole(["teacher", "admin"]), async (req: any, res) => {
    try {
      const { quizId, chatId } = req.body;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) return res.status(400).json({ message: "Telegram bot not configured" });

      const quiz = await storage.getQuiz(quizId);
      if (!quiz) return res.status(404).json({ message: "Quiz not found" });

      const questionsList = await storage.getQuestionsByQuiz(quizId);

      const TelegramBot = (await import("node-telegram-bot-api")).default;
      const bot = new TelegramBot(botToken);

      for (const q of questionsList) {
        if (q.type === "multiple_choice" && q.options && q.options.length >= 2) {
          const correctIndex = q.options.indexOf(q.correctAnswer);
          await bot.sendPoll(chatId, q.questionText, q.options, {
            type: "quiz",
            correct_option_id: correctIndex >= 0 ? correctIndex : 0,
            is_anonymous: false,
          } as any);
        }
      }

      res.json({ success: true, sent: questionsList.length });
    } catch (error) {
      console.error("Telegram error:", error);
      res.status(500).json({ message: "Failed to send to Telegram" });
    }
  });

  setupWebSocket(httpServer);

  return httpServer;
}
