import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";

let io: SocketServer;
const questionAnswerCounts = new Map<string, number>();
const questionStartTimes = new Map<string, { startedAt: number; timeLimit: number }>();

export function getIO() {
  return io;
}

interface PublicRoomPlayer {
  socketId: string;
  name: string;
  score: number;
  correctAnswers: number;
  totalAnswered: number;
  playerId: string;
}

interface PublicRoom {
  id: string;
  quizId: string;
  code: string;
  hostSocketId: string;
  hostPlayerId: string;
  status: "waiting" | "playing" | "finished";
  players: Map<string, PublicRoomPlayer>;
  questions: any[];
  quiz: any;
  currentQuestionIndex: number;
  questionTimer: ReturnType<typeof setTimeout> | null;
  questionStartTime: number;
  currentEffectiveTimeLimit: number;
  answeredThisQuestion: Set<string>;
}

const publicRooms = new Map<string, PublicRoom>();
const codeToRoomId = new Map<string, string>();

const scheduledLobbies = new Map<string, { players: Map<string, { socketId: string; name: string }> }>();

interface LiveSessionTimer {
  sessionId: string;
  questionTimer: ReturnType<typeof setTimeout> | null;
  leaderboardTimer: ReturnType<typeof setTimeout> | null;
  autoAdvance: boolean;
  questionStartTime: number;
  effectiveTimeLimit: number;
}

const liveSessionTimers = new Map<string, LiveSessionTimer>();

function clearLiveSessionTimers(sessionId: string) {
  const st = liveSessionTimers.get(sessionId);
  if (st) {
    if (st.questionTimer) clearTimeout(st.questionTimer);
    if (st.leaderboardTimer) clearTimeout(st.leaderboardTimer);
  }
}

function cleanupLiveSessionTimer(sessionId: string) {
  clearLiveSessionTimers(sessionId);
  liveSessionTimers.delete(sessionId);
  for (const key of Array.from(questionAnswerCounts.keys())) {
    if (key.startsWith(`${sessionId}:`)) questionAnswerCounts.delete(key);
  }
  for (const key of Array.from(questionStartTimes.keys())) {
    if (key.startsWith(`${sessionId}:`)) questionStartTimes.delete(key);
  }
}

async function serverShowLeaderboard(sessionId: string) {
  if (!io) return;
  try {
    const participants = await storage.getSessionParticipants(sessionId);
    io.to(`session:${sessionId}`).emit("leaderboard:show", {
      leaderboard: participants.map((p, i) => ({
        rank: i + 1,
        name: p.guestName || "Player",
        score: p.score,
        correctAnswers: p.correctAnswers,
        participantId: p.id,
      })),
    });

    const st = liveSessionTimers.get(sessionId);
    if (st?.autoAdvance) {
      if (st.leaderboardTimer) clearTimeout(st.leaderboardTimer);
      st.leaderboardTimer = setTimeout(() => {
        serverNextQuestion(sessionId);
      }, 2000);
    }
  } catch (err) {
    console.error("Server show leaderboard error:", err);
  }
}

async function serverNextQuestion(sessionId: string) {
  if (!io) return;
  try {
    const session = await storage.getLiveSession(sessionId);
    if (!session || session.status === "finished") return;

    const questionsList = await storage.getQuestionsByQuiz(session.quizId);
    const quiz = await storage.getQuiz(session.quizId);
    const nextIndex = session.currentQuestionIndex + 1;

    if (nextIndex >= questionsList.length) {
      await storage.updateLiveSession(sessionId, {
        status: "finished",
        endedAt: new Date(),
      } as any);

      const participants = await storage.getSessionParticipants(sessionId);
      for (let i = 0; i < participants.length; i++) {
        const p = participants[i];
        await storage.saveQuizResult({
          sessionId,
          quizId: session.quizId,
          participantId: p.id,
          userId: p.userId,
          guestName: p.guestName,
          totalScore: p.score,
          correctAnswers: p.correctAnswers,
          totalQuestions: questionsList.length,
          rank: i + 1,
        });
      }

      io.to(`session:${sessionId}`).emit("quiz:finished", {
        leaderboard: participants.map((p, i) => ({
          rank: i + 1,
          name: p.guestName || "Player",
          score: p.score,
          correctAnswers: p.correctAnswers,
          participantId: p.id,
        })),
      });

      cleanupLiveSessionTimer(sessionId);
      return;
    }

    await storage.updateLiveSession(sessionId, {
      currentQuestionIndex: nextIndex,
    } as any);

    const q = questionsList[nextIndex];
    let questionOptions = q.options ? [...(q.options as string[])] : null;
    if (quiz?.shuffleOptions && questionOptions) {
      for (let i = questionOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questionOptions[i], questionOptions[j]] = [questionOptions[j], questionOptions[i]];
      }
    }

    const timerEnabled = quiz?.timerEnabled ?? true;
    const effectiveTimeLimit = timerEnabled ? (q.timeLimit || quiz?.timePerQuestion || 30) : 0;

    const qKey = `${sessionId}:${q.id}`;
    questionAnswerCounts.set(qKey, 0);
    questionStartTimes.set(qKey, { startedAt: Date.now(), timeLimit: effectiveTimeLimit });

    io.to(`session:${sessionId}`).emit("question:show", {
      index: nextIndex,
      total: questionsList.length,
      timerEnabled,
      question: {
        id: q.id,
        type: q.type,
        questionText: q.questionText,
        mediaType: q.mediaType,
        mediaUrl: q.mediaUrl,
        options: questionOptions,
        timeLimit: effectiveTimeLimit,
        points: q.type === "poll" ? 0 : q.points,
      },
    });

    startServerQuestionTimer(sessionId, effectiveTimeLimit);
  } catch (err) {
    console.error("Server next question error:", err);
  }
}

function startServerQuestionTimer(sessionId: string, timeLimit: number) {
  let st = liveSessionTimers.get(sessionId);
  if (!st) {
    st = {
      sessionId,
      questionTimer: null,
      leaderboardTimer: null,
      autoAdvance: true,
      questionStartTime: Date.now(),
      effectiveTimeLimit: timeLimit,
    };
    liveSessionTimers.set(sessionId, st);
  } else {
    if (st.questionTimer) clearTimeout(st.questionTimer);
    if (st.leaderboardTimer) clearTimeout(st.leaderboardTimer);
    st.questionStartTime = Date.now();
    st.effectiveTimeLimit = timeLimit;
  }

  if (timeLimit > 0) {
    st.questionTimer = setTimeout(() => {
      serverShowLeaderboard(sessionId);
    }, (timeLimit + 1) * 1000);
  }
}

function generateRoomCode(): string {
  let code: string;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (codeToRoomId.has(code));
  return code;
}

function cleanupRoom(roomId: string) {
  const room = publicRooms.get(roomId);
  if (room) {
    if (room.questionTimer) clearTimeout(room.questionTimer);
    codeToRoomId.delete(room.code);
    publicRooms.delete(roomId);
  }
}

function sendPublicQuestion(roomId: string) {
  const room = publicRooms.get(roomId);
  if (!room || !io) return;

  const q = room.questions[room.currentQuestionIndex];
  if (!q) return;

  room.answeredThisQuestion = new Set();

  let questionOptions = q.options ? [...(q.options as string[])] : null;
  if (room.quiz.shuffleOptions && questionOptions) {
    for (let i = questionOptions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questionOptions[i], questionOptions[j]] = [questionOptions[j], questionOptions[i]];
    }
  }

  const timeLimit = q.timeLimit || room.quiz.timePerQuestion || 30;
  room.currentEffectiveTimeLimit = timeLimit;
  room.questionStartTime = Date.now();

  io.to(`pubroom:${roomId}`).emit("public:question", {
    index: room.currentQuestionIndex,
    total: room.questions.length,
    question: {
      id: q.id,
      type: q.type,
      questionText: q.questionText,
      mediaType: q.mediaType,
      mediaUrl: q.mediaUrl,
      options: questionOptions,
      timeLimit,
      points: q.type === "poll" ? 0 : q.points,
    },
  });

  room.questionTimer = setTimeout(() => {
    showPublicLeaderboard(roomId);
  }, (timeLimit + 1) * 1000);
}

function showPublicLeaderboard(roomId: string) {
  const room = publicRooms.get(roomId);
  if (!room || !io) return;

  const q = room.questions[room.currentQuestionIndex];
  const leaderboard = Array.from(room.players.values())
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({
      rank: i + 1,
      name: p.name,
      score: p.score,
      correctAnswers: p.correctAnswers,
      playerId: p.playerId,
    }));

  const isLast = room.currentQuestionIndex >= room.questions.length - 1;

  io.to(`pubroom:${roomId}`).emit("public:leaderboard", {
    leaderboard,
    correctAnswer: q?.correctAnswer || "",
    questionIndex: room.currentQuestionIndex,
    isLast,
  });

  if (room.hostSocketId === "scheduler") {
    room.questionTimer = setTimeout(() => {
      room.currentQuestionIndex++;
      if (room.currentQuestionIndex >= room.questions.length) {
        finishPublicGame(roomId);
      } else {
        sendPublicQuestion(roomId);
      }
    }, 2000);
  }
}

function finishPublicGame(roomId: string) {
  const room = publicRooms.get(roomId);
  if (!room || !io) return;

  room.status = "finished";
  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
    room.questionTimer = null;
  }

  const leaderboard = Array.from(room.players.values())
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({
      rank: i + 1,
      name: p.name,
      score: p.score,
      correctAnswers: p.correctAnswers,
      totalAnswered: p.totalAnswered,
      playerId: p.playerId,
    }));

  const totalQuestions = room.questions.length;
  const maxScore = room.questions.reduce((sum: number, q: any) => sum + (q.type === "poll" ? 0 : (q.points || 100)), 0);

  io.to(`pubroom:${roomId}`).emit("public:game-finished", {
    leaderboard,
    totalQuestions,
    maxScore,
    quizTitle: room.quiz.title,
  });

  if (room.hostSocketId === "scheduler" && room.quiz.scheduledTelegramChatId) {
    autoSendResultsToTelegram(room.quiz, leaderboard, totalQuestions).catch((err) => {
      console.error("Auto-send Telegram results error:", err?.message || err);
    });
  }

  setTimeout(() => cleanupRoom(roomId), 5 * 60 * 1000);
}

function formatTelegramResultsWs(
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
  msg += `Jami ishtirokchilar: <b>${players.length}</b>\n`;
  msg += `${new Date().toLocaleDateString("uz-UZ", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" })}`;

  return msg;
}

async function autoSendResultsToTelegram(
  quiz: any,
  leaderboard: Array<{ rank: number; name: string; score: number; correctAnswers: number; totalAnswered: number; playerId: string }>,
  totalQuestions: number
) {
  const chatId = quiz.scheduledTelegramChatId;
  if (!chatId) return;
  if (leaderboard.length === 0) {
    console.log("Auto-send: No participants, skipping Telegram results for", quiz.title);
    return;
  }

  const profile = await storage.getUserProfile(quiz.creatorId);
  if (!profile?.telegramBotToken) {
    console.log("Auto-send: No Telegram bot token for quiz creator", quiz.creatorId);
    return;
  }

  const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const TelegramBot = (await import("node-telegram-bot-api")).default;
  const bot = new TelegramBot(profile.telegramBotToken);
  const targetChat = chatId.startsWith("@") || chatId.startsWith("-") ? chatId : (isNaN(Number(chatId)) ? `@${chatId}` : Number(chatId));

  const msg = formatTelegramResultsWs(quiz.title, leaderboard.map(r => ({
    name: r.name,
    score: r.score,
    correctAnswers: r.correctAnswers,
    totalQuestions,
  })), escHtml, true);

  await bot.sendMessage(targetChat, msg, { parse_mode: "HTML" });

  const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType } = await import("docx");

  const hasRtl = (s: string) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s);
  const makeRun = (text: string, bold: boolean, sz: number) => new TextRun({ text, bold, size: sz, font: "Arial", rightToLeft: hasRtl(text) });
  const makePara = (text: string, bold: boolean, sz: number, align?: (typeof AlignmentType)[keyof typeof AlignmentType]) =>
    new Paragraph({ children: [makeRun(text, bold, sz)], alignment: align, bidirectional: hasRtl(text) });

  const headerCells = ["#", "Ism", "Ball", "To'g'ri", "Foiz"].map(text =>
    new TableCell({
      children: [makePara(text, true, 20)],
      width: { size: text === "Ism" ? 40 : 15, type: WidthType.PERCENTAGE },
    })
  );

  const dataRows = leaderboard.map((r, i) => {
    const pct = totalQuestions > 0 ? Math.round((r.correctAnswers / totalQuestions) * 100) : 0;
    const isBold = i < 3;
    const cells = [
      `${i + 1}`,
      r.name,
      `${r.score}`,
      `${r.correctAnswers}/${totalQuestions}`,
      `${pct}%`,
    ].map((text, ci) =>
      new TableCell({
        children: [makePara(text, isBold, 18)],
        width: { size: ci === 1 ? 40 : 15, type: WidthType.PERCENTAGE },
      })
    );
    return new TableRow({ children: cells });
  });

  const titleHasRtl = hasRtl(quiz.title);
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [makeRun(quiz.title, true, 36)], alignment: AlignmentType.CENTER, spacing: { after: 100 }, bidirectional: titleHasRtl }),
        new Paragraph({ children: [makeRun(`Natijalar — ${new Date().toLocaleDateString("uz-UZ")}`, false, 22)], alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
        new Table({
          rows: [new TableRow({ children: headerCells }), ...dataRows],
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
      ],
    }],
  });

  const docxBuffer = await Packer.toBuffer(doc);

  await bot.sendDocument(targetChat, Buffer.from(docxBuffer), {
    caption: `${quiz.title} — barcha natijalar (avtomatik)`,
  }, {
    filename: `${quiz.title.replace(/[^a-zA-Z0-9\u0400-\u04FF]/g, "_")}_natijalar.docx`,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  console.log(`Auto-sent results to Telegram chat ${chatId} for quiz "${quiz.title}"`);
}

async function checkScheduledQuizzes() {
  if (!io) return;
  try {
    const pendingQuizzes = await storage.getScheduledPendingQuizzes();
    for (const quiz of pendingQuizzes) {
      console.log(`Starting scheduled quiz: ${quiz.title} (${quiz.id})`);

      const questions = await storage.getQuestionsByQuiz(quiz.id);
      if (questions.length === 0) {
        await storage.updateQuiz(quiz.id, { scheduledStatus: "cancelled" } as any);
        continue;
      }

      const roomId = `pr_sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const roomCode = generateRoomCode();

      const room: PublicRoom = {
        id: roomId,
        quizId: quiz.id,
        code: roomCode,
        hostSocketId: "scheduler",
        hostPlayerId: "scheduler",
        status: "waiting",
        players: new Map(),
        questions,
        quiz,
        currentQuestionIndex: -1,
        questionTimer: null,
        questionStartTime: 0,
        currentEffectiveTimeLimit: 30,
        answeredThisQuestion: new Set(),
      };

      publicRooms.set(roomId, room);
      codeToRoomId.set(roomCode, roomId);

      io.to(`scheduled:${quiz.scheduledCode}`).emit("scheduled:game-starting", { roomCode });

      const lobby = scheduledLobbies.get(quiz.scheduledCode || "");
      if (lobby) {
        scheduledLobbies.delete(quiz.scheduledCode || "");
      }

      await storage.updateQuiz(quiz.id, { scheduledStatus: "started" } as any);

      setTimeout(() => {
        room.status = "playing";
        room.currentQuestionIndex = 0;

        if (quiz.shuffleQuestions) {
          for (let i = room.questions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [room.questions[i], room.questions[j]] = [room.questions[j], room.questions[i]];
          }
        }

        io.to(`pubroom:${roomId}`).emit("public:game-started", {
          totalQuestions: room.questions.length,
        });

        sendPublicQuestion(roomId);
      }, 5000);
    }
  } catch (err) {
    console.error("Scheduler error:", err);
  }
}

export function setupWebSocket(httpServer: HttpServer) {
  io = new SocketServer(httpServer, {
    cors: { origin: "*" },
    path: "/socket.io",
  });

  setInterval(checkScheduledQuizzes, 3000);

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("host:create-session", async (data, callback) => {
      try {
        const { sessionId } = data;
        socket.join(`session:${sessionId}`);
        socket.data.role = "host";
        socket.data.sessionId = sessionId;
        callback?.({ success: true });
      } catch (err) {
        callback?.({ success: false, error: "Failed to create session" });
      }
    });

    socket.on("player:join", async (data, callback) => {
      try {
        const { sessionId, participantId, name } = data;
        socket.join(`session:${sessionId}`);
        socket.data.role = "player";
        socket.data.sessionId = sessionId;
        socket.data.participantId = participantId;

        io.to(`session:${sessionId}`).emit("player:joined", {
          participantId,
          name,
          count: io.sockets.adapter.rooms.get(`session:${sessionId}`)?.size || 0,
        });

        callback?.({ success: true });
      } catch (err) {
        callback?.({ success: false, error: "Failed to join" });
      }
    });

    socket.on("player:rejoin", async (data, callback) => {
      try {
        const { sessionId, participantId, name } = data;
        const session = await storage.getLiveSession(sessionId);
        if (!session) return callback?.({ success: false, error: "Sessiya topilmadi" });

        const participants = await storage.getSessionParticipants(sessionId);
        const participant = participants.find(p => p.id === participantId);
        if (!participant) return callback?.({ success: false, error: "Ishtirokchi topilmadi" });

        socket.join(`session:${sessionId}`);
        socket.data.role = "player";
        socket.data.sessionId = sessionId;
        socket.data.participantId = participantId;

        if (session.status === "active") {
          const questionsList = await storage.getQuestionsByQuiz(session.quizId);
          const quiz = await storage.getQuiz(session.quizId);
          const currentIdx = session.currentQuestionIndex;

          if (currentIdx < questionsList.length) {
            const q = questionsList[currentIdx];
            const timerEnabled = quiz?.timerEnabled ?? true;
            const st = liveSessionTimers.get(sessionId);
            let remainingTime = 0;
            if (timerEnabled && st && st.effectiveTimeLimit > 0) {
              const elapsed = Math.floor((Date.now() - st.questionStartTime) / 1000);
              remainingTime = Math.max(0, st.effectiveTimeLimit - elapsed);
            }

            socket.emit("question:show", {
              index: currentIdx,
              total: questionsList.length,
              question: {
                id: q.id,
                text: q.questionText,
                type: q.type,
                options: q.options,
                mediaUrl: q.mediaUrl,
                mediaType: q.mediaType,
                timeLimit: remainingTime > 0 ? remainingTime : (q.timeLimit || quiz?.timePerQuestion || 30),
                points: q.points,
              },
              timerEnabled,
            });
          }
        }

        callback?.({ success: true, status: session.status });
      } catch (err) {
        callback?.({ success: false, error: "Qayta ulanishda xatolik" });
      }
    });

    socket.on("host:start-quiz", async (data, callback) => {
      try {
        const { sessionId } = data;
        const session = await storage.getLiveSession(sessionId);
        if (!session) {
          callback?.({ success: false, error: "Sessiya topilmadi" });
          return;
        }

        const questionsList = await storage.getQuestionsByQuiz(session.quizId);
        if (questionsList.length === 0) {
          callback?.({ success: false, error: "Quizda savollar yo'q. Avval savollar qo'shing" });
          return;
        }

        const quiz = await storage.getQuiz(session.quizId);

        await storage.updateLiveSession(sessionId, {
          status: "active",
          startedAt: new Date(),
          currentQuestionIndex: 0,
        } as any);

        await storage.incrementQuizPlays(session.quizId);

        const q = questionsList[0];
        let questionOptions = q.options ? [...(q.options as string[])] : null;
        if (quiz?.shuffleOptions && questionOptions) {
          for (let i = questionOptions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [questionOptions[i], questionOptions[j]] = [questionOptions[j], questionOptions[i]];
          }
        }

        const timerEnabled = quiz?.timerEnabled ?? true;
        const effectiveTimeLimit = timerEnabled ? (q.timeLimit || quiz?.timePerQuestion || 30) : 0;

        liveSessionTimers.set(sessionId, {
          sessionId,
          questionTimer: null,
          leaderboardTimer: null,
          autoAdvance: true,
          questionStartTime: Date.now(),
          effectiveTimeLimit,
        });

        const qKey = `${sessionId}:${q.id}`;
        questionAnswerCounts.set(qKey, 0);
        questionStartTimes.set(qKey, { startedAt: Date.now(), timeLimit: effectiveTimeLimit });

        io.to(`session:${sessionId}`).emit("quiz:started", {
          totalQuestions: questionsList.length,
          timerEnabled,
        });

        io.to(`session:${sessionId}`).emit("question:show", {
          index: 0,
          total: questionsList.length,
          timerEnabled,
          question: {
            id: q.id,
            type: q.type,
            questionText: q.questionText,
            mediaType: q.mediaType,
            mediaUrl: q.mediaUrl,
            options: questionOptions,
            timeLimit: effectiveTimeLimit,
            points: q.type === "poll" ? 0 : q.points,
          },
        });

        startServerQuestionTimer(sessionId, effectiveTimeLimit);
      } catch (err) {
        console.error("Start quiz error:", err);
      }
    });

    socket.on("host:next-question", async (data) => {
      try {
        const { sessionId } = data;
        clearLiveSessionTimers(sessionId);
        await serverNextQuestion(sessionId);
      } catch (err) {
        console.error("Next question error:", err);
      }
    });

    socket.on("host:show-leaderboard", async (data) => {
      try {
        const { sessionId } = data;
        clearLiveSessionTimers(sessionId);
        await serverShowLeaderboard(sessionId);
      } catch (err) {
        console.error("Leaderboard error:", err);
      }
    });

    socket.on("host:set-auto-advance", (data) => {
      const { sessionId, autoAdvance } = data;
      const st = liveSessionTimers.get(sessionId);
      if (st) {
        st.autoAdvance = autoAdvance;
        if (!autoAdvance) {
          if (st.leaderboardTimer) {
            clearTimeout(st.leaderboardTimer);
            st.leaderboardTimer = null;
          }
        }
      }
    });

    socket.on("host:rejoin-session", async (data, callback) => {
      try {
        const { sessionId } = data;
        const session = await storage.getLiveSession(sessionId);
        if (!session) return callback?.({ success: false, error: "Sessiya topilmadi" });

        socket.join(`session:${sessionId}`);
        socket.data.role = "host";
        socket.data.sessionId = sessionId;

        const participants = await storage.getSessionParticipants(sessionId);
        const questionsList = await storage.getQuestionsByQuiz(session.quizId);
        const quiz = await storage.getQuiz(session.quizId);

        callback?.({
          success: true,
          session,
          participants: participants.map((p, i) => ({ id: p.id, name: p.guestName || "Player", score: p.score })),
          status: session.status,
          currentQuestionIndex: session.currentQuestionIndex,
          totalQuestions: questionsList.length,
          quizTitle: quiz?.title,
        });
      } catch (err) {
        callback?.({ success: false, error: "Qayta ulanishda xatolik" });
      }
    });

    socket.on("player:answer", async (data) => {
      try {
        const { sessionId, participantId, questionId, answer, timeSpent } = data;
        const question = await storage.getQuestion(questionId);
        if (!question) return;
        const session = await storage.getLiveSession(sessionId);
        const quiz = session ? await storage.getQuiz(session.quizId) : null;

        let isCorrect = false;
        let points = 0;

        if (question.type === "poll") {
          isCorrect = true;
          points = 0;
        } else if (question.type === "multiple_select") {
          const correctArr = question.correctAnswer.split(",").map(s => s.trim().toLowerCase());
          const correctSet = new Set(correctArr);
          const answerArr = Array.from(new Set(String(answer).split(",").map(s => s.trim().toLowerCase())));
          const correctCount = answerArr.filter(a => correctSet.has(a)).length;
          const wrongCount = answerArr.filter(a => !correctSet.has(a)).length;
          const totalCorrect = correctSet.size;
          if (wrongCount === 0 && correctCount > 0) {
            const ratio = correctCount / totalCorrect;
            const timeBonus = Math.max(0, question.timeLimit - timeSpent);
            points = Math.floor((question.points + Math.floor(timeBonus * 2)) * ratio);
            isCorrect = correctCount === totalCorrect;
          }
        } else {
          isCorrect = question.correctAnswer.toLowerCase().trim() === String(answer).toLowerCase().trim();
          const timeBonus = Math.max(0, question.timeLimit - timeSpent);
          points = isCorrect ? question.points + Math.floor(timeBonus * 2) : 0;
        }

        await storage.saveAnswer({
          sessionId,
          participantId,
          questionId,
          answer: String(answer),
          isCorrect,
          points,
          timeSpent,
        });

        if (points > 0 || question.type === "poll") {
          const participant = await storage.getParticipant(participantId);
          if (participant) {
            await storage.updateParticipant(participantId, {
              score: participant.score + points,
              correctAnswers: participant.correctAnswers + (isCorrect ? 1 : 0),
              totalAnswered: participant.totalAnswered + 1,
            } as any);
          }
        } else {
          const participant = await storage.getParticipant(participantId);
          if (participant) {
            await storage.updateParticipant(participantId, {
              totalAnswered: participant.totalAnswered + 1,
            } as any);
          }
        }

        const allParticipants = await storage.getSessionParticipants(sessionId);
        const myRank = allParticipants.findIndex(p => p.id === participantId) + 1;
        const myUpdated = allParticipants.find(p => p.id === participantId);
        const totalScore = myUpdated?.score ?? 0;
        const totalPlayers = allParticipants.length;

        const qKey = `${sessionId}:${questionId}`;
        const currentCount = (questionAnswerCounts.get(qKey) || 0) + 1;
        questionAnswerCounts.set(qKey, currentCount);

        let remainingTime = 0;
        const qTime = questionStartTimes.get(qKey);
        if (qTime && qTime.timeLimit > 0) {
          const elapsed = Math.floor((Date.now() - qTime.startedAt) / 1000);
          remainingTime = Math.max(0, qTime.timeLimit - elapsed);
        }

        const showCorrect = quiz?.showCorrectAnswers !== false;
        socket.emit("answer:result", { isCorrect, points, correctAnswer: showCorrect ? question.correctAnswer : undefined, rank: myRank, totalScore, totalPlayers, answerOrder: currentCount, remainingTime, showCorrectAnswers: showCorrect });

        io.to(`session:${sessionId}`).emit("answer:received", {
          participantId,
          questionId,
        });
      } catch (err) {
        console.error("Answer error:", err);
      }
    });

    socket.on("lesson:debug-log", (data: { msg: string }) => {
      console.log(`[MEDIA-DEBUG] ${data.msg}`);
    });

    socket.on("lesson:host-join", async (data, callback) => {
      try {
        const { lessonId } = data;
        const lesson = await storage.getLiveLesson(lessonId);
        if (!lesson) return callback?.({ success: false, error: "Lesson not found" });
        socket.join(`lesson:${lessonId}`);
        socket.data.lessonRole = "host";
        socket.data.lessonId = lessonId;
        callback?.({ success: true });
      } catch (err) {
        callback?.({ success: false, error: "Failed to join lesson" });
      }
    });

    socket.on("lesson:student-join", async (data, callback) => {
      try {
        const { lessonId, name } = data;
        const lesson = await storage.getLiveLesson(lessonId);
        if (!lesson) return callback?.({ success: false, error: "Lesson not found" });
        if (lesson.status === "ended") return callback?.({ success: false, error: "Lesson ended" });
        socket.join(`lesson:${lessonId}`);
        socket.data.lessonRole = "student";
        socket.data.lessonId = lessonId;
        socket.data.studentName = name || "O'quvchi";

        const room = io.sockets.adapter.rooms.get(`lesson:${lessonId}`);
        const count = room ? room.size : 0;

        io.to(`lesson:${lessonId}`).emit("lesson:participant-count", { count });
        io.to(`lesson:${lessonId}`).emit("lesson:student-joined", {
          name: socket.data.studentName,
          socketId: socket.id,
          count,
        });

        let currentMode = "pdf";
        let hostCurrentPage = lesson.currentPage || 1;
        let hostZoomLevel = 0;
        let hostIsScreenSharing = false;
        const roomSockets = await io.in(`lesson:${lessonId}`).fetchSockets();
        let hostPipState: any = null;
        for (const s of roomSockets) {
          if (s.data.lessonRole === "host") {
            if (s.data.lessonMode) currentMode = s.data.lessonMode;
            if (s.data.currentPage) hostCurrentPage = s.data.currentPage;
            if (s.data.zoomLevel !== undefined) hostZoomLevel = s.data.zoomLevel;
            if (s.data.isScreenSharing) hostIsScreenSharing = true;
            if (s.data.viewport) (socket.data as any).hostViewport = s.data.viewport;
            if (s.data.pipState) hostPipState = s.data.pipState;
            break;
          }
        }

        const hostViewport = (socket.data as any).hostViewport || null;
        callback?.({
          success: true,
          mode: currentMode,
          currentPage: hostCurrentPage,
          zoomLevel: hostZoomLevel,
          viewport: hostViewport,
          isScreenSharing: hostIsScreenSharing,
          pipState: hostPipState,
        });
      } catch (err) {
        callback?.({ success: false, error: "Failed to join lesson" });
      }
    });

    socket.on("lesson:change-page", async (data) => {
      if (socket.data.lessonRole !== "host") return;
      const { lessonId, page } = data;
      socket.data.currentPage = page;
      socket.to(`lesson:${lessonId}`).emit("lesson:page-changed", { page });
      try { await storage.updateLiveLesson(lessonId, { currentPage: page }); } catch {}
    });

    socket.on("lesson:pointer-move", (data) => {
      if (socket.data.lessonRole !== "host") return;
      const { lessonId, x, y, visible } = data;
      socket.to(`lesson:${lessonId}`).emit("lesson:pointer-update", { x, y, visible });
    });

    socket.on("lesson:zoom-change", (data) => {
      if (socket.data.lessonRole !== "host") return;
      const { lessonId, zoomLevel, viewport } = data;
      socket.data.zoomLevel = zoomLevel;
      if (viewport) socket.data.viewport = viewport;
      socket.to(`lesson:${lessonId}`).emit("lesson:zoom-changed", { zoomLevel, viewport });
    });

    socket.on("lesson:pip-change", (data) => {
      if (socket.data.lessonRole !== "host") return;
      const { lessonId, posRatioX, posRatioY, sizeRatio, shape } = data;
      socket.data.pipState = { posRatioX, posRatioY, sizeRatio, shape };
      socket.to(`lesson:${lessonId}`).emit("lesson:pip-changed", { posRatioX, posRatioY, sizeRatio, shape });
    });

    socket.on("lesson:mode-change", (data) => {
      if (socket.data.lessonRole !== "host") return;
      const { lessonId, mode } = data;
      socket.data.lessonMode = mode;
      socket.to(`lesson:${lessonId}`).emit("lesson:mode-changed", { mode });
    });

    socket.on("lesson:screen-sharing-status", (data) => {
      if (socket.data.lessonRole !== "host") return;
      socket.data.isScreenSharing = data.isScreenSharing;
    });

    socket.on("lesson:screen-offer", (data) => {
      if (socket.data.lessonRole !== "host") return;
      const { lessonId, offer, targetSocketId } = data;
      if (targetSocketId) {
        io.to(targetSocketId).emit("lesson:screen-offer", { offer, senderSocketId: socket.id });
      } else {
        socket.to(`lesson:${lessonId}`).emit("lesson:screen-offer", { offer, senderSocketId: socket.id });
      }
    });

    socket.on("lesson:screen-answer", (data) => {
      const { answer, targetSocketId } = data;
      io.to(targetSocketId).emit("lesson:screen-answer", { answer, senderSocketId: socket.id });
    });

    socket.on("lesson:screen-ice-candidate", (data) => {
      const { candidate, targetSocketId, lessonId } = data;
      if (targetSocketId) {
        io.to(targetSocketId).emit("lesson:screen-ice-candidate", { candidate, senderSocketId: socket.id });
      } else {
        socket.to(`lesson:${lessonId}`).emit("lesson:screen-ice-candidate", { candidate, senderSocketId: socket.id });
      }
    });

    socket.on("lesson:request-screen-stream", (data) => {
      if (socket.data.lessonRole !== "student") return;
      const { lessonId, deviceType } = data;
      socket.to(`lesson:${lessonId}`).emit("lesson:screen-stream-requested", { socketId: socket.id, deviceType: deviceType || "desktop" });
    });

    socket.on("lesson:start", async (data) => {
      if (socket.data.lessonRole !== "host") return;
      const { lessonId } = data;
      io.to(`lesson:${lessonId}`).emit("lesson:started");
      try { await storage.updateLiveLesson(lessonId, { status: "active" }); } catch {}
    });

    socket.on("lesson:end", async (data) => {
      if (socket.data.lessonRole !== "host") return;
      const { lessonId } = data;
      io.to(`lesson:${lessonId}`).emit("lesson:ended");
      try { await storage.updateLiveLesson(lessonId, { status: "ended" }); } catch {}
    });

    socket.on("lesson:webrtc-offer", (data) => {
      if (socket.data.lessonRole !== "host") return;
      const { lessonId, offer, targetSocketId } = data;
      if (targetSocketId) {
        io.to(targetSocketId).emit("lesson:webrtc-offer", { offer, senderSocketId: socket.id });
      } else {
        socket.to(`lesson:${lessonId}`).emit("lesson:webrtc-offer", { offer, senderSocketId: socket.id });
      }
    });

    socket.on("lesson:webrtc-answer", (data) => {
      const { answer, targetSocketId } = data;
      io.to(targetSocketId).emit("lesson:webrtc-answer", { answer, senderSocketId: socket.id });
    });

    socket.on("lesson:webrtc-ice-candidate", (data) => {
      const { candidate, targetSocketId, lessonId } = data;
      if (targetSocketId) {
        io.to(targetSocketId).emit("lesson:webrtc-ice-candidate", { candidate, senderSocketId: socket.id });
      } else {
        socket.to(`lesson:${lessonId}`).emit("lesson:webrtc-ice-candidate", { candidate, senderSocketId: socket.id });
      }
    });

    socket.on("lesson:request-stream", (data) => {
      if (socket.data.lessonRole !== "student") return;
      const { lessonId } = data;
      socket.to(`lesson:${lessonId}`).emit("lesson:stream-requested", { socketId: socket.id });
    });

    socket.on("lesson:broadcast-stream-available", async (data) => {
      if (socket.data.lessonRole !== "host") return;
      const { lessonId } = data;
      const roomSockets = await io.in(`lesson:${lessonId}`).fetchSockets();
      const studentSocketIds: string[] = [];
      for (const s of roomSockets) {
        if (s.data.lessonRole === "student") {
          studentSocketIds.push(s.id);
          socket.emit("lesson:stream-requested", { socketId: s.id });
        }
      }
      if (studentSocketIds.length > 0) {
        io.to(studentSocketIds).emit("lesson:teacher-stream-available", { lessonId });
      }
    });

    socket.on("public:create-room", async (data, callback) => {
      try {
        const { quizId, playerName } = data;
        if (!quizId || !playerName) return callback?.({ success: false, error: "Ma'lumotlar to'liq emas" });

        const quiz = await storage.getQuiz(quizId);
        if (!quiz || !quiz.isPublic) return callback?.({ success: false, error: "Quiz topilmadi yoki ommaviy emas" });

        const questionsList = await storage.getQuestionsByQuiz(quizId);
        if (questionsList.length === 0) return callback?.({ success: false, error: "Quizda savollar yo'q" });

        const roomId = `pr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const code = generateRoomCode();
        const hostPlayerId = `p_${socket.id}_${Date.now()}`;

        const room: PublicRoom = {
          id: roomId,
          quizId,
          code,
          hostSocketId: socket.id,
          hostPlayerId,
          status: "waiting",
          players: new Map(),
          questions: questionsList,
          quiz,
          currentQuestionIndex: -1,
          questionTimer: null,
          questionStartTime: 0,
          currentEffectiveTimeLimit: 30,
          answeredThisQuestion: new Set(),
        };

        room.players.set(hostPlayerId, {
          socketId: socket.id,
          name: playerName,
          score: 0,
          correctAnswers: 0,
          totalAnswered: 0,
          playerId: hostPlayerId,
        });

        publicRooms.set(roomId, room);
        codeToRoomId.set(code, roomId);

        socket.join(`pubroom:${roomId}`);
        socket.data.publicRoomId = roomId;
        socket.data.publicPlayerId = hostPlayerId;
        socket.data.isPublicHost = true;

        callback?.({
          success: true,
          roomId,
          code,
          playerId: hostPlayerId,
          quizTitle: quiz.title,
          totalQuestions: questionsList.length,
        });
      } catch (err) {
        console.error("Create public room error:", err);
        callback?.({ success: false, error: "Xona yaratishda xatolik" });
      }
    });

    socket.on("public:join-room", async (data, callback) => {
      try {
        const { code, playerName, rejoinToken } = data;
        if (!code || !playerName) return callback?.({ success: false, error: "Ma'lumotlar to'liq emas" });

        const roomId = codeToRoomId.get(code);
        if (!roomId) return callback?.({ success: false, error: "Xona topilmadi" });

        const room = publicRooms.get(roomId);
        if (!room) return callback?.({ success: false, error: "Xona topilmadi" });

        const isLateJoin = room.status === "playing";
        if (room.status !== "waiting" && !isLateJoin) return callback?.({ success: false, error: "O'yin allaqachon tugagan" });

        let playerId: string;
        let isRejoin = false;
        let newToken = "";

        const existingPlayer = Array.from(room.players.values()).find(
          p => p.name.toLowerCase().trim() === playerName.toLowerCase().trim()
        );

        if (existingPlayer) {
          if (rejoinToken && (existingPlayer as any).rejoinToken === rejoinToken) {
            playerId = existingPlayer.playerId;
            existingPlayer.socketId = socket.id;
            isRejoin = true;
            newToken = rejoinToken;
          } else {
            return callback?.({ success: false, error: "Bu ism allaqachon band. Boshqa ism tanlang." });
          }
        } else {
          playerId = `p_${socket.id}_${Date.now()}`;
          newToken = `tok_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
          const playerData: any = {
            socketId: socket.id,
            name: playerName,
            score: 0,
            correctAnswers: 0,
            totalAnswered: 0,
            playerId,
            rejoinToken: newToken,
          };
          room.players.set(playerId, playerData);
        }

        socket.join(`pubroom:${roomId}`);
        socket.data.publicRoomId = roomId;
        socket.data.publicPlayerId = playerId;
        socket.data.isPublicHost = false;

        const playerList = Array.from(room.players.values()).map(p => ({ playerId: p.playerId, name: p.name }));

        if (!isRejoin) {
          io.to(`pubroom:${roomId}`).emit("public:player-joined", {
            playerId,
            name: playerName,
            players: playerList,
            count: room.players.size,
          });
        }

        const alreadyAnsweredCurrent = room.answeredThisQuestion.has(playerId);

        callback?.({
          success: true,
          roomId,
          playerId,
          rejoinToken: newToken,
          quizTitle: room.quiz.title,
          totalQuestions: room.questions.length,
          players: playerList,
          isLateJoin: isLateJoin || isRejoin,
          isRejoin,
          currentScore: existingPlayer ? existingPlayer.score : 0,
          currentCorrect: existingPlayer ? existingPlayer.correctAnswers : 0,
          alreadyAnsweredCurrent,
        });

        if ((isLateJoin || isRejoin) && room.currentQuestionIndex >= 0) {
          const q = room.questions[room.currentQuestionIndex];
          if (q) {
            const timeLimit = q.timeLimit || 30;
            const elapsed = Math.floor((Date.now() - room.questionStartTime) / 1000);
            const remainingTime = Math.max(0, timeLimit - elapsed);

            const questionOptions = q.options ? (room.quiz.shuffleOptions ? [...q.options].sort(() => Math.random() - 0.5) : q.options) : null;
            socket.emit("public:game-started", { totalQuestions: room.questions.length });
            socket.emit("public:question", {
              question: {
                id: q.id,
                questionText: q.questionText,
                type: q.type,
                options: questionOptions,
                timeLimit: remainingTime,
                points: q.type === "poll" ? 0 : q.points,
                mediaUrl: q.mediaUrl,
              },
              index: room.currentQuestionIndex,
              total: room.questions.length,
            });
          }
        }
      } catch (err) {
        console.error("Join public room error:", err);
        callback?.({ success: false, error: "Qo'shilishda xatolik" });
      }
    });

    socket.on("public:start-game", async (data, callback) => {
      try {
        const roomId = socket.data.publicRoomId;
        if (!roomId || !socket.data.isPublicHost) return callback?.({ success: false, error: "Faqat host boshlashi mumkin" });

        const room = publicRooms.get(roomId);
        if (!room || room.status !== "waiting") return callback?.({ success: false, error: "Xona tayyor emas" });

        room.status = "playing";
        room.currentQuestionIndex = 0;

        const quiz = room.quiz;
        let questionsList = [...room.questions];
        if (quiz.shuffleQuestions) {
          for (let i = questionsList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [questionsList[i], questionsList[j]] = [questionsList[j], questionsList[i]];
          }
          room.questions = questionsList;
        }

        io.to(`pubroom:${roomId}`).emit("public:game-started", {
          totalQuestions: room.questions.length,
        });

        sendPublicQuestion(roomId);
        callback?.({ success: true });
      } catch (err) {
        console.error("Start public game error:", err);
        callback?.({ success: false, error: "O'yinni boshlashda xatolik" });
      }
    });

    socket.on("public:answer", async (data) => {
      try {
        const roomId = socket.data.publicRoomId;
        const playerId = socket.data.publicPlayerId;
        if (!roomId || !playerId) return;

        const room = publicRooms.get(roomId);
        if (!room || room.status !== "playing") return;

        const { questionId, answer } = data;
        const question = room.questions[room.currentQuestionIndex];
        if (!question || question.id !== questionId) return;

        if (room.answeredThisQuestion.has(playerId)) return;

        const elapsed = (Date.now() - room.questionStartTime) / 1000;
        if (elapsed > room.currentEffectiveTimeLimit + 2) return;

        room.answeredThisQuestion.add(playerId);

        const player = room.players.get(playerId);
        if (!player) return;

        const timeSpent = Math.floor(elapsed);

        let isCorrect = false;
        let points = 0;

        if (question.type === "poll") {
          isCorrect = true;
          points = 0;
        } else if (question.type === "multiple_select") {
          const correctArr = question.correctAnswer.split(",").map((s: string) => s.trim().toLowerCase());
          const correctSet = new Set(correctArr);
          const answerArr = Array.from(new Set(String(answer).split(",").map((s: string) => s.trim().toLowerCase())));
          const correctCount = answerArr.filter((a: string) => correctSet.has(a)).length;
          const wrongCount = answerArr.filter((a: string) => !correctSet.has(a)).length;
          const totalCorrect = correctSet.size;
          if (wrongCount === 0 && correctCount > 0) {
            const ratio = correctCount / totalCorrect;
            const timeBonus = Math.max(0, room.currentEffectiveTimeLimit - timeSpent);
            points = Math.floor(((question.points || 100) + Math.floor(timeBonus * 2)) * ratio);
            isCorrect = correctCount === totalCorrect;
          }
        } else {
          isCorrect = question.correctAnswer.toLowerCase().trim() === String(answer).toLowerCase().trim();
          const timeBonus = Math.max(0, room.currentEffectiveTimeLimit - timeSpent);
          points = isCorrect ? (question.points || 100) + Math.floor(timeBonus * 2) : 0;
        }

        player.score += points;
        player.correctAnswers += isCorrect ? 1 : 0;
        player.totalAnswered += 1;

        const showCorrectPublic = room.quiz.showCorrectAnswers !== false;
        socket.emit("public:answer-result", {
          isCorrect,
          points,
          correctAnswer: showCorrectPublic ? question.correctAnswer : undefined,
          totalScore: player.score,
          answerOrder: room.answeredThisQuestion.size,
          showCorrectAnswers: showCorrectPublic,
        });

        io.to(`pubroom:${roomId}`).emit("public:answer-received", {
          playerId,
          answeredCount: Array.from(room.players.values()).filter(p => p.totalAnswered > room.currentQuestionIndex).length,
          totalPlayers: room.players.size,
        });
      } catch (err) {
        console.error("Public answer error:", err);
      }
    });

    socket.on("public:next-question", (data) => {
      const roomId = socket.data.publicRoomId;
      if (!roomId || !socket.data.isPublicHost) return;
      const room = publicRooms.get(roomId);
      if (!room || room.status !== "playing") return;

      if (room.questionTimer) {
        clearTimeout(room.questionTimer);
        room.questionTimer = null;
      }

      room.currentQuestionIndex++;
      if (room.currentQuestionIndex >= room.questions.length) {
        finishPublicGame(roomId);
      } else {
        sendPublicQuestion(roomId);
      }
    });

    socket.on("scheduled:join-lobby", (data) => {
      const { code, playerName } = data;
      if (!code || !playerName) return;

      socket.join(`scheduled:${code}`);
      socket.data.scheduledCode = code;

      let lobby = scheduledLobbies.get(code);
      if (!lobby) {
        lobby = { players: new Map() };
        scheduledLobbies.set(code, lobby);
      }
      lobby.players.set(socket.id, { socketId: socket.id, name: playerName });

      const playerNames = Array.from(lobby.players.values()).map(p => p.name);
      io.to(`scheduled:${code}`).emit("scheduled:lobby-update", { players: playerNames });
    });

    socket.on("lesson:chat-send", (data) => {
      if (!socket.data.lessonId) return;
      const { message, replyTo, name } = data;
      if (!message || typeof message !== "string" || message.trim().length === 0) return;
      const trimmed = message.trim().slice(0, 500);
      let senderName = "O'qituvchi";
      if (socket.data.lessonRole !== "host") {
        senderName = (name && typeof name === "string" && name.trim()) ? name.trim().slice(0, 30) : (socket.data.studentName || "O'quvchi");
      }
      const chatMsg: any = {
        id: `${socket.id}-${Date.now()}`,
        name: senderName,
        message: trimmed,
        role: socket.data.lessonRole as string,
        timestamp: Date.now(),
      };
      if (replyTo && replyTo.id && replyTo.name && replyTo.message) {
        chatMsg.replyTo = {
          id: String(replyTo.id).slice(0, 100),
          name: String(replyTo.name).slice(0, 30),
          message: String(replyTo.message).slice(0, 80),
        };
      }
      io.to(`lesson:${socket.data.lessonId}`).emit("lesson:chat-message", chatMsg);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      if (socket.data.sessionId && socket.data.role === "player") {
        io.to(`session:${socket.data.sessionId}`).emit("player:left", {
          participantId: socket.data.participantId,
        });
      }
      if (socket.data.lessonId) {
        const room = io.sockets.adapter.rooms.get(`lesson:${socket.data.lessonId}`);
        const count = room ? room.size : 0;
        io.to(`lesson:${socket.data.lessonId}`).emit("lesson:participant-count", { count });
        if (socket.data.lessonRole === "student") {
          io.to(`lesson:${socket.data.lessonId}`).emit("lesson:student-left", {
            socketId: socket.id,
            name: socket.data.studentName,
            count,
          });
        }
      }
      if (socket.data.scheduledCode) {
        const lobby = scheduledLobbies.get(socket.data.scheduledCode);
        if (lobby) {
          lobby.players.delete(socket.id);
          const playerNames = Array.from(lobby.players.values()).map(p => p.name);
          io.to(`scheduled:${socket.data.scheduledCode}`).emit("scheduled:lobby-update", { players: playerNames });
          if (lobby.players.size === 0) {
            scheduledLobbies.delete(socket.data.scheduledCode);
          }
        }
      }
      if (socket.data.publicRoomId) {
        const pubRoom = publicRooms.get(socket.data.publicRoomId);
        if (pubRoom) {
          const playerId = socket.data.publicPlayerId;
          if (playerId) {
            pubRoom.players.delete(playerId);
          }

          if (pubRoom.players.size === 0) {
            cleanupRoom(pubRoom.id);
          } else if (socket.data.isPublicHost) {
            const nextPlayer = Array.from(pubRoom.players.values())[0];
            if (nextPlayer) {
              pubRoom.hostSocketId = nextPlayer.socketId;
              pubRoom.hostPlayerId = nextPlayer.playerId;
              const nextSocket = io.sockets.sockets.get(nextPlayer.socketId);
              if (nextSocket) {
                nextSocket.data.isPublicHost = true;
              }
              io.to(`pubroom:${pubRoom.id}`).emit("public:host-changed", {
                newHostId: nextPlayer.playerId,
                newHostName: nextPlayer.name,
              });
            }
            const playerList = Array.from(pubRoom.players.values()).map(p => ({ playerId: p.playerId, name: p.name }));
            io.to(`pubroom:${pubRoom.id}`).emit("public:player-left", {
              playerId,
              players: playerList,
              count: pubRoom.players.size,
            });
          } else {
            const playerList = Array.from(pubRoom.players.values()).map(p => ({ playerId: p.playerId, name: p.name }));
            io.to(`pubroom:${pubRoom.id}`).emit("public:player-left", {
              playerId,
              players: playerList,
              count: pubRoom.players.size,
            });
          }
        }
      }
    });
  });
}
