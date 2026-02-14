import { useState, useEffect, useCallback } from "react";
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
import { Play, Trophy, Clock, CheckCircle, X, Zap, Star, Music, Lock, BarChart3, Medal, Crown, Award, Flame } from "lucide-react";

let socket: Socket | null = null;

const optionColors = [
  "quiz-option-a",
  "quiz-option-b",
  "quiz-option-c",
  "quiz-option-d",
];

const MEDAL_STYLES = [
  { bg: "from-yellow-400 to-amber-500", ring: "ring-yellow-400/60", text: "text-yellow-400", label: "Oltin", shadow: "shadow-yellow-400/30" },
  { bg: "from-gray-300 to-gray-400", ring: "ring-gray-300/60", text: "text-gray-300", label: "Kumush", shadow: "shadow-gray-300/30" },
  { bg: "from-amber-600 to-amber-700", ring: "ring-amber-600/60", text: "text-amber-600", label: "Bronza", shadow: "shadow-amber-600/30" },
];

const PODIUM_HEIGHTS = [160, 200, 120];
const PODIUM_ORDER = [1, 0, 2];

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
    socket = io({ path: "/socket.io" });

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
              const medal = MEDAL_STYLES[i];
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
                        {i < 3 && medal && (
                          <span className={`text-xs font-medium ${medal.text}`}>{medal.label}</span>
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
              <div className="flex items-end justify-center gap-3 md:gap-6 pt-4 pb-2" data-testid="podium-container">
                {PODIUM_ORDER.map((pos) => {
                  const entry = leaderboard[pos];
                  if (!entry) return <div key={pos} className="w-24 md:w-28" />;
                  const medal = MEDAL_STYLES[pos];
                  const isMe = entry.participantId === participantId;
                  const height = PODIUM_HEIGHTS[pos];
                  return (
                    <motion.div
                      key={pos}
                      initial={{ opacity: 0, y: 60 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: pos === 0 ? 0.6 : pos === 1 ? 0.3 : 0.9, type: "spring", damping: 12 }}
                      className="flex flex-col items-center"
                      data-testid={`podium-place-${pos + 1}`}
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: pos === 0 ? 0.8 : pos === 1 ? 0.5 : 1.1, type: "spring" }}
                        className="mb-2"
                      >
                        {pos === 0 && <Crown className="w-8 h-8 text-yellow-400 mx-auto drop-shadow-lg" />}
                        {pos === 1 && <Medal className="w-7 h-7 text-gray-400 mx-auto" />}
                        {pos === 2 && <Award className="w-7 h-7 text-amber-600 mx-auto" />}
                      </motion.div>

                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: pos === 0 ? 0.9 : pos === 1 ? 0.6 : 1.2, type: "spring" }}
                        className={`w-14 h-14 md:w-16 md:h-16 rounded-full bg-gradient-to-br ${medal.bg} flex items-center justify-center shadow-lg ${medal.shadow} ${isMe ? "ring-4 ring-purple-500" : `ring-2 ${medal.ring}`}`}
                      >
                        <span className="text-white font-bold text-lg md:text-xl">{entry.name.charAt(0).toUpperCase()}</span>
                      </motion.div>

                      <p className={`text-sm font-semibold mt-1.5 truncate max-w-[5.5rem] text-center ${isMe ? "text-gradient" : ""}`}>
                        {entry.name}
                      </p>
                      <p className="font-bold text-lg">{entry.score}</p>

                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height }}
                        transition={{ delay: pos === 0 ? 1.0 : pos === 1 ? 0.7 : 1.3, duration: 0.6, type: "spring" }}
                        className={`w-24 md:w-28 rounded-t-md bg-gradient-to-t ${medal.bg} flex items-start justify-center pt-3 mt-1`}
                        style={{ minHeight: 0 }}
                      >
                        <span className="text-white text-3xl md:text-4xl font-black drop-shadow">{pos + 1}</span>
                      </motion.div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {myRank <= 3 && myRank >= 1 && (
              <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.5 }} className="text-center" data-testid="text-medal-message">
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-to-r ${MEDAL_STYLES[myRank - 1].bg} text-white font-bold shadow-lg`}>
                  <Flame className="w-5 h-5" />
                  {myRank === 1 ? "Tabriklaymiz! Siz g'olib bo'ldingiz!" : myRank === 2 ? "Ajoyib! 2-o'rin!" : "Zo'r! 3-o'rin!"}
                  <Flame className="w-5 h-5" />
                </div>
              </motion.div>
            )}

            {leaderboard.length > 3 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground text-center">To'liq reyting</h3>
                {leaderboard.slice(3).map((entry, i) => {
                  const isMe = entry.participantId === participantId;
                  const rank = i + 4;
                  return (
                    <motion.div key={entry.participantId} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.4 + i * 0.05 }}>
                      <Card className={`p-3 ${isMe ? "ring-2 ring-purple-500" : ""}`} data-testid={`card-rank-${rank}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm text-muted-foreground shrink-0">
                            {rank}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium truncate text-sm ${isMe ? "text-gradient" : ""}`}>
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
              </div>
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
