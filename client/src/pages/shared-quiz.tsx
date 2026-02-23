import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, CheckCircle, XCircle, ArrowRight, Trophy, Loader2, AlertCircle, User } from "lucide-react";

type QuestionData = {
  id: string;
  questionText: string;
  type: string;
  options: string[] | null;
  correctAnswer: string;
  points: number;
  timeLimit: number;
  mediaUrl?: string;
  mediaType?: string;
};

type QuizData = {
  sharedId: string;
  quizId: string;
  title: string;
  description?: string;
  totalQuestions: number;
  timePerQuestion: number;
  timerEnabled: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showCorrectAnswers: boolean;
  questions: QuestionData[];
};

type AnswerRecord = Record<string, { answer: string | string[]; isCorrect: boolean; points: number; timeSpent: number }>;

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function balancedShuffleOptions(questions: QuestionData[]): QuestionData[] {
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

export default function SharedQuizPage() {
  const { code } = useParams<{ code: string }>();
  const [phase, setPhase] = useState<"loading" | "error" | "name" | "playing" | "result">("loading");
  const [error, setError] = useState("");
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [attemptId, setAttemptId] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord>({});
  const [selectedAnswer, setSelectedAnswer] = useState<string | string[] | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [processedQuestions, setProcessedQuestions] = useState<QuestionData[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/shared/${code}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.message || "Test topilmadi");
          setPhase("error");
          return;
        }
        const data: QuizData = await res.json();
        setQuizData(data);

        let qs = [...data.questions];
        if (data.shuffleQuestions) qs = shuffleArray(qs);
        if (data.shuffleOptions) {
          qs = balancedShuffleOptions(qs);
        }
        setProcessedQuestions(qs);
        setPhase("name");
      } catch {
        setError("Serverga ulanib bo'lmadi");
        setPhase("error");
      }
    }
    if (code) load();
  }, [code]);

  const startQuiz = async () => {
    if (!playerName.trim()) return;
    try {
      const res = await fetch(`/api/shared/${code}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: playerName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Xatolik");
        return;
      }
      const attempt = await res.json();
      setAttemptId(attempt.id);
      setCurrentIndex(0);
      setQuestionStartTime(Date.now());
      if (quizData?.timerEnabled && processedQuestions[0]) {
        setTimeLeft(processedQuestions[0].timeLimit);
      }
      setPhase("playing");
    } catch {
      setError("Serverga ulanib bo'lmadi");
    }
  };

  const currentQuestion = processedQuestions[currentIndex];

  const submitAnswer = useCallback(() => {
    if (!currentQuestion || showFeedback) return;
    const timeSpent = Math.round((Date.now() - questionStartTime) / 1000);
    const answer = selectedAnswer || "";
    let isCorrect = false;
    let points = 0;

    if (currentQuestion.type === "multiple_select") {
      const selected = Array.isArray(answer) ? answer.sort() : [];
      const correct = currentQuestion.correctAnswer.split(",").map(s => s.trim()).sort();
      isCorrect = JSON.stringify(selected) === JSON.stringify(correct);
    } else if (currentQuestion.type === "true_false") {
      isCorrect = String(answer).toLowerCase() === currentQuestion.correctAnswer.toLowerCase();
    } else if (currentQuestion.type === "open_ended") {
      isCorrect = String(answer).trim().toLowerCase() === currentQuestion.correctAnswer.trim().toLowerCase();
    } else {
      isCorrect = String(answer) === currentQuestion.correctAnswer;
    }

    if (isCorrect) {
      const maxTime = currentQuestion.timeLimit;
      const ratio = Math.max(0, 1 - (timeSpent / maxTime) * 0.5);
      points = Math.round(currentQuestion.points * ratio);
    }

    const newAnswers = { ...answers, [currentQuestion.id]: { answer: answer as string | string[], isCorrect, points, timeSpent } };
    setAnswers(newAnswers);
    if (isCorrect) {
      setScore(prev => prev + points);
      setCorrectCount(prev => prev + 1);
    }

    if (quizData?.showCorrectAnswers) {
      setShowFeedback(true);
      setTimeout(() => {
        goNext(newAnswers);
      }, 1500);
    } else {
      goNext(newAnswers);
    }
  }, [currentQuestion, selectedAnswer, questionStartTime, answers, showFeedback, quizData]);

  const goNext = (updatedAnswers: AnswerRecord) => {
    setShowFeedback(false);
    setSelectedAnswer(null);
    if (currentIndex < processedQuestions.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      setQuestionStartTime(Date.now());
      if (quizData?.timerEnabled && processedQuestions[nextIdx]) {
        setTimeLeft(processedQuestions[nextIdx].timeLimit);
      }
    } else {
      finishQuiz(updatedAnswers);
    }
  };

  const finishQuiz = async (finalAnswers: AnswerRecord) => {
    setSubmitting(true);
    const totalCorrect = Object.values(finalAnswers).filter(a => a.isCorrect).length;
    const totalScore = Object.values(finalAnswers).reduce((sum, a) => sum + a.points, 0);
    try {
      await fetch(`/api/shared/${code}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId,
          answers: finalAnswers,
          score: totalScore,
          correctAnswers: totalCorrect,
          totalQuestions: processedQuestions.length,
        }),
      });
    } catch {}
    setScore(totalScore);
    setCorrectCount(totalCorrect);
    setSubmitting(false);
    setPhase("result");
  };

  useEffect(() => {
    if (phase !== "playing" || !quizData?.timerEnabled || !currentQuestion) return;
    if (timeLeft <= 0) {
      submitAnswer();
      return;
    }
    const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, phase, quizData?.timerEnabled, currentQuestion]);

  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="p-8 text-center max-w-md w-full">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Xatolik</h2>
          <p className="text-muted-foreground">{error}</p>
        </Card>
      </div>
    );
  }

  if (phase === "name") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="p-8 max-w-md w-full text-center space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-2" data-testid="text-quiz-title">{quizData?.title}</h1>
              {quizData?.description && <p className="text-muted-foreground text-sm">{quizData.description}</p>}
              <div className="flex items-center justify-center gap-3 mt-3">
                <Badge variant="secondary">{quizData?.totalQuestions} ta savol</Badge>
                {quizData?.timerEnabled && <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />{quizData.timePerQuestion}s</Badge>}
              </div>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Ismingizni kiriting..."
                  className="pl-9 text-center text-lg"
                  onKeyDown={(e) => { if (e.key === "Enter") startQuiz(); }}
                  autoFocus
                  data-testid="input-player-name"
                />
              </div>
              <Button
                className="w-full gradient-purple border-0 text-lg py-6"
                onClick={startQuiz}
                disabled={!playerName.trim()}
                data-testid="button-start-quiz"
              >
                Boshlash <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (phase === "result") {
    const pct = processedQuestions.length > 0 ? Math.round((correctCount / processedQuestions.length) * 100) : 0;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="p-8 max-w-md w-full text-center space-y-6">
            <Trophy className={`w-16 h-16 mx-auto ${pct >= 70 ? "text-yellow-500" : pct >= 40 ? "text-blue-500" : "text-gray-400"}`} />
            <div>
              <h2 className="text-2xl font-bold mb-1" data-testid="text-result-title">Natijangiz</h2>
              <p className="text-muted-foreground">{quizData?.title}</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold" data-testid="text-score">{score}</p>
                <p className="text-xs text-muted-foreground">Ball</p>
              </div>
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold" data-testid="text-correct">{correctCount}/{processedQuestions.length}</p>
                <p className="text-xs text-muted-foreground">To'g'ri</p>
              </div>
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold" data-testid="text-percentage">{pct}%</p>
                <p className="text-xs text-muted-foreground">Foiz</p>
              </div>
            </div>
            <p className="text-lg font-medium">
              {pct >= 90 ? "Ajoyib natija!" : pct >= 70 ? "Yaxshi natija!" : pct >= 40 ? "O'rtacha natija" : "Ko'proq mashq qiling!"}
            </p>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Playing phase
  if (!currentQuestion) return null;
  const progressPct = ((currentIndex + 1) / processedQuestions.length) * 100;
  const isMultiSelect = currentQuestion.type === "multiple_select";

  const handleOptionSelect = (opt: string) => {
    if (showFeedback) return;
    if (isMultiSelect) {
      const current = Array.isArray(selectedAnswer) ? selectedAnswer : [];
      setSelectedAnswer(current.includes(opt) ? current.filter(o => o !== opt) : [...current, opt]);
    } else {
      setSelectedAnswer(opt);
    }
  };

  const optionColors = ["bg-red-500", "bg-blue-500", "bg-green-500", "bg-yellow-500", "bg-purple-500", "bg-pink-500", "bg-teal-500", "bg-orange-500"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="secondary" className="shrink-0">{currentIndex + 1}/{processedQuestions.length}</Badge>
            <span className="text-sm text-muted-foreground truncate">{quizData?.title}</span>
          </div>
          {quizData?.timerEnabled && (
            <Badge variant={timeLeft <= 5 ? "destructive" : "outline"} className="text-lg px-3 py-1 tabular-nums shrink-0" data-testid="badge-timer">
              <Clock className="w-4 h-4 mr-1" />{timeLeft}s
            </Badge>
          )}
        </div>

        <div className="w-full bg-muted rounded-full h-2">
          <div className="h-2 rounded-full gradient-purple transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={currentIndex} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={{ duration: 0.2 }}>
            <Card className="p-6 space-y-6">
              {currentQuestion.mediaUrl && (
                <div className="flex justify-center">
                  {currentQuestion.mediaType === "image" ? (
                    <img src={currentQuestion.mediaUrl} alt="" className="max-h-48 rounded-lg object-contain" />
                  ) : currentQuestion.mediaType === "audio" ? (
                    <audio src={currentQuestion.mediaUrl} controls className="w-full" />
                  ) : null}
                </div>
              )}

              <h2 className="text-xl font-semibold text-center" data-testid="text-question" dir="auto">{currentQuestion.questionText}</h2>

              {currentQuestion.type === "open_ended" ? (
                <div className="space-y-3">
                  <Input
                    value={typeof selectedAnswer === "string" ? selectedAnswer : ""}
                    onChange={(e) => setSelectedAnswer(e.target.value)}
                    placeholder="Javobingizni yozing..."
                    className="text-lg text-center"
                    disabled={showFeedback}
                    onKeyDown={(e) => { if (e.key === "Enter" && selectedAnswer) submitAnswer(); }}
                    data-testid="input-answer"
                    dir="auto"
                  />
                </div>
              ) : currentQuestion.type === "true_false" ? (
                <div className="grid grid-cols-2 gap-4">
                  {["true", "false"].map((opt) => {
                    const isSelected = selectedAnswer === opt;
                    const isCorrectOpt = showFeedback && opt === currentQuestion.correctAnswer;
                    const isWrongSelected = showFeedback && isSelected && opt !== currentQuestion.correctAnswer;
                    return (
                      <Button
                        key={opt}
                        variant="outline"
                        className={`h-16 text-lg font-semibold transition-all ${isSelected && !showFeedback ? "ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-950" : ""} ${isCorrectOpt ? "ring-2 ring-green-500 bg-green-50 dark:bg-green-950" : ""} ${isWrongSelected ? "ring-2 ring-red-500 bg-red-50 dark:bg-red-950" : ""}`}
                        onClick={() => handleOptionSelect(opt)}
                        disabled={showFeedback}
                        data-testid={`button-option-${opt}`}
                      >
                        {opt === "true" ? "To'g'ri" : "Noto'g'ri"}
                        {isCorrectOpt && <CheckCircle className="w-5 h-5 ml-2 text-green-500" />}
                        {isWrongSelected && <XCircle className="w-5 h-5 ml-2 text-red-500" />}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(currentQuestion.options || []).map((opt, idx) => {
                    const isSelected = isMultiSelect
                      ? (Array.isArray(selectedAnswer) && selectedAnswer.includes(opt))
                      : selectedAnswer === opt;
                    const isCorrectOpt = showFeedback && (
                      isMultiSelect
                        ? currentQuestion.correctAnswer.split(",").map(s => s.trim()).includes(opt)
                        : opt === currentQuestion.correctAnswer
                    );
                    const isWrongSelected = showFeedback && isSelected && !isCorrectOpt;
                    const colorClass = optionColors[idx % optionColors.length];
                    return (
                      <Button
                        key={idx}
                        variant="outline"
                        className={`h-auto min-h-[3.5rem] py-3 px-4 text-left whitespace-normal text-base transition-all relative overflow-hidden ${isSelected && !showFeedback ? "ring-2 ring-purple-500" : ""} ${isCorrectOpt ? "ring-2 ring-green-500 bg-green-50 dark:bg-green-950" : ""} ${isWrongSelected ? "ring-2 ring-red-500 bg-red-50 dark:bg-red-950" : ""}`}
                        onClick={() => handleOptionSelect(opt)}
                        disabled={showFeedback}
                        data-testid={`button-option-${idx}`}
                      >
                        <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${colorClass}`} />
                        <span className="pl-2" dir="auto">{opt}</span>
                        {isCorrectOpt && <CheckCircle className="w-5 h-5 ml-auto shrink-0 text-green-500" />}
                        {isWrongSelected && <XCircle className="w-5 h-5 ml-auto shrink-0 text-red-500" />}
                      </Button>
                    );
                  })}
                </div>
              )}

              {!showFeedback && (
                <Button
                  className="w-full gradient-purple border-0 text-lg py-5"
                  onClick={submitAnswer}
                  disabled={selectedAnswer === null || (Array.isArray(selectedAnswer) && selectedAnswer.length === 0)}
                  data-testid="button-submit-answer"
                >
                  {currentIndex === processedQuestions.length - 1 ? "Tugatish" : "Keyingi"} <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              )}
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
