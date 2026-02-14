import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";

let io: SocketServer;

export function getIO() {
  return io;
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
      } catch (err) {
        console.error("Start quiz error:", err);
      }
    });

    socket.on("host:next-question", async (data) => {
      try {
        const { sessionId } = data;
        const session = await storage.getLiveSession(sessionId);
        if (!session) return;

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
      } catch (err) {
        console.error("Next question error:", err);
      }
    });

    socket.on("host:show-leaderboard", async (data) => {
      try {
        const { sessionId } = data;
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
      } catch (err) {
        console.error("Leaderboard error:", err);
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

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      if (socket.data.sessionId && socket.data.role === "player") {
        io.to(`session:${socket.data.sessionId}`).emit("player:left", {
          participantId: socket.data.participantId,
        });
      }
    });
  });
}
