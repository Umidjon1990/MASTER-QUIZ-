import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { io, Socket } from "socket.io-client";
import confetti from "canvas-confetti";
import { Play, SkipForward, Users, Trophy, Copy, Send, Music, Lock, Link2, Check, Crown, Medal, Award, Flame, BarChart3, Timer, Zap, WifiOff, Loader2 } from "lucide-react";
import type { Quiz, LiveSession } from "@shared/schema";

let socket: Socket | null = null;

const PODIUM_CONFIG = [
  {
    gradient: "from-yellow-300 via-yellow-400 to-amber-500",
    glow: "0 0 40px rgba(251,191,36,0.5), 0 0 80px rgba(251,191,36,0.2)",
    avatarGradient: "from-yellow-300 to-amber-500",
    ringColor: "ring-yellow-400/80",
    height: 220,
    icon: Crown,
    iconSize: "w-12 h-12",
    iconColor: "text-yellow-400",
    avatarSize: "w-24 h-24",
    fontSize: "text-6xl",
    label: "1",
  },
  {
    gradient: "from-slate-300 via-gray-300 to-slate-400",
    glow: "0 0 30px rgba(148,163,184,0.4), 0 0 60px rgba(148,163,184,0.15)",
    avatarGradient: "from-slate-300 to-gray-400",
    ringColor: "ring-slate-300/80",
    height: 170,
    icon: Medal,
    iconSize: "w-9 h-9",
    iconColor: "text-slate-400",
    avatarSize: "w-20 h-20",
    fontSize: "text-5xl",
    label: "2",
  },
  {
    gradient: "from-amber-500 via-amber-600 to-orange-700",
    glow: "0 0 25px rgba(217,119,6,0.4), 0 0 50px rgba(217,119,6,0.15)",
    avatarGradient: "from-amber-500 to-orange-700",
    ringColor: "ring-amber-600/80",
    height: 130,
    icon: Award,
    iconSize: "w-9 h-9",
    iconColor: "text-amber-600",
    avatarSize: "w-20 h-20",
    fontSize: "text-5xl",
    label: "3",
  },
];
const PODIUM_ORDER = [1, 0, 2];

function AnimatedScore({ value, delay }: { value: number; delay: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      const duration = 1200;
      const start = performance.now();
      const animate = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(Math.round(eased * value));
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return <>{display}</>;
}

export default function TeacherLive() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const preselectedQuizId = searchParams.get("quizId");

  const [selectedQuizId, setSelectedQuizId] = useState(preselectedQuizId || "");
  const [sessionPassword, setSessionPassword] = useState("");
  const [session, setSession] = useState<LiveSession | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [questionIndex, setQuestionIndex] = useState(-1);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [phase, setPhase] = useState<"setup" | "waiting" | "question" | "leaderboard" | "finished">("setup");
  const [answersReceived, setAnswersReceived] = useState(0);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [questionTimeLimit, setQuestionTimeLimit] = useState(0);
  const [leaderboardCountdown, setLeaderboardCountdown] = useState(0);
  const [autoTriggered, setAutoTriggered] = useState(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<LiveSession | null>(null);
  sessionRef.current = session;
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "reconnecting">("disconnected");

  const { data: quizzes } = useQuery<Quiz[]>({ queryKey: ["/api/quizzes"] });

  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase === "question" && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft, phase]);

  useEffect(() => {
    if (phase !== "leaderboard") return;
    if (leaderboardCountdown > 0) {
      const timer = setTimeout(() => setLeaderboardCountdown((t) => t - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [leaderboardCountdown, phase]);

  const connectSocket = useCallback(() => {
    if (socket) return socket;
    socket = io({
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    socket.on("connect", () => {
      console.log("Socket connected:", socket?.id);
      setConnectionStatus("connected");
      if (sessionRef.current) {
        socket?.emit("host:rejoin-session", { sessionId: sessionRef.current.id }, (res: any) => {
          if (res?.success) {
            console.log("Rejoined session successfully");
            if (res.participants) {
              setParticipants(res.participants.map((p: any) => ({ id: p.id, name: p.name })));
            }
          }
        });
      }
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      setConnectionStatus("disconnected");
    });

    socket.on("reconnecting", () => {
      setConnectionStatus("reconnecting");
    });

    socket.on("reconnect_attempt", () => {
      setConnectionStatus("reconnecting");
    });

    socket.on("reconnect", () => {
      setConnectionStatus("connected");
    });

    socket.io.on("reconnect_attempt", () => {
      setConnectionStatus("reconnecting");
    });

    socket.io.on("reconnect", () => {
      setConnectionStatus("connected");
    });

    socket.on("player:joined", (data) => {
      setParticipants((prev) => {
        if (prev.some(p => p.id === data.participantId)) return prev;
        return [...prev, { id: data.participantId, name: data.name }];
      });
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
      setAutoTriggered(false);
      const tl = data.timerEnabled !== false && data.question.timeLimit > 0 ? data.question.timeLimit : 0;
      setTimeLeft(tl);
      setQuestionTimeLimit(tl);
    });

    socket.on("answer:received", () => {
      setAnswersReceived((prev) => prev + 1);
    });

    socket.on("leaderboard:show", (data) => {
      const sorted = [...data.leaderboard].sort((a: any, b: any) => b.score - a.score).map((e: any, i: number) => ({ ...e, rank: i + 1 }));
      setLeaderboard(sorted);
      setPhase("leaderboard");
      setLeaderboardCountdown(5);
    });

    socket.on("quiz:finished", (data) => {
      const sorted = [...data.leaderboard].sort((a: any, b: any) => b.score - a.score).map((e: any, i: number) => ({ ...e, rank: i + 1 }));
      setLeaderboard(sorted);
      setLeaderboardCountdown(0);
      setPhase("finished");
      setTimeout(() => {
        confetti({ particleCount: 300, spread: 120, origin: { y: 0.4 }, colors: ["#FFD700", "#C0C0C0", "#CD7F32"] });
        setTimeout(() => confetti({ particleCount: 150, spread: 80, origin: { x: 0.2, y: 0.5 }, colors: ["#FFD700", "#FFA500"] }), 500);
        setTimeout(() => confetti({ particleCount: 150, spread: 80, origin: { x: 0.8, y: 0.5 }, colors: ["#C0C0C0", "#B87333"] }), 1000);
      }, 800);
    });

    return socket;
  }, [toast]);

  const createSession = async () => {
    if (!selectedQuizId) return;
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: selectedQuizId, password: sessionPassword || null }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || "Xatolik yuz berdi", variant: "destructive" });
        return;
      }
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
    socket.emit("host:start-quiz", { sessionId: session.id }, (response: any) => {
      if (response && !response.success) {
        toast({ title: response.error || "Quizni boshlashda xatolik", variant: "destructive" });
      }
    });
  };

  const handleAutoAdvanceChange = (value: boolean) => {
    setAutoAdvance(value);
    if (session && socket) {
      socket.emit("host:set-auto-advance", { sessionId: session.id, autoAdvance: value });
    }
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

  const copyLink = () => {
    if (session) {
      const link = `${window.location.origin}/play/join?code=${session.joinCode}`;
      navigator.clipboard.writeText(link);
      setLinkCopied(true);
      toast({ title: "Havola nusxalandi!" });
      setTimeout(() => setLinkCopied(false), 2000);
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

      {phase !== "setup" && connectionStatus !== "connected" && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-500/30 text-yellow-700 dark:text-yellow-400"
          data-testid="banner-connection-status"
        >
          {connectionStatus === "reconnecting" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span className="text-sm font-medium">Qayta ulanilmoqda... Quiz serverda davom etmoqda.</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">Ulanish uzildi. Avtomatik qayta ulanish amalga oshirilmoqda...</span>
            </>
          )}
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {phase === "setup" && (
          <motion.div key="setup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <Card className="p-6 max-w-lg space-y-4">
              <div>
                <Label className="mb-2 block">Quizni tanlang</Label>
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
              <div>
                <Label className="mb-2 block">
                  <Lock className="w-3.5 h-3.5 inline mr-1" />
                  Sessiya paroli (ixtiyoriy)
                </Label>
                <Input
                  value={sessionPassword}
                  onChange={(e) => setSessionPassword(e.target.value)}
                  placeholder="Parolsiz — barcha qo'shila oladi"
                  data-testid="input-session-password"
                />
              </div>
              <div className="flex items-center justify-between gap-2 p-3 rounded-md bg-muted/50">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <Label htmlFor="auto-advance" className="text-sm font-medium cursor-pointer">Avtomatik rejim</Label>
                    <p className="text-xs text-muted-foreground">Vaqt tugaganda keyingi savolga avtomatik o'tadi</p>
                  </div>
                </div>
                <Switch
                  id="auto-advance"
                  checked={autoAdvance}
                  onCheckedChange={handleAutoAdvanceChange}
                  data-testid="switch-auto-advance"
                />
              </div>
              <Button className="w-full gradient-purple border-0" onClick={createSession} disabled={!selectedQuizId} data-testid="button-create-session">
                <Play className="w-4 h-4 mr-1" /> Sessiya boshlash
              </Button>

              {selectedQuizId && (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium">Telegram'da ulashish</p>
                  <div className="flex gap-2">
                    <Input
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
              <div className="flex items-center justify-center gap-2 mb-4">
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

              <div className="flex items-center justify-center gap-2 mb-2">
                <Button variant="outline" onClick={copyLink} data-testid="button-copy-link">
                  {linkCopied ? <Check className="w-4 h-4 mr-1" /> : <Link2 className="w-4 h-4 mr-1" />}
                  {linkCopied ? "Nusxalandi!" : "Havola nusxalash"}
                </Button>
              </div>

              {session.password && (
                <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground mb-4">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Parol bilan himoyalangan</span>
                </div>
              )}

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
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="secondary" className="text-lg px-4 py-1">
                  {questionIndex + 1} / {totalQuestions}
                </Badge>
                {autoAdvance && (
                  <Badge variant="outline" data-testid="badge-auto-mode">
                    <Zap className="w-3 h-3 mr-1" /> Avtomatik
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                {questionTimeLimit > 0 && (
                  <div className="flex items-center gap-2" data-testid="text-question-timer">
                    <Timer className={`w-5 h-5 ${timeLeft <= 5 ? "text-red-500" : "text-muted-foreground"}`} />
                    <span className={`text-2xl font-bold tabular-nums ${timeLeft <= 5 ? "text-red-500" : ""}`}>
                      {timeLeft}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span>{answersReceived} / {participants.length} javob</span>
                </div>
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

        {phase === "leaderboard" && (
          <motion.div key="leaderboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg mx-auto space-y-4">
            <div className="text-center mb-4">
              <Trophy className="w-10 h-10 text-yellow-500 mx-auto mb-2" />
              <h2 className="text-2xl font-bold">Reyting</h2>
              <p className="text-sm text-muted-foreground">{participants.length} o'quvchi</p>
            </div>
            {leaderboard.slice(0, 10).map((entry, i) => {
              return (
                <motion.div key={entry.participantId} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
                  <Card className={`p-3 ${i === 0 ? "ring-2 ring-yellow-400/40" : ""}`} data-testid={`card-rank-${i}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0 ${
                        i === 0 ? "bg-gradient-to-br from-yellow-400 to-amber-500" :
                        i === 1 ? "bg-gradient-to-br from-gray-300 to-gray-400 text-gray-700" :
                        i === 2 ? "bg-gradient-to-br from-amber-600 to-amber-700" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {i < 3 ? (
                          i === 0 ? <Crown className="w-5 h-5" /> : <Medal className="w-5 h-5" />
                        ) : entry.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{entry.name}</p>
                        <p className="text-xs text-muted-foreground">{entry.correctAnswers} to'g'ri javob</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-bold">{entry.score}</p>
                        {i < 3 && (
                          <span className={`text-xs font-medium ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-400" : "text-amber-600"}`}>
                            {i === 0 ? "Oltin" : i === 1 ? "Kumush" : "Bronza"}
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
            {autoAdvance ? (
              <div className="text-center text-sm text-muted-foreground" data-testid="text-auto-countdown">
                <Zap className="w-4 h-4 inline mr-1" />
                Keyingi savol {leaderboardCountdown} soniyada...
              </div>
            ) : (
              <Button className="w-full gradient-purple border-0" onClick={nextQuestion} data-testid="button-continue">
                <SkipForward className="w-4 h-4 mr-1" /> Keyingi savol
              </Button>
            )}
          </motion.div>
        )}

        {phase === "finished" && (
          <motion.div key="finished" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto space-y-8">
            <motion.div initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", damping: 15 }} className="text-center">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: "spring", damping: 10 }}
                className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 mb-3"
                style={{ boxShadow: "0 0 30px rgba(251,191,36,0.4)" }}
              >
                <Trophy className="w-8 h-8 text-white" />
              </motion.div>
              <h2 className="text-3xl font-black tracking-tight mb-1" data-testid="text-final-results">Yakuniy Natijalar</h2>
              <p className="text-muted-foreground">{participants.length} o'quvchi ishtirok etdi</p>
            </motion.div>

            {leaderboard.length >= 1 && (
              <div className="relative" data-testid="podium-container" style={{ perspective: "1000px" }}>
                <div className="flex items-end justify-center gap-2 md:gap-4 pt-8 pb-2 px-2">
                  {PODIUM_ORDER.map((pos) => {
                    const entry = leaderboard[pos];
                    if (!entry) return <div key={pos} className="w-28 md:w-36" />;
                    const config = PODIUM_CONFIG[pos];
                    const IconComp = config.icon;
                    const baseDelay = pos === 0 ? 0.5 : pos === 1 ? 0.2 : 0.8;

                    return (
                      <motion.div
                        key={pos}
                        initial={{ opacity: 0, y: 80 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: baseDelay, type: "spring", damping: 12, stiffness: 100 }}
                        className="flex flex-col items-center"
                        data-testid={`podium-place-${pos + 1}`}
                      >
                        <motion.div
                          initial={{ scale: 0, rotate: -30 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ delay: baseDelay + 0.3, type: "spring", damping: 8 }}
                          className="mb-1"
                        >
                          {pos === 0 ? (
                            <motion.div
                              animate={{ y: [0, -6, 0] }}
                              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                            >
                              <IconComp className={`${config.iconSize} ${config.iconColor} mx-auto`} style={{ filter: "drop-shadow(0 0 12px rgba(251,191,36,0.6))" }} />
                            </motion.div>
                          ) : (
                            <IconComp className={`${config.iconSize} ${config.iconColor} mx-auto`} />
                          )}
                        </motion.div>

                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: baseDelay + 0.4, type: "spring", damping: 10 }}
                          className={`${config.avatarSize} rounded-full bg-gradient-to-br ${config.avatarGradient} flex items-center justify-center ring-4 ${config.ringColor} relative`}
                          style={{ boxShadow: config.glow }}
                        >
                          <span className="text-white font-black text-2xl md:text-3xl" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
                            {entry.name.charAt(0).toUpperCase()}
                          </span>
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: baseDelay + 0.6 }}
                          className="text-center mt-2 mb-1"
                        >
                          <p className="text-sm font-bold truncate max-w-[7rem]">{entry.name}</p>
                          <p className="font-black text-xl tabular-nums">
                            <AnimatedScore value={entry.score} delay={(baseDelay + 0.8) * 1000} />
                          </p>
                          <p className="text-xs text-muted-foreground">{entry.correctAnswers} to'g'ri</p>
                        </motion.div>

                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: config.height, opacity: 1 }}
                          transition={{ delay: baseDelay + 0.5, duration: 0.8, type: "spring", damping: 14 }}
                          className="w-28 md:w-36 rounded-t-xl relative overflow-hidden"
                          style={{ minHeight: 0, transformStyle: "preserve-3d" }}
                        >
                          <div className={`absolute inset-0 bg-gradient-to-t ${config.gradient}`} />
                          <div className="absolute inset-0 bg-gradient-to-r from-white/20 via-transparent to-transparent" />
                          <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/20 to-transparent" />
                          <div className="relative flex items-center justify-center h-full">
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: baseDelay + 1.0, type: "spring", damping: 8 }}
                              className={`text-white ${config.fontSize} font-black`}
                              style={{ textShadow: "0 4px 20px rgba(0,0,0,0.3)" }}
                            >
                              {pos + 1}
                            </motion.span>
                          </div>
                        </motion.div>
                      </motion.div>
                    );
                  })}
                </div>

                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 1.2, duration: 0.5 }}
                  className="h-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent mx-8"
                />
              </div>
            )}

            {leaderboard.length > 3 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} className="space-y-2">
                <h3 className="text-sm font-bold text-muted-foreground text-center uppercase tracking-wider mb-3">To'liq reyting</h3>
                {leaderboard.slice(3).map((entry, i) => {
                  const rank = i + 4;
                  return (
                    <motion.div key={entry.participantId} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.6 + i * 0.06, type: "spring", damping: 15 }}>
                      <Card className="p-3" data-testid={`card-rank-${rank}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center font-bold text-sm text-muted-foreground shrink-0 ring-1 ring-border">
                            {rank}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate text-sm">{entry.name}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold tabular-nums">
                              <AnimatedScore value={entry.score} delay={(1.6 + i * 0.06) * 1000} />
                            </p>
                            <p className="text-xs text-muted-foreground">{entry.correctAnswers} to'g'ri</p>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.0, type: "spring" }} className="flex gap-3 justify-center flex-wrap">
              <Button variant="outline" onClick={() => { setPhase("setup"); setSession(null); setParticipants([]); setLeaderboard([]); }} data-testid="button-new-session">
                Yangi sessiya
              </Button>
              <Button variant="outline" onClick={() => navigate("/teacher/results")} data-testid="button-view-results">
                <BarChart3 className="w-4 h-4 mr-1" /> Natijalarni ko'rish
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
