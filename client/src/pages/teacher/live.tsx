import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { io, Socket } from "socket.io-client";
import { Play, SkipForward, Users, Trophy, Copy, Send, Music } from "lucide-react";
import type { Quiz, LiveSession } from "@shared/schema";

let socket: Socket | null = null;

export default function TeacherLive() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const preselectedQuizId = searchParams.get("quizId");

  const [selectedQuizId, setSelectedQuizId] = useState(preselectedQuizId || "");
  const [session, setSession] = useState<LiveSession | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [questionIndex, setQuestionIndex] = useState(-1);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [phase, setPhase] = useState<"setup" | "waiting" | "question" | "leaderboard" | "finished">("setup");
  const [answersReceived, setAnswersReceived] = useState(0);
  const [telegramChatId, setTelegramChatId] = useState("");

  const { data: quizzes } = useQuery<Quiz[]>({ queryKey: ["/api/quizzes"] });

  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
    };
  }, []);

  const connectSocket = useCallback(() => {
    if (socket) return socket;
    socket = io({ path: "/socket.io" });

    socket.on("player:joined", (data) => {
      setParticipants((prev) => [...prev, { id: data.participantId, name: data.name }]);
      toast({ title: `${data.name} qo'shildi!` });
    });

    socket.on("player:left", (data) => {
      setParticipants((prev) => prev.filter((p) => p.id !== data.participantId));
    });

    socket.on("quiz:started", (data) => {
      setTotalQuestions(data.totalQuestions);
    });

    socket.on("question:show", (data) => {
      setCurrentQuestion(data.question);
      setQuestionIndex(data.index);
      setTotalQuestions(data.total);
      setPhase("question");
      setAnswersReceived(0);
    });

    socket.on("answer:received", () => {
      setAnswersReceived((prev) => prev + 1);
    });

    socket.on("leaderboard:show", (data) => {
      setLeaderboard(data.leaderboard);
      setPhase("leaderboard");
    });

    socket.on("quiz:finished", (data) => {
      setLeaderboard(data.leaderboard);
      setPhase("finished");
    });

    return socket;
  }, [toast]);

  const createSession = async () => {
    if (!selectedQuizId) return;
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: selectedQuizId }),
        credentials: "include",
      });
      const data = await res.json();
      setSession(data);
      setPhase("waiting");

      const s = connectSocket();
      s.emit("host:create-session", { sessionId: data.id });
    } catch {
      toast({ title: "Xatolik yuz berdi", variant: "destructive" });
    }
  };

  const startQuiz = () => {
    if (!session || !socket) return;
    socket.emit("host:start-quiz", { sessionId: session.id });
  };

  const nextQuestion = () => {
    if (!session || !socket) return;
    socket.emit("host:next-question", { sessionId: session.id });
  };

  const showLeaderboard = () => {
    if (!session || !socket) return;
    socket.emit("host:show-leaderboard", { sessionId: session.id });
  };

  const copyCode = () => {
    if (session) {
      navigator.clipboard.writeText(session.joinCode);
      toast({ title: "Kod nusxalandi!" });
    }
  };

  const shareToTelegram = async () => {
    if (!selectedQuizId || !telegramChatId) return;
    try {
      const res = await fetch("/api/telegram/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: selectedQuizId, chatId: telegramChatId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Telegram'ga yuborildi!" });
    } catch {
      toast({ title: "Telegram xatosi", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold" data-testid="text-live-title">Jonli Quiz</h1>
        <p className="text-muted-foreground">Real vaqtda quiz o'tkazing</p>
      </motion.div>

      <AnimatePresence mode="wait">
        {phase === "setup" && (
          <motion.div key="setup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <Card className="p-6 max-w-lg space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Quizni tanlang</label>
                <Select value={selectedQuizId} onValueChange={setSelectedQuizId}>
                  <SelectTrigger data-testid="select-quiz">
                    <SelectValue placeholder="Quiz tanlang..." />
                  </SelectTrigger>
                  <SelectContent>
                    {quizzes?.filter((q) => q.status === "published").map((q) => (
                      <SelectItem key={q.id} value={q.id}>{q.title} ({q.totalQuestions} savol)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full gradient-purple border-0" onClick={createSession} disabled={!selectedQuizId} data-testid="button-create-session">
                <Play className="w-4 h-4 mr-1" /> Sessiya boshlash
              </Button>

              {selectedQuizId && (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium">Telegram'da ulashish</p>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-md border px-3 py-2 text-sm bg-background"
                      placeholder="Chat ID yoki @username"
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      data-testid="input-telegram-chat"
                    />
                    <Button variant="outline" onClick={shareToTelegram} disabled={!telegramChatId} data-testid="button-telegram-share">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        )}

        {phase === "waiting" && session && (
          <motion.div key="waiting" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-center space-y-8">
            <Card className="p-8 max-w-md mx-auto">
              <p className="text-muted-foreground mb-4">O'quvchilar ushbu kod bilan qo'shilsin:</p>
              <div className="flex items-center justify-center gap-2 mb-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="text-5xl font-mono font-bold tracking-[0.3em] gradient-purple text-transparent bg-clip-text"
                  data-testid="text-join-code"
                >
                  {session.joinCode}
                </motion.div>
                <Button size="icon" variant="ghost" onClick={copyCode} data-testid="button-copy-code">
                  <Copy className="w-5 h-5" />
                </Button>
              </div>
              <div className="flex items-center justify-center gap-2 mb-6 text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{participants.length} ta o'quvchi qo'shildi</span>
              </div>
              {participants.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center mb-6">
                  {participants.map((p, i) => (
                    <motion.div key={p.id} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }}>
                      <Badge variant="secondary">{p.name}</Badge>
                    </motion.div>
                  ))}
                </div>
              )}
              <Button className="w-full gradient-purple border-0" onClick={startQuiz} disabled={participants.length === 0} data-testid="button-start-quiz">
                <Play className="w-4 h-4 mr-1" /> Quizni boshlash ({participants.length} o'quvchi)
              </Button>
            </Card>
          </motion.div>
        )}

        {phase === "question" && currentQuestion && (
          <motion.div key={`q-${questionIndex}`} initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -100 }} className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <Badge variant="secondary" className="text-lg px-4 py-1">
                {questionIndex + 1} / {totalQuestions}
              </Badge>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{answersReceived} / {participants.length} javob</span>
              </div>
            </div>

            <Card className="p-8 text-center space-y-4">
              <h2 className="text-2xl font-bold" data-testid="text-current-question">{currentQuestion.questionText}</h2>
              {currentQuestion.mediaUrl && currentQuestion.mediaType === "video" && (
                <video src={currentQuestion.mediaUrl} controls className="rounded-md max-h-56 w-full object-contain bg-black mx-auto" />
              )}
              {currentQuestion.mediaUrl && currentQuestion.mediaType === "audio" && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md justify-center">
                  <Music className="w-5 h-5 text-muted-foreground shrink-0" />
                  <audio src={currentQuestion.mediaUrl} controls className="w-full max-w-sm h-8" />
                </div>
              )}
              {currentQuestion.mediaUrl && currentQuestion.mediaType === "image" && (
                <img src={currentQuestion.mediaUrl} alt="Savol rasmi" className="rounded-md max-h-56 object-contain mx-auto" />
              )}
              {currentQuestion.options && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
                  {(currentQuestion.options as string[]).map((opt: string, i: number) => (
                    <div key={i} className={`p-4 rounded-md text-white font-semibold text-lg ${["quiz-option-a", "quiz-option-b", "quiz-option-c", "quiz-option-d"][i]}`}>
                      {String.fromCharCode(65 + i)}. {opt}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <div className="flex gap-3 justify-center flex-wrap">
              <Button variant="outline" onClick={showLeaderboard} data-testid="button-show-leaderboard">
                <Trophy className="w-4 h-4 mr-1" /> Reytingni ko'rsatish
              </Button>
              <Button className="gradient-purple border-0" onClick={nextQuestion} data-testid="button-next-question">
                <SkipForward className="w-4 h-4 mr-1" /> Keyingi savol
              </Button>
            </div>
          </motion.div>
        )}

        {(phase === "leaderboard" || phase === "finished") && (
          <motion.div key="leaderboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg mx-auto space-y-4">
            <div className="text-center mb-6">
              <Trophy className="w-12 h-12 text-yellow-500 mx-auto mb-2" />
              <h2 className="text-2xl font-bold">{phase === "finished" ? "Yakuniy Natijalar" : "Reyting"}</h2>
            </div>
            {leaderboard.map((entry, i) => (
              <motion.div key={entry.participantId} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}>
                <Card className={`p-4 ${i === 0 ? "border-yellow-500/50" : ""}`} data-testid={`card-rank-${i}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${i === 0 ? "gradient-orange" : i === 1 ? "gradient-purple" : i === 2 ? "gradient-teal" : "bg-muted text-muted-foreground"}`}>
                      {entry.rank}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{entry.name}</p>
                      <p className="text-sm text-muted-foreground">{entry.correctAnswers} to'g'ri javob</p>
                    </div>
                    <p className="text-xl font-bold">{entry.score}</p>
                  </div>
                </Card>
              </motion.div>
            ))}
            {phase === "leaderboard" && (
              <Button className="w-full gradient-purple border-0" onClick={nextQuestion} data-testid="button-continue">
                <SkipForward className="w-4 h-4 mr-1" /> Keyingi savol
              </Button>
            )}
            {phase === "finished" && (
              <Button className="w-full" variant="outline" onClick={() => { setPhase("setup"); setSession(null); setParticipants([]); }} data-testid="button-new-session">
                Yangi sessiya
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
