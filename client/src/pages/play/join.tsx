import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { io, Socket } from "socket.io-client";
import confetti from "canvas-confetti";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Play, Trophy, Clock, CheckCircle, X, Zap, Star, Music, Lock, BarChart3, Medal, Crown, Award, Flame, WifiOff, Loader2 } from "lucide-react";

let socket: Socket | null = null;

const optionColors = [
  "quiz-option-a",
  "quiz-option-b",
  "quiz-option-c",
  "quiz-option-d",
];

const PODIUM_CONFIG = [
  {
    gradient: "from-yellow-300 via-yellow-400 to-amber-500",
    glow: "0 0 40px rgba(251,191,36,0.5), 0 0 80px rgba(251,191,36,0.2)",
    avatarGradient: "from-yellow-300 to-amber-500",
    ringColor: "ring-yellow-400/80",
    height: 200,
    icon: Crown,
    iconSize: "w-10 h-10",
    iconColor: "text-yellow-400",
    avatarSize: "w-20 h-20",
    fontSize: "text-5xl",
    medalBg: "from-yellow-400 to-amber-500",
  },
  {
    gradient: "from-slate-300 via-gray-300 to-slate-400",
    glow: "0 0 30px rgba(148,163,184,0.4), 0 0 60px rgba(148,163,184,0.15)",
    avatarGradient: "from-slate-300 to-gray-400",
    ringColor: "ring-slate-300/80",
    height: 150,
    icon: Medal,
    iconSize: "w-8 h-8",
    iconColor: "text-slate-400",
    avatarSize: "w-16 h-16",
    fontSize: "text-4xl",
    medalBg: "from-gray-300 to-gray-400",
  },
  {
    gradient: "from-amber-500 via-amber-600 to-orange-700",
    glow: "0 0 25px rgba(217,119,6,0.4), 0 0 50px rgba(217,119,6,0.15)",
    avatarGradient: "from-amber-500 to-orange-700",
    ringColor: "ring-amber-600/80",
    height: 110,
    icon: Award,
    iconSize: "w-8 h-8",
    iconColor: "text-amber-600",
    avatarSize: "w-16 h-16",
    fontSize: "text-4xl",
    medalBg: "from-amber-600 to-amber-700",
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

export default function JoinPlay() {
  const { user } = useAuth();
  const { toast } = useToast();
  const searchParams = new URLSearchParams(window.location.search);
  const preCode = searchParams.get("code") || "";

  const [code, setCode] = useState(preCode);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [phase, setPhase] = useState<"join" | "waiting" | "question" | "result" | "leaderboard" | "finished">("join");
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [selectedMulti, setSelectedMulti] = useState<string[]>([]);
  const [answerResult, setAnswerResult] = useState<{ isCorrect: boolean; points: number; correctAnswer: string } | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTime, setTotalTime] = useState(30);
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [answered, setAnswered] = useState(false);
  const [myScore, setMyScore] = useState(0);
  const [myLiveRank, setMyLiveRank] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "reconnecting">("disconnected");
  const sessionIdRef = React.useRef(sessionId);
  const participantIdRef = React.useRef(participantId);
  const nameRef = React.useRef(name);
  sessionIdRef.current = sessionId;
  participantIdRef.current = participantId;
  nameRef.current = name;

  useEffect(() => {
    return () => {
      if (socket) { socket.disconnect(); socket = null; }
    };
  }, []);

  useEffect(() => {
    if (phase === "question" && timerEnabled && timeLeft > 0 && !answered) {
      const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft, phase, answered, timerEnabled]);

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
      setConnectionStatus("connected");
      if (sessionIdRef.current && participantIdRef.current) {
        socket?.emit("player:rejoin", {
          sessionId: sessionIdRef.current,
          participantId: participantIdRef.current,
          name: nameRef.current,
        });
      }
    });

    socket.on("disconnect", () => {
      setConnectionStatus("disconnected");
    });

    socket.io.on("reconnect_attempt", () => {
      setConnectionStatus("reconnecting");
    });

    socket.io.on("reconnect", () => {
      setConnectionStatus("connected");
    });

    socket.on("quiz:started", (data) => {
      setTotalQuestions(data.totalQuestions);
    });

    socket.on("question:show", (data) => {
      setCurrentQuestion(data.question);
      setQuestionIndex(data.index);
      setTotalQuestions(data.total);
      setPhase("question");
      setSelectedAnswer(null);
      setSelectedMulti([]);
      setAnswerResult(null);
      setAnswered(false);
      const hasTimer = data.timerEnabled !== false;
      setTimerEnabled(hasTimer);
      if (hasTimer && data.question.timeLimit > 0) {
        setTimeLeft(data.question.timeLimit);
        setTotalTime(data.question.timeLimit);
      } else {
        setTimeLeft(0);
        setTotalTime(0);
      }
    });

    socket.on("answer:result", (data) => {
      setAnswerResult(data);
      setPhase("result");
      if (data.rank) setMyLiveRank(data.rank);
      if (data.totalScore !== undefined) setMyScore(data.totalScore);
      if (data.totalPlayers) setTotalPlayers(data.totalPlayers);
      if (data.isCorrect) {
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
      }
    });

    socket.on("leaderboard:show", (data) => {
      const sorted = [...data.leaderboard].sort((a: any, b: any) => b.score - a.score).map((e: any, i: number) => ({ ...e, rank: i + 1 }));
      setLeaderboard(sorted);
      setPhase("leaderboard");
    });

    socket.on("quiz:finished", (data) => {
      const sorted = [...data.leaderboard].sort((a: any, b: any) => b.score - a.score).map((e: any, i: number) => ({ ...e, rank: i + 1 }));
      setLeaderboard(sorted);
      setPhase("finished");
      const myRank = sorted.find((e: any) => e.participantId === participantId);
      if (myRank) setMyScore(myRank.score);
      if (myRank && myRank.rank <= 3) {
        setTimeout(() => {
          confetti({ particleCount: 300, spread: 120, origin: { y: 0.4 }, colors: ["#FFD700", "#C0C0C0", "#CD7F32"] });
          setTimeout(() => confetti({ particleCount: 150, spread: 80, origin: { x: 0.2, y: 0.5 }, colors: ["#FFD700", "#FFA500"] }), 500);
          setTimeout(() => confetti({ particleCount: 150, spread: 80, origin: { x: 0.8, y: 0.5 }, colors: ["#C0C0C0", "#B87333"] }), 1000);
        }, 800);
      }
    });

    return socket;
  }, [participantId]);

  const joinSession = async () => {
    if (code.length !== 6 || !name.trim()) {
      toast({ title: "Kod va ismingizni kiriting", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch("/api/sessions/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, guestName: name, userId: user?.id, password: password || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        if (err.requiresPassword) {
          setRequiresPassword(true);
          toast({ title: "Bu sessiya parol bilan himoyalangan", variant: "destructive" });
          return;
        }
        toast({ title: err.message || "Xatolik", variant: "destructive" });
        return;
      }
      const data = await res.json();
      setSessionId(data.session.id);
      setParticipantId(data.participant.id);
      setPhase("waiting");

      const s = connectSocket();
      s.emit("player:join", {
        sessionId: data.session.id,
        participantId: data.participant.id,
        name,
      });
    } catch {
      toast({ title: "Sessiyaga qo'shilishda xatolik", variant: "destructive" });
    }
  };

  const submitAnswer = (answer: string) => {
    if (answered || !socket || !currentQuestion) return;
    setSelectedAnswer(answer);
    setAnswered(true);
    const timeSpent = timerEnabled ? totalTime - timeLeft : 0;
    socket.emit("player:answer", {
      sessionId,
      participantId,
      questionId: currentQuestion.id,
      answer,
      timeSpent,
    });
  };

  const toggleMultiOption = (option: string) => {
    if (answered) return;
    setSelectedMulti((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]
    );
  };

  const submitMultiAnswer = () => {
    if (answered || !socket || !currentQuestion || selectedMulti.length === 0) return;
    setAnswered(true);
    const timeSpent = timerEnabled ? totalTime - timeLeft : 0;
    socket.emit("player:answer", {
      sessionId,
      participantId,
      questionId: currentQuestion.id,
      answer: selectedMulti.join(","),
      timeSpent,
    });
  };

  const myRankEntry = leaderboard.find((e) => e.participantId === participantId);
  const myRank = myRankEntry?.rank || 0;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {phase !== "join" && connectionStatus !== "connected" && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/30 border-b border-yellow-500/30 text-yellow-700 dark:text-yellow-400"
          data-testid="banner-player-connection"
        >
          {connectionStatus === "reconnecting" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span className="text-sm font-medium">Qayta ulanilmoqda...</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">Ulanish uzildi...</span>
            </>
          )}
        </motion.div>
      )}
      <AnimatePresence mode="wait">
        {phase === "join" && (
          <motion.div key="join" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="w-full max-w-md">
            <Card className="p-8 space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 rounded-md gradient-purple flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold" data-testid="text-join-title">Quizga Qo'shilish</h1>
                <p className="text-muted-foreground">Kod va ismingizni kiriting</p>
              </div>
              <div className="space-y-4">
                <Input
                  placeholder="6-raqamli kod"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="text-center text-2xl font-mono tracking-[0.3em] h-14"
                  maxLength={6}
                  data-testid="input-code"
                />
                <Input
                  placeholder="Ismingiz"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-center h-12"
                  data-testid="input-name"
                />
                {requiresPassword && (
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1 text-sm">
                      <Lock className="w-3.5 h-3.5" /> Sessiya paroli
                    </Label>
                    <Input
                      type="password"
                      placeholder="Parolni kiriting"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="text-center h-12"
                      data-testid="input-password"
                    />
                  </div>
                )}
                <Button className="w-full gradient-purple border-0" onClick={joinSession} disabled={code.length !== 6 || !name.trim() || (requiresPassword && !password)} data-testid="button-join">
                  <Play className="w-5 h-5 mr-2" /> Qo'shilish
                </Button>
              </div>
            </Card>
          </motion.div>
        )}

        {phase === "waiting" && (
          <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center space-y-6">
            <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }}>
              <div className="w-24 h-24 rounded-full gradient-purple flex items-center justify-center mx-auto animate-pulse-glow">
                <Zap className="w-12 h-12 text-white" />
              </div>
            </motion.div>
            <h2 className="text-2xl font-bold">Kutilmoqda...</h2>
            <p className="text-muted-foreground">O'qituvchi quizni boshlaguncha kuting</p>
            <p className="text-sm text-muted-foreground">{name} sifatida kirildi</p>
          </motion.div>
        )}

        {phase === "question" && currentQuestion && (
          <motion.div key={`q-${questionIndex}`} initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -100 }} className="w-full max-w-2xl space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <Badge variant="secondary" className="text-base px-3 py-1">{questionIndex + 1}/{totalQuestions}</Badge>
              {timerEnabled && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className={`font-mono font-bold text-lg ${timeLeft <= 5 ? "text-red-500" : ""}`} data-testid="text-time-left">{timeLeft}s</span>
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {currentQuestion.type === "poll" && (
                  <Badge variant="outline" data-testid="badge-poll"><BarChart3 className="w-3 h-3 mr-1" />So'rovnoma</Badge>
                )}
                <Badge className="gradient-purple border-0">{currentQuestion.points} ball</Badge>
              </div>
            </div>

            {timerEnabled && totalTime > 0 && (
              <Progress value={(timeLeft / totalTime) * 100} className="h-2" data-testid="progress-timer" />
            )}

            <Card className="p-6 text-center space-y-3">
              <h2 className="text-xl md:text-2xl font-bold" data-testid="text-question">{currentQuestion.questionText}</h2>
              {currentQuestion.type === "poll" && (
                <p className="text-sm text-muted-foreground">Ball berilmaydi — faqat fikringizni bildiring</p>
              )}
              {currentQuestion.type === "multiple_select" && (
                <p className="text-sm text-muted-foreground">Bir nechta javobni tanlang</p>
              )}
              {currentQuestion.mediaUrl && currentQuestion.mediaType === "video" && (
                <video src={currentQuestion.mediaUrl} controls className="rounded-md max-h-56 w-full object-contain bg-black mx-auto" data-testid="play-media-video" />
              )}
              {currentQuestion.mediaUrl && currentQuestion.mediaType === "audio" && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md justify-center">
                  <Music className="w-5 h-5 text-muted-foreground shrink-0" />
                  <audio src={currentQuestion.mediaUrl} controls className="w-full max-w-sm h-8" data-testid="play-media-audio" />
                </div>
              )}
              {currentQuestion.mediaUrl && currentQuestion.mediaType === "image" && (
                <img src={currentQuestion.mediaUrl} alt="Savol rasmi" className="rounded-md max-h-56 object-contain mx-auto" data-testid="play-media-image" />
              )}
            </Card>

            {(currentQuestion.type === "multiple_choice" || currentQuestion.type === "poll") && currentQuestion.options && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(currentQuestion.options as string[]).map((opt: string, i: number) => (
                  <motion.button
                    key={i}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => submitAnswer(opt)}
                    disabled={answered}
                    className={`p-5 rounded-md text-white font-semibold text-lg text-left transition-all ${optionColors[i % optionColors.length]} ${
                      answered && selectedAnswer === opt ? "ring-4 ring-white/50" : ""
                    } ${answered ? "opacity-70" : ""}`}
                    data-testid={`button-option-${i}`}
                  >
                    <span className="mr-2 font-bold">{String.fromCharCode(65 + i)}.</span>
                    {opt}
                  </motion.button>
                ))}
              </div>
            )}

            {currentQuestion.type === "multiple_select" && currentQuestion.options && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(currentQuestion.options as string[]).map((opt: string, i: number) => {
                    const isSelected = selectedMulti.includes(opt);
                    return (
                      <motion.button
                        key={i}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toggleMultiOption(opt)}
                        disabled={answered}
                        className={`p-5 rounded-md text-white font-semibold text-lg text-left transition-all ${optionColors[i % optionColors.length]} ${
                          isSelected ? "ring-4 ring-white/50" : ""
                        } ${answered ? "opacity-70" : ""}`}
                        data-testid={`button-multi-option-${i}`}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox checked={isSelected} className="border-white data-[state=checked]:bg-white data-[state=checked]:text-black" />
                          <span><span className="mr-2 font-bold">{String.fromCharCode(65 + i)}.</span>{opt}</span>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
                <Button className="w-full gradient-teal border-0 text-lg" onClick={submitMultiAnswer} disabled={answered || selectedMulti.length === 0} data-testid="button-submit-multi">
                  Javobni yuborish ({selectedMulti.length} tanlangan)
                </Button>
              </div>
            )}

            {currentQuestion.type === "true_false" && (
              <div className="grid grid-cols-2 gap-4">
                {["To'g'ri", "Noto'g'ri"].map((opt, i) => (
                  <motion.button
                    key={opt}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => submitAnswer(opt.toLowerCase() === "to'g'ri" ? "true" : "false")}
                    disabled={answered}
                    className={`p-6 rounded-md text-white font-bold text-xl ${i === 0 ? "quiz-option-d" : "quiz-option-a"} ${answered ? "opacity-70" : ""}`}
                    data-testid={`button-tf-${i}`}
                  >
                    {opt}
                  </motion.button>
                ))}
              </div>
            )}

            {currentQuestion.type === "open_ended" && (
              <div className="space-y-3">
                <Input
                  placeholder="Javobingizni yozing..."
                  value={selectedAnswer || ""}
                  onChange={(e) => !answered && setSelectedAnswer(e.target.value)}
                  className="text-center text-lg h-14"
                  data-testid="input-open-answer"
                />
                <Button className="w-full gradient-purple border-0" onClick={() => selectedAnswer && submitAnswer(selectedAnswer)} disabled={answered || !selectedAnswer} data-testid="button-submit-open">
                  Javobni yuborish
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {phase === "result" && answerResult && (
          <motion.div key="result" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-center space-y-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 10 }}
              className={`w-32 h-32 rounded-full flex items-center justify-center mx-auto ${answerResult.isCorrect ? "gradient-teal" : "bg-destructive"}`}
            >
              {answerResult.isCorrect ? <CheckCircle className="w-16 h-16 text-white" /> : <X className="w-16 h-16 text-white" />}
            </motion.div>
            <h2 className="text-3xl font-bold">{answerResult.isCorrect ? "To'g'ri!" : "Noto'g'ri"}</h2>
            {answerResult.isCorrect && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-2xl font-bold text-gradient">
                +{answerResult.points} ball
              </motion.p>
            )}
            {!answerResult.isCorrect && (
              <p className="text-muted-foreground">To'g'ri javob: <span className="font-semibold">{answerResult.correctAnswer}</span></p>
            )}
            <p className="text-muted-foreground">Keyingi savolni kuting...</p>
          </motion.div>
        )}

        {phase === "leaderboard" && (
          <motion.div key="lb" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-4">
            <div className="text-center mb-4">
              <Trophy className="w-10 h-10 text-yellow-500 mx-auto mb-2" />
              <h2 className="text-2xl font-bold">Reyting</h2>
              <p className="text-lg font-semibold text-gradient">Sizning ballingiz: {myScore}</p>
            </div>
            {leaderboard.slice(0, 10).map((entry, i) => {
              const isMe = entry.participantId === participantId;
              return (
                <motion.div key={entry.participantId} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
                  <Card className={`p-3 ${isMe ? "ring-2 ring-purple-500" : ""}`} data-testid={`card-lb-${i}`}>
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
                        <p className={`font-semibold truncate ${isMe ? "text-gradient" : ""}`}>
                          {entry.name} {isMe ? "(Siz)" : ""}
                        </p>
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
          </motion.div>
        )}

        {phase === "finished" && (
          <motion.div key="finished" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-2xl space-y-6">
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
              <h2 className="text-3xl font-bold mb-1" data-testid="text-final-title">Yakuniy Natijalar</h2>
              <p className="text-muted-foreground">
                Sizning o'rningiz: <span className="font-bold text-foreground">{myRank}-o'rin</span> — <span className="font-bold text-gradient">{myScore} ball</span>
              </p>
            </motion.div>

            {leaderboard.length >= 1 && (
              <div className="relative" data-testid="podium-container" style={{ perspective: "1000px" }}>
                <div className="flex items-end justify-center gap-2 md:gap-4 pt-8 pb-2 px-2">
                  {PODIUM_ORDER.map((pos) => {
                    const entry = leaderboard[pos];
                    if (!entry) return <div key={pos} className="w-24 md:w-32" />;
                    const config = PODIUM_CONFIG[pos];
                    const IconComp = config.icon;
                    const isMe = entry.participantId === participantId;
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
                            <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}>
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
                          className={`${config.avatarSize} rounded-full bg-gradient-to-br ${config.avatarGradient} flex items-center justify-center ${isMe ? "ring-4 ring-purple-500" : `ring-4 ${config.ringColor}`} relative`}
                          style={{ boxShadow: isMe ? "0 0 30px rgba(168,85,247,0.5)" : config.glow }}
                        >
                          <span className="text-white font-black text-xl md:text-2xl" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
                            {entry.name.charAt(0).toUpperCase()}
                          </span>
                        </motion.div>

                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: baseDelay + 0.6 }} className="text-center mt-2 mb-1">
                          <p className={`text-sm font-bold truncate max-w-[6rem] ${isMe ? "text-gradient" : ""}`}>{entry.name}</p>
                          <p className="font-black text-lg tabular-nums">
                            <AnimatedScore value={entry.score} delay={(baseDelay + 0.8) * 1000} />
                          </p>
                        </motion.div>

                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: config.height, opacity: 1 }}
                          transition={{ delay: baseDelay + 0.5, duration: 0.8, type: "spring", damping: 14 }}
                          className="w-24 md:w-32 rounded-t-xl relative overflow-hidden"
                          style={{ minHeight: 0 }}
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
                <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 1.2, duration: 0.5 }} className="h-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent mx-8" />
              </div>
            )}

            {myRank <= 3 && myRank >= 1 && (
              <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.5 }} className="text-center" data-testid="text-medal-message">
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-to-r ${PODIUM_CONFIG[myRank - 1].medalBg} text-white font-bold shadow-lg`}>
                  <Flame className="w-5 h-5" />
                  {myRank === 1 ? "Tabriklaymiz! Siz g'olib bo'ldingiz!" : myRank === 2 ? "Ajoyib! 2-o'rin!" : "Zo'r! 3-o'rin!"}
                  <Flame className="w-5 h-5" />
                </div>
              </motion.div>
            )}

            {leaderboard.length > 3 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} className="space-y-2">
                <h3 className="text-sm font-bold text-muted-foreground text-center uppercase tracking-wider mb-3">To'liq reyting</h3>
                {leaderboard.slice(3).map((entry, i) => {
                  const isMe = entry.participantId === participantId;
                  const rank = i + 4;
                  return (
                    <motion.div key={entry.participantId} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.6 + i * 0.06, type: "spring", damping: 15 }}>
                      <Card className={`p-3 ${isMe ? "ring-2 ring-purple-500" : ""}`} data-testid={`card-rank-${rank}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center font-bold text-sm text-muted-foreground shrink-0 ring-1 ring-border">
                            {rank}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold truncate text-sm ${isMe ? "text-gradient" : ""}`}>
                              {entry.name} {isMe ? "(Siz)" : ""}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold">{entry.score}</p>
                            <p className="text-xs text-muted-foreground">{entry.correctAnswers} to'g'ri</p>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}>
              <Button variant="outline" className="w-full" onClick={() => window.location.href = "/"} data-testid="button-go-home">
                Bosh sahifaga qaytish
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {myLiveRank > 0 && (phase === "question" || phase === "result") && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50"
          data-testid="text-live-rank-indicator"
        >
          <div className="flex items-center gap-3 px-5 py-2.5 rounded-md bg-background/90 backdrop-blur-sm border shadow-lg">
            <div className="flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-yellow-500" />
              <span className="text-sm">Siz <span className="font-bold text-lg tabular-nums">{myLiveRank}</span>-o'rindasiz</span>
            </div>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-orange-500" />
              <span className="font-bold text-lg tabular-nums">{myScore}</span>
              <span className="text-sm text-muted-foreground">ball</span>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
