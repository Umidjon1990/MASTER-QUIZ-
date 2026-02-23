import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useParams, useLocation } from "wouter";
import { Loader2, Clock, CheckCircle, XCircle, ArrowRight, RotateCcw, Trophy, Home } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface ReplayQuestion {
  id: string;
  questionText: string;
  type: string;
  options: any;
  correctAnswer: string;
  points: number;
  timeLimit: number;
  mediaUrl?: string;
  mediaType?: string;
}

interface ReplayQuiz {
  id: string;
  title: string;
  description?: string;
  category?: string;
  totalQuestions: number;
  timePerQuestion: number;
  timerEnabled: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showCorrectAnswers: boolean;
  questions: ReplayQuestion[];
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function balancedShuffleReplayOptions(questions: ReplayQuestion[]): ReplayQuestion[] {
  if (!questions.length) return questions;
  const maxSlots = Math.max(...questions.filter(q => q.options && q.options.length >= 2).map(q => q.options!.length), 0);
  if (maxSlots === 0) return questions;
  const positionCounts = new Array(maxSlots).fill(0);

  return questions.map(q => {
    if (!q.options || q.options.length < 2 || !q.correctAnswer) return q;
    const opts = [...q.options];
    const correctIdx = opts.indexOf(q.correctAnswer);
    if (correctIdx === -1) return { ...q, options: shuffleArray(opts) };

    const correct = opts.splice(correctIdx, 1)[0];
    const shuffledWrong = shuffleArray(opts);
    const numSlots = shuffledWrong.length + 1;
    const relevantCounts = positionCounts.slice(0, numSlots);
    const minCount = Math.min(...relevantCounts);
    const leastUsed = relevantCounts.map((c, i) => ({ count: c, index: i })).filter(x => x.count === minCount).map(x => x.index);
    const targetPos = leastUsed[Math.floor(Math.random() * leastUsed.length)];
    positionCounts[targetPos]++;

    const result = [...shuffledWrong];
    result.splice(targetPos, 0, correct);
    return { ...q, options: result };
  });
}

export default function QuizReplay() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: quiz, isLoading, error } = useQuery<ReplayQuiz>({
    queryKey: ["/api/quizzes", id, "replay"],
    queryFn: async () => {
      const res = await fetch(`/api/quizzes/${id}/replay`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Xatolik");
      }
      return res.json();
    },
  });

  const [phase, setPhase] = useState<"intro" | "playing" | "review" | "results">("intro");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [preparedQuestions, setPreparedQuestions] = useState<ReplayQuestion[]>([]);

  const startQuiz = useCallback(() => {
    if (!quiz) return;
    let qs = [...quiz.questions];
    if (quiz.shuffleQuestions) qs = shuffleArray(qs);
    if (quiz.shuffleOptions) {
      qs = balancedShuffleReplayOptions(qs);
    }
    setPreparedQuestions(qs);
    setCurrentIndex(0);
    setAnswers({});
    setPhase("playing");
    const tl = qs[0]?.timeLimit || quiz.timePerQuestion || 30;
    setTimeLeft(quiz.timerEnabled ? tl : 0);
  }, [quiz]);

  useEffect(() => {
    if (phase !== "playing" || !quiz?.timerEnabled || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleNext();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, timeLeft, quiz?.timerEnabled]);

  const handleAnswer = (answer: string) => {
    setAnswers(prev => ({ ...prev, [currentIndex]: answer }));
  };

  const handleNext = () => {
    if (currentIndex < preparedQuestions.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      if (quiz?.timerEnabled) {
        setTimeLeft(preparedQuestions[nextIdx]?.timeLimit || quiz.timePerQuestion || 30);
      }
    } else {
      setPhase("results");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-8 text-center max-w-md">
          <XCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
          <h2 className="text-xl font-bold mb-2">Test topilmadi</h2>
          <p className="text-muted-foreground mb-4">{(error as Error)?.message || "Bu testni qayta yechish mumkin emas"}</p>
          <Button onClick={() => navigate("/")} data-testid="button-go-home">
            <Home className="w-4 h-4 mr-1" /> Bosh sahifaga
          </Button>
        </Card>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-8 max-w-md text-center">
            <RotateCcw className="w-12 h-12 text-primary mx-auto mb-3" />
            <h1 className="text-2xl font-bold mb-2" data-testid="text-replay-title">{quiz.title}</h1>
            {quiz.description && <p className="text-muted-foreground mb-3">{quiz.description}</p>}
            <div className="flex gap-2 justify-center mb-6 flex-wrap">
              <Badge>{quiz.totalQuestions} savol</Badge>
              {quiz.category && <Badge variant="secondary">{quiz.category}</Badge>}
              {quiz.timerEnabled && <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />{quiz.timePerQuestion}s</Badge>}
            </div>
            <Button className="w-full gradient-purple border-0" size="lg" onClick={startQuiz} data-testid="button-start-replay">
              Testni boshlash
            </Button>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (phase === "results") {
    let score = 0;
    let correct = 0;
    preparedQuestions.forEach((q, i) => {
      const userAnswer = answers[i];
      if (userAnswer && userAnswer === q.correctAnswer) {
        score += q.points || 10;
        correct++;
      }
    });
    const pct = preparedQuestions.length > 0 ? Math.round((correct / preparedQuestions.length) * 100) : 0;

    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="p-8 max-w-md text-center">
            <Trophy className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2" data-testid="text-result-title">Natijangiz</h1>
            <div className="text-5xl font-bold text-primary mb-2" data-testid="text-result-score">{score}</div>
            <p className="text-muted-foreground mb-4">
              {correct}/{preparedQuestions.length} to'g'ri ({pct}%)
            </p>
            <Progress value={pct} className="mb-6" />
            <div className="flex gap-2 justify-center flex-wrap">
              <Button onClick={() => setPhase("review")} variant="outline" data-testid="button-review-answers">
                <CheckCircle className="w-4 h-4 mr-1" /> Javoblarni ko'rish
              </Button>
              <Button onClick={startQuiz} className="gradient-purple border-0" data-testid="button-retry">
                <RotateCcw className="w-4 h-4 mr-1" /> Qayta yechish
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (phase === "review") {
    return (
      <div className="min-h-screen p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold" dir="auto">{quiz.title} — Javoblar</h1>
          <Button variant="outline" onClick={() => setPhase("results")} data-testid="button-back-results">
            Natijaga qaytish
          </Button>
        </div>
        <div className="space-y-4">
          {preparedQuestions.map((q, i) => {
            const userAnswer = answers[i];
            const isCorrect = userAnswer === q.correctAnswer;
            return (
              <Card key={i} className={`p-4 border-l-4 ${isCorrect ? "border-l-green-500" : "border-l-red-500"}`}>
                <div className="flex items-start gap-2 mb-2">
                  <span className="font-bold text-muted-foreground">{i + 1}.</span>
                  <p className="font-medium" dir="auto">{q.questionText}</p>
                </div>
                {q.mediaUrl && (
                  <img src={q.mediaUrl} alt="" className="max-h-40 rounded-md mb-2" />
                )}
                <div className="space-y-1 ml-5">
                  {Array.isArray(q.options) ? q.options.map((opt: any, j: number) => {
                    const optText = typeof opt === "string" ? opt : opt.text;
                    const isUserPick = userAnswer === optText;
                    const isCorrectOpt = q.correctAnswer === optText;
                    return (
                      <div key={j} className={`text-sm px-2 py-1 rounded ${isCorrectOpt ? "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 font-medium" : isUserPick ? "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400" : ""}`}>
                        {isCorrectOpt && <CheckCircle className="w-3 h-3 inline mr-1" />}
                        {isUserPick && !isCorrectOpt && <XCircle className="w-3 h-3 inline mr-1" />}
                        <span dir="auto">{optText}</span>
                      </div>
                    );
                  }) : (
                    <div className="text-sm">
                      <p>Sizning javobingiz: <span className={isCorrect ? "text-green-600 font-medium" : "text-red-600"} dir="auto">{userAnswer || "—"}</span></p>
                      <p>To'g'ri javob: <span className="text-green-600 font-medium" dir="auto">{q.correctAnswer}</span></p>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  const currentQ = preparedQuestions[currentIndex];
  if (!currentQ) return null;

  const progress = ((currentIndex + 1) / preparedQuestions.length) * 100;
  const hasRtl = (s: string) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s);
  const questionRtl = hasRtl(currentQ.questionText);

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{currentIndex + 1} / {preparedQuestions.length}</span>
          {quiz.timerEnabled && timeLeft > 0 && (
            <Badge variant={timeLeft <= 5 ? "destructive" : "secondary"} className="tabular-nums">
              <Clock className="w-3 h-3 mr-1" /> {timeLeft}s
            </Badge>
          )}
        </div>
        <Progress value={progress} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={currentIndex} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
          <Card className="p-6 mb-4">
            <h2 className={`text-lg font-semibold mb-4 ${questionRtl ? "text-right" : ""}`} dir={questionRtl ? "rtl" : "ltr"} data-testid="text-question">
              {currentQ.questionText}
            </h2>
            {currentQ.mediaUrl && (
              <img src={currentQ.mediaUrl} alt="" className="max-h-48 rounded-md mb-4 mx-auto" />
            )}
            <div className="space-y-2">
              {currentQ.type === "true_false" ? (
                <>
                  {["To'g'ri", "Noto'g'ri"].map(opt => (
                    <Button
                      key={opt}
                      variant={answers[currentIndex] === opt ? "default" : "outline"}
                      className="w-full justify-start text-left h-auto py-3 px-4"
                      onClick={() => handleAnswer(opt)}
                      data-testid={`button-answer-${opt}`}
                    >
                      {opt}
                    </Button>
                  ))}
                </>
              ) : Array.isArray(currentQ.options) ? (
                currentQ.options.map((opt: any, j: number) => {
                  const optText = typeof opt === "string" ? opt : opt.text;
                  const optRtl = hasRtl(optText);
                  return (
                    <Button
                      key={j}
                      variant={answers[currentIndex] === optText ? "default" : "outline"}
                      className={`w-full justify-start h-auto py-3 px-4 ${optRtl ? "text-right" : "text-left"}`}
                      dir={optRtl ? "rtl" : "ltr"}
                      onClick={() => handleAnswer(optText)}
                      data-testid={`button-answer-${j}`}
                    >
                      {optText}
                    </Button>
                  );
                })
              ) : (
                <input
                  type="text"
                  className="w-full border rounded-md px-4 py-3"
                  placeholder="Javobingizni yozing..."
                  value={answers[currentIndex] || ""}
                  onChange={(e) => handleAnswer(e.target.value)}
                  dir="auto"
                  data-testid="input-open-answer"
                />
              )}
            </div>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleNext} className="gradient-purple border-0" data-testid="button-next-question">
              {currentIndex < preparedQuestions.length - 1 ? (
                <>Keyingi <ArrowRight className="w-4 h-4 ml-1" /></>
              ) : (
                <>Tugatish <CheckCircle className="w-4 h-4 ml-1" /></>
              )}
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
