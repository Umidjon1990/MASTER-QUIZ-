import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardList, Calendar, ArrowLeft, ArrowRight, Send, CheckCircle, X, Clock, BarChart3, Music } from "lucide-react";
import type { Assignment, Question } from "@shared/schema";

interface StudentAssignment extends Assignment {
  quizTitle?: string;
  attemptsUsed?: number;
}

export default function StudentAssignments() {
  const { toast } = useToast();
  const [activeAssignment, setActiveAssignment] = useState<StudentAssignment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [result, setResult] = useState<{ score: number; correctAnswers: number; totalQuestions: number } | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  const { data: assignments, isLoading } = useQuery<StudentAssignment[]>({
    queryKey: ["/api/assignments/student"],
  });

  const submitAttempt = useMutation({
    mutationFn: async () => {
      if (!activeAssignment) throw new Error("No assignment");
      const res = await fetch(`/api/assignments/${activeAssignment.id}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Xatolik");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResult({ score: data.score, correctAnswers: data.correctAnswers, totalQuestions: data.totalQuestions });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments/student"] });
      toast({ title: "Javoblar yuborildi!" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Yuborishda xatolik", variant: "destructive" });
    },
  });

  const handleStart = async (assignment: StudentAssignment) => {
    setLoadingQuestions(true);
    try {
      const res = await fetch(`/api/quizzes/${assignment.quizId}/questions/shuffled`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setQuestions(data);
      setActiveAssignment(assignment);
      setCurrentIndex(0);
      setAnswers({});
      setResult(null);
    } catch {
      toast({ title: "Savollarni yuklashda xatolik", variant: "destructive" });
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleBack = () => {
    setActiveAssignment(null);
    setQuestions([]);
    setCurrentIndex(0);
    setAnswers({});
    setResult(null);
  };

  const handleSelectAnswer = (questionId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleToggleMultiSelect = (questionId: string, option: string) => {
    setAnswers((prev) => {
      const current = (prev[questionId] as string[]) || [];
      const updated = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [questionId]: updated };
    });
  };

  const formatDeadline = (d: string | Date | null) => {
    if (!d) return "Muddatsiz";
    const date = new Date(d);
    return date.toLocaleDateString("uz-UZ", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const isExpired = (d: string | Date | null) => {
    if (!d) return false;
    return new Date(d) < new Date();
  };

  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;

  if (result) {
    return (
      <div className="p-6 space-y-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="p-8 text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-full gradient-teal flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2" data-testid="text-result-title">Natija</h2>
            <p className="text-4xl font-bold mb-2" data-testid="text-result-score">{result.score} ball</p>
            <p className="text-muted-foreground mb-4" data-testid="text-result-details">
              {result.correctAnswers}/{result.totalQuestions} to'g'ri javob
            </p>
            <Badge variant={result.correctAnswers >= result.totalQuestions / 2 ? "default" : "destructive"} data-testid="badge-result-status">
              {result.correctAnswers >= result.totalQuestions / 2 ? "Yaxshi natija!" : "Ko'proq harakat qiling"}
            </Badge>
            <div className="mt-6">
              <Button variant="outline" onClick={handleBack} data-testid="button-back-to-assignments">
                <ArrowLeft className="w-4 h-4 mr-1" /> Vazifalar ro'yxatiga qaytish
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (activeAssignment && questions.length > 0) {
    return (
      <div className="p-6 space-y-6 max-w-2xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4 flex-wrap">
          <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-back-quiz">
            <X className="w-4 h-4" />
          </Button>
          <div className="flex-1 text-center">
            <p className="text-sm text-muted-foreground" data-testid="text-question-progress">
              {currentIndex + 1} / {questions.length}
            </p>
          </div>
          <Badge variant="outline" data-testid="badge-answered-count">{answeredCount}/{questions.length} javob</Badge>
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h3 className="text-lg font-semibold" data-testid="text-question">{currentQuestion.questionText}</h3>
                {currentQuestion.type === "poll" && (
                  <Badge variant="secondary" data-testid="badge-poll-type">
                    <BarChart3 className="w-3 h-3 mr-1" />So'rovnoma
                  </Badge>
                )}
                {currentQuestion.type === "multiple_select" && (
                  <Badge variant="secondary" data-testid="badge-multi-type">Ko'p tanlov</Badge>
                )}
              </div>
              {currentQuestion.type === "poll" && (
                <p className="text-xs text-muted-foreground mb-3">Ball berilmaydi — faqat fikringizni bildiring</p>
              )}
              {currentQuestion.type === "multiple_select" && (
                <p className="text-xs text-muted-foreground mb-3">Bir nechta javobni tanlang</p>
              )}

              {currentQuestion.mediaUrl && currentQuestion.mediaType === "video" && (
                <video src={currentQuestion.mediaUrl} controls className="rounded-md max-h-48 w-full object-contain bg-black mb-3" data-testid="assignment-media-video" />
              )}
              {currentQuestion.mediaUrl && currentQuestion.mediaType === "audio" && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md mb-3">
                  <Music className="w-4 h-4 text-muted-foreground shrink-0" />
                  <audio src={currentQuestion.mediaUrl} controls className="w-full h-8" data-testid="assignment-media-audio" />
                </div>
              )}
              {currentQuestion.mediaUrl && currentQuestion.mediaType === "image" && (
                <img src={currentQuestion.mediaUrl} alt="Savol rasmi" className="rounded-md max-h-48 object-contain mb-3" data-testid="assignment-media-image" />
              )}

              {currentQuestion.type === "multiple_select" && currentQuestion.options && (currentQuestion.options as string[]).length > 0 ? (
                <div className="space-y-2">
                  {(currentQuestion.options as string[]).map((option, idx) => {
                    const selected = ((answers[currentQuestion.id] as string[]) || []).includes(option);
                    return (
                      <div
                        key={idx}
                        className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${selected ? "border-primary bg-primary/10" : "hover-elevate"}`}
                        onClick={() => handleToggleMultiSelect(currentQuestion.id, option)}
                        data-testid={`checkbox-option-${idx}`}
                      >
                        <Checkbox checked={selected} />
                        <span className="flex-1">
                          <span className="mr-2 font-semibold">{String.fromCharCode(65 + idx)}.</span>{option}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : currentQuestion.options && (currentQuestion.options as string[]).length > 0 ? (
                <div className="space-y-2">
                  {(currentQuestion.options as string[]).map((option, idx) => (
                    <Button
                      key={idx}
                      variant={answers[currentQuestion.id] === option ? "default" : "outline"}
                      className={`w-full justify-start text-left ${answers[currentQuestion.id] === option ? "gradient-purple border-0 text-white" : ""}`}
                      onClick={() => handleSelectAnswer(currentQuestion.id, option)}
                      data-testid={`button-option-${idx}`}
                    >
                      <span className="mr-2 font-semibold">{String.fromCharCode(65 + idx)}.</span> {option}
                    </Button>
                  ))}
                </div>
              ) : (
                <Input
                  placeholder="Javobingizni yozing..."
                  value={(answers[currentQuestion.id] as string) || ""}
                  onChange={(e) => handleSelectAnswer(currentQuestion.id, e.target.value)}
                  data-testid="input-open-answer"
                />
              )}
            </Card>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            data-testid="button-prev-question"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Oldingi
          </Button>
          {currentIndex < questions.length - 1 ? (
            <Button
              variant="outline"
              onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
              data-testid="button-next-question"
            >
              Keyingi <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              className="gradient-teal border-0"
              onClick={() => submitAttempt.mutate()}
              disabled={submitAttempt.isPending}
              data-testid="button-submit-answers"
            >
              <Send className="w-4 h-4 mr-1" /> Yuborish
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold" data-testid="text-student-assignments-title">Vazifalar</h1>
        <p className="text-muted-foreground">Sizga berilgan vazifalar</p>
      </motion.div>

      {isLoading || loadingQuestions ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : assignments && assignments.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          className="space-y-3"
        >
          {assignments.map((a) => {
            const expired = isExpired(a.deadline);
            const attemptsLeft = a.attemptsLimit - (a.attemptsUsed || 0);
            const canStart = !expired && attemptsLeft > 0;

            return (
              <motion.div key={a.id} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
                <Card className="p-4 hover-elevate" data-testid={`card-student-assignment-${a.id}`}>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold" data-testid={`text-assignment-title-${a.id}`}>{a.title}</h3>
                        {expired && <Badge variant="destructive" data-testid={`badge-expired-${a.id}`}>Muddat tugagan</Badge>}
                        {!expired && attemptsLeft <= 0 && <Badge variant="secondary" data-testid={`badge-no-attempts-${a.id}`}>Urinish tugagan</Badge>}
                      </div>
                      {a.quizTitle && (
                        <p className="text-sm text-muted-foreground" data-testid={`text-quiz-title-${a.id}`}>
                          <ClipboardList className="w-3 h-3 inline mr-1" />{a.quizTitle}
                        </p>
                      )}
                      <div className="flex gap-4 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground" data-testid={`text-deadline-${a.id}`}>
                          <Calendar className="w-3 h-3 inline mr-1" />{formatDeadline(a.deadline)}
                        </span>
                        <span className="text-xs text-muted-foreground" data-testid={`text-attempts-${a.id}`}>
                          <Clock className="w-3 h-3 inline mr-1" />{a.attemptsUsed || 0}/{a.attemptsLimit} urinish
                        </span>
                      </div>
                    </div>
                    <Button
                      className={canStart ? "gradient-purple border-0" : ""}
                      variant={canStart ? "default" : "secondary"}
                      disabled={!canStart}
                      onClick={() => handleStart(a)}
                      data-testid={`button-start-assignment-${a.id}`}
                    >
                      {canStart ? "Boshlash" : expired ? "Muddat tugagan" : "Tugallangan"}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      ) : (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Vazifalar yo'q</h3>
          <p className="text-muted-foreground">Sizga hali vazifa berilmagan</p>
        </Card>
      )}
    </div>
  );
}
