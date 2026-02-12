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
import { Play, Trophy, Clock, CheckCircle, X, Zap, Star, Music, Lock } from "lucide-react";

let socket: Socket | null = null;

const optionColors = [
  "quiz-option-a",
  "quiz-option-b",
  "quiz-option-c",
  "quiz-option-d",
];

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
  const [answerResult, setAnswerResult] = useState<{ isCorrect: boolean; points: number; correctAnswer: string } | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTime, setTotalTime] = useState(30);
  const [answered, setAnswered] = useState(false);
  const [myScore, setMyScore] = useState(0);

  useEffect(() => {
    return () => {
      if (socket) { socket.disconnect(); socket = null; }
    };
  }, []);

  useEffect(() => {
    if (phase === "question" && timeLeft > 0 && !answered) {
      const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft, phase, answered]);

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
      setAnswerResult(null);
      setAnswered(false);
      setTimeLeft(data.question.timeLimit);
      setTotalTime(data.question.timeLimit);
    });

    socket.on("answer:result", (data) => {
      setAnswerResult(data);
      setPhase("result");
      if (data.isCorrect) {
        setMyScore((s) => s + data.points);
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
      }
    });

    socket.on("leaderboard:show", (data) => {
      setLeaderboard(data.leaderboard);
      setPhase("leaderboard");
    });

    socket.on("quiz:finished", (data) => {
      setLeaderboard(data.leaderboard);
      setPhase("finished");
      const myRank = data.leaderboard.find((e: any) => e.participantId === participantId);
      if (myRank && myRank.rank <= 3) {
        confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 } });
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
    const timeSpent = totalTime - timeLeft;
    socket.emit("player:answer", {
      sessionId,
      participantId,
      questionId: currentQuestion.id,
      answer,
      timeSpent,
    });
  };

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
                <Button className="w-full h-12 gradient-purple border-0 text-lg" onClick={joinSession} disabled={code.length !== 6 || !name.trim() || (requiresPassword && !password)} data-testid="button-join">
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
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className={`font-mono font-bold text-lg ${timeLeft <= 5 ? "text-red-500" : ""}`}>{timeLeft}s</span>
              </div>
              <Badge className="gradient-purple border-0">{currentQuestion.points} ball</Badge>
            </div>

            <Progress value={(timeLeft / totalTime) * 100} className="h-2" />

            <Card className="p-6 text-center space-y-3">
              <h2 className="text-xl md:text-2xl font-bold" data-testid="text-question">{currentQuestion.questionText}</h2>
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

            {currentQuestion.type === "multiple_choice" && currentQuestion.options && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(currentQuestion.options as string[]).map((opt: string, i: number) => (
                  <motion.button
                    key={i}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => submitAnswer(opt)}
                    disabled={answered}
                    className={`p-5 rounded-md text-white font-semibold text-lg text-left transition-all ${optionColors[i]} ${
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

        {(phase === "leaderboard" || phase === "finished") && (
          <motion.div key="lb" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-4">
            <div className="text-center mb-6">
              <Trophy className="w-12 h-12 text-yellow-500 mx-auto mb-2" />
              <h2 className="text-2xl font-bold">{phase === "finished" ? "Yakuniy Natijalar" : "Reyting"}</h2>
              <p className="text-lg font-semibold text-gradient">Sizning ballingiz: {myScore}</p>
            </div>
            {leaderboard.map((entry, i) => {
              const isMe = entry.participantId === participantId;
              return (
                <motion.div key={entry.participantId} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}>
                  <Card className={`p-4 ${isMe ? "ring-2 ring-purple-500" : ""}`} data-testid={`card-lb-${i}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${i === 0 ? "gradient-orange" : i === 1 ? "gradient-purple" : i === 2 ? "gradient-teal" : "bg-muted text-muted-foreground"}`}>
                        {i === 0 ? <Star className="w-5 h-5" /> : entry.rank}
                      </div>
                      <div className="flex-1">
                        <p className={`font-semibold ${isMe ? "text-gradient" : ""}`}>{entry.name} {isMe ? "(Siz)" : ""}</p>
                      </div>
                      <p className="text-xl font-bold">{entry.score}</p>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
            {phase === "finished" && (
              <Button variant="outline" className="w-full" onClick={() => window.location.href = "/"} data-testid="button-go-home">
                Bosh sahifaga qaytish
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
