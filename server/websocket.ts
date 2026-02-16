import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";

let io: SocketServer;

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
      }, 5500);
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
    }, (timeLimit + 2) * 1000);
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
  }, (timeLimit + 2) * 1000);
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

  io.to(`pubroom:${roomId}`).emit("public:leaderboard", {
    leaderboard,
    correctAnswer: q?.correctAnswer || "",
    questionIndex: room.currentQuestionIndex,
    isLast: room.currentQuestionIndex >= room.questions.length - 1,
  });
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

  setTimeout(() => cleanupRoom(roomId), 5 * 60 * 1000);
}

export function setupWebSocket(httpServer: HttpServer) {
  io = new SocketServer(httpServer, {
    cors: { origin: "*" },
    path: "/socket.io",
  });

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
                text: q.text,
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

        socket.emit("answer:result", { isCorrect, points, correctAnswer: question.correctAnswer, rank: myRank, totalScore, totalPlayers });

        io.to(`session:${sessionId}`).emit("answer:received", {
          participantId,
          questionId,
        });
      } catch (err) {
        console.error("Answer error:", err);
      }
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
        const { code, playerName } = data;
        if (!code || !playerName) return callback?.({ success: false, error: "Ma'lumotlar to'liq emas" });

        const roomId = codeToRoomId.get(code);
        if (!roomId) return callback?.({ success: false, error: "Xona topilmadi" });

        const room = publicRooms.get(roomId);
        if (!room) return callback?.({ success: false, error: "Xona topilmadi" });
        if (room.status !== "waiting") return callback?.({ success: false, error: "O'yin allaqachon boshlangan" });

        const playerId = `p_${socket.id}_${Date.now()}`;

        room.players.set(playerId, {
          socketId: socket.id,
          name: playerName,
          score: 0,
          correctAnswers: 0,
          totalAnswered: 0,
          playerId,
        });

        socket.join(`pubroom:${roomId}`);
        socket.data.publicRoomId = roomId;
        socket.data.publicPlayerId = playerId;
        socket.data.isPublicHost = false;

        const playerList = Array.from(room.players.values()).map(p => ({ playerId: p.playerId, name: p.name }));

        io.to(`pubroom:${roomId}`).emit("public:player-joined", {
          playerId,
          name: playerName,
          players: playerList,
          count: room.players.size,
        });

        callback?.({
          success: true,
          roomId,
          playerId,
          quizTitle: room.quiz.title,
          totalQuestions: room.questions.length,
          players: playerList,
        });
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

        socket.emit("public:answer-result", {
          isCorrect,
          points,
          correctAnswer: question.correctAnswer,
          totalScore: player.score,
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
