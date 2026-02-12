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

    socket.on("host:start-quiz", async (data) => {
      try {
        const { sessionId } = data;
        await storage.updateLiveSession(sessionId, {
          status: "active",
          startedAt: new Date(),
          currentQuestionIndex: 0,
        } as any);

        const session = await storage.getLiveSession(sessionId);
        if (!session) return;

        const questionsList = await storage.getQuestionsByQuiz(session.quizId);
        if (questionsList.length === 0) return;

        await storage.incrementQuizPlays(session.quizId);

        const q = questionsList[0];
        io.to(`session:${sessionId}`).emit("quiz:started", {
          totalQuestions: questionsList.length,
        });

        io.to(`session:${sessionId}`).emit("question:show", {
          index: 0,
          total: questionsList.length,
          question: {
            id: q.id,
            type: q.type,
            questionText: q.questionText,
            mediaType: q.mediaType,
            mediaUrl: q.mediaUrl,
            options: q.options,
            timeLimit: q.timeLimit,
            points: q.points,
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
        io.to(`session:${sessionId}`).emit("question:show", {
          index: nextIndex,
          total: questionsList.length,
          question: {
            id: q.id,
            type: q.type,
            questionText: q.questionText,
            mediaType: q.mediaType,
            mediaUrl: q.mediaUrl,
            options: q.options,
            timeLimit: q.timeLimit,
            points: q.points,
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

        const isCorrect = question.correctAnswer.toLowerCase().trim() === String(answer).toLowerCase().trim();
        const timeBonus = Math.max(0, question.timeLimit - timeSpent);
        const points = isCorrect ? question.points + Math.floor(timeBonus * 2) : 0;

        await storage.saveAnswer({
          sessionId,
          participantId,
          questionId,
          answer: String(answer),
          isCorrect,
          points,
          timeSpent,
        });

        if (isCorrect) {
          const participant = await storage.getParticipant(participantId);
          if (participant) {
            await storage.updateParticipant(participantId, {
              score: participant.score + points,
              correctAnswers: participant.correctAnswers + 1,
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

        socket.emit("answer:result", { isCorrect, points, correctAnswer: question.correctAnswer });

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
