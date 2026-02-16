import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  ChevronLeft,
  Send,
  Trophy,
  RotateCcw,
  Share2,
  Home,
  ArrowLeft,
  Copy,
  Check,
} from "lucide-react";

interface QuizQuestion {
  id: string;
  questionText: string;
  type: string;
  options: string[] | null;
  points: number;
  timeLimit: number;
  mediaUrl: string | null;
  mediaType: string | null;
}

interface QuizData {
  quiz: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    totalQuestions: number;
  };
  questions: QuizQuestion[];
}

interface SubmitResult {
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  playerName: string;
  results: Record<string, { answer: string | string[]; isCorrect: boolean; correctAnswer: string; points: number }>;
}

export default function QuizPlayPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [stage, setStage] = useState<"name" | "playing" | "result">("name");
  const [playerName, setPlayerName] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const { data, isLoading, error } = useQuery<QuizData>({
    queryKey: ["/api/quizzes", id, "play"],
    queryFn: async () => {
      const res = await fetch(`/api/quizzes/${id}/play`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Quiz topilmadi");
      }
      return res.json();
    },
    enabled: !!id,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/quizzes/${id}/submit-public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, playerName }),
      });
      if (!res.ok) throw new Error("Yuborishda xatolik");
      return res.json() as Promise<SubmitResult>;
    },
    onSuccess: (result) => {
      setSubmitResult(result);
      setStage("result");
    },
    onError: () => {
      toast({ title: "Yuborishda xatolik yuz berdi", variant: "destructive" });
    },
  });

  const currentQuestion = data?.questions?.[currentIndex];

  useEffect(() => {
    if (stage !== "playing" || !currentQuestion) return;
    setTimeLeft(currentQuestion.timeLimit || 30);
  }, [currentIndex, stage, currentQuestion]);

  useEffect(() => {
    if (stage !== "playing" || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [stage, timeLeft > 0]);

  const handleAnswer = useCallback(
    (questionId: string, answer: string) => {
      if (!currentQuestion) return;
      if (currentQuestion.type === "multiple_select") {
        setAnswers((prev) => {
          const current = Array.isArray(prev[questionId]) ? (prev[questionId] as string[]) : [];
          const updated = current.includes(answer) ? current.filter((a) => a !== answer) : [...current, answer];
          return { ...prev, [questionId]: updated };
        });
      } else {
        setAnswers((prev) => ({ ...prev, [questionId]: answer }));
      }
    },
    [currentQuestion]
  );

  const goNext = () => {
    if (!data) return;
    if (currentIndex < data.questions.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  };

  const handleSubmit = () => {
    submitMutation.mutate();
  };

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      toast({ title: "Link nusxalandi!" });
    });
  };

  const handlePlayAgain = () => {
    setStage("name");
    setCurrentIndex(0);
    setAnswers({});
    setSubmitResult(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-8 w-full max-w-md space-y-4">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-10 w-full" />
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-8 w-full max-w-md text-center space-y-4">
          <XCircle className="w-12 h-12 mx-auto text-destructive" />
          <h2 className="text-lg font-semibold">Quiz topilmadi</h2>
          <p className="text-sm text-muted-foreground">Bu quiz mavjud emas yoki ommaviy emas</p>
          <Button onClick={() => navigate("/discover")} data-testid="button-go-discover">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Discoverga qaytish
          </Button>
        </Card>
      </div>
    );
  }

  if (stage === "name") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted/30">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="p-8 w-full max-w-md space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold" data-testid="text-quiz-title">{data.quiz.title}</h1>
              {data.quiz.description && (
                <p className="text-sm text-muted-foreground">{data.quiz.description}</p>
              )}
              <div className="flex gap-2 justify-center flex-wrap">
                {data.quiz.category && <Badge variant="secondary">{data.quiz.category}</Badge>}
                <Badge variant="outline">{data.quiz.totalQuestions} savol</Badge>
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium">Ismingiz</label>
              <Input
                placeholder="Ismingizni kiriting"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                data-testid="input-player-name"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && playerName.trim()) {
                    setStage("playing");
                  }
                }}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate("/discover")} data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Orqaga
              </Button>
              <Button
                className="flex-1"
                onClick={() => setStage("playing")}
                disabled={!playerName.trim()}
                data-testid="button-start-quiz"
              >
                Boshlash
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (stage === "result" && submitResult) {
    const percentage = Math.round((submitResult.correctAnswers / submitResult.totalQuestions) * 100);
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted/30">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg">
          <Card className="p-8 space-y-6">
            <div className="text-center space-y-3">
              <Trophy className="w-16 h-16 mx-auto text-yellow-500" />
              <h1 className="text-2xl font-bold" data-testid="text-result-title">Natijalar</h1>
              <p className="text-muted-foreground">{submitResult.playerName}</p>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-3xl font-bold text-primary" data-testid="text-score">{submitResult.score}</p>
                <p className="text-xs text-muted-foreground">Ball</p>
              </div>
              <div>
                <p className="text-3xl font-bold" data-testid="text-correct">{submitResult.correctAnswers}/{submitResult.totalQuestions}</p>
                <p className="text-xs text-muted-foreground">To'g'ri</p>
              </div>
              <div>
                <p className="text-3xl font-bold" data-testid="text-percentage">{percentage}%</p>
                <p className="text-xs text-muted-foreground">Foiz</p>
              </div>
            </div>
            <Progress value={percentage} className="h-3" />

            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {data.questions.map((q, i) => {
                const r = submitResult.results[q.id];
                if (!r) return null;
                return (
                  <div key={q.id} className={`p-3 rounded-md border ${r.isCorrect ? "border-green-500/30 bg-green-50/50 dark:bg-green-950/20" : "border-red-500/30 bg-red-50/50 dark:bg-red-950/20"}`}>
                    <div className="flex items-start gap-2">
                      {r.isCorrect ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{i + 1}. {q.questionText}</p>
                        {!r.isCorrect && r.correctAnswer && (
                          <p className="text-xs text-muted-foreground mt-1">To'g'ri javob: {r.correctAnswer}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 flex-wrap">
              <Button variant="outline" onClick={handlePlayAgain} data-testid="button-play-again">
                <RotateCcw className="w-4 h-4 mr-2" />
                Qayta o'ynash
              </Button>
              <Button variant="outline" onClick={handleCopyLink} data-testid="button-share-result">
                {linkCopied ? <Check className="w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
                {linkCopied ? "Nusxalandi" : "Link ulashish"}
              </Button>
              <Button onClick={() => navigate("/discover")} data-testid="button-discover">
                <Home className="w-4 h-4 mr-2" />
                Discover
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const isLastQuestion = currentIndex === data.questions.length - 1;
  const currentAnswer = answers[currentQuestion.id];
  const progressPercent = ((currentIndex + 1) / data.questions.length) * 100;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background to-muted/30">
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b p-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="shrink-0">{currentIndex + 1}/{data.questions.length}</Badge>
            <span className="text-sm font-medium truncate">{data.quiz.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className={`text-sm font-mono font-bold ${timeLeft <= 5 ? "text-red-500" : ""}`}>{timeLeft}s</span>
          </div>
        </div>
        <div className="max-w-2xl mx-auto mt-2">
          <Progress value={progressPercent} className="h-1.5" />
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="w-full max-w-2xl"
          >
            <Card className="p-6 space-y-5">
              {currentQuestion.mediaUrl && (
                <div className="rounded-md overflow-hidden">
                  {currentQuestion.mediaType === "image" ? (
                    <img src={currentQuestion.mediaUrl} alt="" className="w-full max-h-64 object-contain" />
                  ) : currentQuestion.mediaType === "video" ? (
                    <video src={currentQuestion.mediaUrl} controls className="w-full max-h-64" />
                  ) : null}
                </div>
              )}

              <div>
                <p className="text-lg font-semibold" data-testid="text-question">{currentQuestion.questionText}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className="text-xs">{currentQuestion.points} ball</Badge>
                  {currentQuestion.type === "multiple_select" && (
                    <Badge variant="outline" className="text-xs">Bir nechta tanlang</Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {currentQuestion.type === "true_false" ? (
                  <div className="grid grid-cols-2 gap-3">
                    {["true", "false"].map((opt) => (
                      <Button
                        key={opt}
                        variant={currentAnswer === opt ? "default" : "outline"}
                        className="h-14 text-base"
                        onClick={() => handleAnswer(currentQuestion.id, opt)}
                        data-testid={`button-answer-${opt}`}
                      >
                        {opt === "true" ? "To'g'ri" : "Noto'g'ri"}
                      </Button>
                    ))}
                  </div>
                ) : currentQuestion.type === "open_ended" ? (
                  <Input
                    placeholder="Javobingizni yozing..."
                    value={(currentAnswer as string) || ""}
                    onChange={(e) => handleAnswer(currentQuestion.id, e.target.value)}
                    data-testid="input-open-answer"
                  />
                ) : currentQuestion.options ? (
                  <div className="space-y-2">
                    {currentQuestion.options.map((opt, optIdx) => {
                      const isSelected = currentQuestion.type === "multiple_select"
                        ? Array.isArray(currentAnswer) && currentAnswer.includes(opt)
                        : currentAnswer === opt;
                      return (
                        <Button
                          key={optIdx}
                          variant={isSelected ? "default" : "outline"}
                          className="w-full justify-start text-left h-auto min-h-[2.75rem] py-3 px-4"
                          onClick={() => handleAnswer(currentQuestion.id, opt)}
                          data-testid={`button-option-${optIdx}`}
                        >
                          <span className="mr-3 font-semibold shrink-0">{String.fromCharCode(65 + optIdx)}</span>
                          <span className="break-words">{opt}</span>
                        </Button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t p-3">
        <div className="max-w-2xl mx-auto flex justify-between gap-3">
          <Button variant="outline" onClick={goPrev} disabled={currentIndex === 0} data-testid="button-prev">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Oldingi
          </Button>
          {isLastQuestion ? (
            <Button onClick={handleSubmit} disabled={submitMutation.isPending} data-testid="button-submit">
              <Send className="w-4 h-4 mr-2" />
              {submitMutation.isPending ? "Yuborilmoqda..." : "Yakunlash"}
            </Button>
          ) : (
            <Button onClick={goNext} data-testid="button-next">
              Keyingi
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
