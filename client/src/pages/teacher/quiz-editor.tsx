import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useRoute, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import { Plus, Trash2, Save, Upload, ArrowLeft, Image, Music, CheckCircle, X } from "lucide-react";
import type { Quiz, Question } from "@shared/schema";

export default function QuizEditor() {
  const [, params] = useRoute("/teacher/quizzes/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isNew = params?.id === "new";
  const quizId = isNew ? null : params?.id;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [timePerQuestion, setTimePerQuestion] = useState(30);
  const [initialized, setInitialized] = useState(false);

  const { data: quiz, isLoading: quizLoading } = useQuery<Quiz>({
    queryKey: ["/api/quizzes", quizId],
    queryFn: async () => {
      const res = await fetch(`/api/quizzes/${quizId}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!quizId,
  });

  const { data: questionsList, isLoading: questionsLoading } = useQuery<Question[]>({
    queryKey: ["/api/quizzes", quizId, "questions"],
    queryFn: async () => {
      const res = await fetch(`/api/quizzes/${quizId}/questions`, { credentials: "include" });
      return res.json();
    },
    enabled: !!quizId,
  });

  if (quiz && !initialized) {
    setTitle(quiz.title);
    setDescription(quiz.description || "");
    setCategory(quiz.category || "");
    setIsPublic(quiz.isPublic);
    setTimePerQuestion(quiz.timePerQuestion);
    setInitialized(true);
  }

  const createQuiz = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, category, isPublic, timePerQuestion, status: "draft" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      toast({ title: "Quiz yaratildi!" });
      navigate(`/teacher/quizzes/${data.id}`);
    },
  });

  const updateQuiz = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/quizzes/${quizId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, category, isPublic, timePerQuestion }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      toast({ title: "Quiz yangilandi!" });
    },
  });

  const publishQuiz = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/quizzes/${quizId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes", quizId] });
      toast({ title: "Quiz nashr qilindi!" });
    },
  });

  const addQuestion = useMutation({
    mutationFn: async (q: any) => {
      const res = await fetch(`/api/quizzes/${quizId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(q),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes", quizId, "questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
    },
  });

  const deleteQuestion = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/questions/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes", quizId, "questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !quizId) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/quizzes/${quizId}/import`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Import failed");
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes", quizId, "questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      toast({ title: `${data.imported} ta savol yuklandi!` });
    } catch {
      toast({ title: "Import xatosi", variant: "destructive" });
    }
  };

  const [newQ, setNewQ] = useState({
    type: "multiple_choice",
    questionText: "",
    options: ["", "", "", ""],
    correctAnswer: "",
    points: 100,
    timeLimit: 30,
  });

  const handleAddQuestion = () => {
    if (!newQ.questionText || !newQ.correctAnswer) {
      toast({ title: "Savol va to'g'ri javobni kiriting", variant: "destructive" });
      return;
    }
    const opts = newQ.type === "multiple_choice" ? newQ.options.filter((o) => o.trim()) : null;
    addQuestion.mutate({
      ...newQ,
      options: opts,
      orderIndex: (questionsList?.length || 0),
    });
    setNewQ({ type: "multiple_choice", questionText: "", options: ["", "", "", ""], correctAnswer: "", points: 100, timeLimit: 30 });
  };

  if (quizLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/teacher/quizzes")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" data-testid="text-editor-title">{isNew ? "Yangi Quiz" : "Quiz Tahrirlash"}</h1>
        </div>
        {!isNew && quiz?.status === "draft" && (
          <Button onClick={() => publishQuiz.mutate()} className="gradient-teal border-0" data-testid="button-publish">
            <CheckCircle className="w-4 h-4 mr-1" /> Nashr qilish
          </Button>
        )}
      </motion.div>

      <Card className="p-6 space-y-4">
        <div>
          <Label>Quiz nomi</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Masalan: Matematika 5-sinf" data-testid="input-quiz-title" />
        </div>
        <div>
          <Label>Tavsif</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Quiz haqida qisqacha..." data-testid="input-quiz-description" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Kategoriya</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Masalan: Matematika" data-testid="input-quiz-category" />
          </div>
          <div>
            <Label>Har bir savol uchun vaqt (soniya)</Label>
            <Input type="number" value={timePerQuestion} onChange={(e) => setTimePerQuestion(Number(e.target.value))} data-testid="input-time-per-question" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={isPublic} onCheckedChange={setIsPublic} data-testid="switch-is-public" />
          <Label>Ommaviy quiz (bepul)</Label>
        </div>
        <Button
          onClick={() => isNew ? createQuiz.mutate() : updateQuiz.mutate()}
          disabled={createQuiz.isPending || updateQuiz.isPending}
          className="gradient-purple border-0"
          data-testid="button-save-quiz"
        >
          <Save className="w-4 h-4 mr-1" /> {isNew ? "Yaratish" : "Saqlash"}
        </Button>
      </Card>

      {!isNew && quizId && (
        <>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">Savollar ({questionsList?.length || 0})</h2>
            <div className="flex gap-2 flex-wrap">
              <input type="file" ref={fileInputRef} onChange={handleImport} accept=".xlsx,.xls,.csv" className="hidden" />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} data-testid="button-import">
                <Upload className="w-4 h-4 mr-1" /> Import (Excel)
              </Button>
            </div>
          </div>

          {questionsLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : (
            <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }} className="space-y-3">
              {questionsList?.map((q, idx) => (
                <motion.div key={q.id} variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }}>
                  <Card className="p-4" data-testid={`card-question-${q.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="secondary" className="text-xs">{idx + 1}</Badge>
                          <Badge variant="secondary" className="text-xs">
                            {q.type === "multiple_choice" ? "Ko'p variant" : q.type === "true_false" ? "To'g'ri/Noto'g'ri" : "Ochiq"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{q.points} ball | {q.timeLimit}s</span>
                        </div>
                        <p className="font-medium">{q.questionText}</p>
                        {q.options && (
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {(q.options as string[]).map((opt, oi) => (
                              <span key={oi} className={`text-xs px-2 py-1 rounded-sm ${opt === q.correctAnswer ? "gradient-teal text-white" : "bg-muted"}`}>
                                {opt}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => deleteQuestion.mutate(q.id)} data-testid={`button-delete-q-${q.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}

          <Card className="p-6 space-y-4 border-dashed">
            <h3 className="font-semibold">Yangi savol qo'shish</h3>
            <div>
              <Label>Savol turi</Label>
              <Select value={newQ.type} onValueChange={(v) => setNewQ({ ...newQ, type: v })}>
                <SelectTrigger data-testid="select-question-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="multiple_choice">Ko'p variantli</SelectItem>
                  <SelectItem value="true_false">To'g'ri/Noto'g'ri</SelectItem>
                  <SelectItem value="open_ended">Ochiq javob</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Savol matni</Label>
              <Textarea value={newQ.questionText} onChange={(e) => setNewQ({ ...newQ, questionText: e.target.value })} placeholder="Savolingizni yozing..." data-testid="input-question-text" />
            </div>
            {newQ.type === "multiple_choice" && (
              <div className="space-y-2">
                <Label>Javob variantlari</Label>
                {newQ.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center text-white text-sm font-bold ${["quiz-option-a", "quiz-option-b", "quiz-option-c", "quiz-option-d"][i]}`}>
                      {String.fromCharCode(65 + i)}
                    </div>
                    <Input
                      value={opt}
                      onChange={(e) => {
                        const opts = [...newQ.options];
                        opts[i] = e.target.value;
                        setNewQ({ ...newQ, options: opts });
                      }}
                      placeholder={`Variant ${String.fromCharCode(65 + i)}`}
                      data-testid={`input-option-${i}`}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>To'g'ri javob</Label>
                <Input value={newQ.correctAnswer} onChange={(e) => setNewQ({ ...newQ, correctAnswer: e.target.value })} placeholder="To'g'ri javob" data-testid="input-correct-answer" />
              </div>
              <div>
                <Label>Ball</Label>
                <Input type="number" value={newQ.points} onChange={(e) => setNewQ({ ...newQ, points: Number(e.target.value) })} data-testid="input-points" />
              </div>
              <div>
                <Label>Vaqt (soniya)</Label>
                <Input type="number" value={newQ.timeLimit} onChange={(e) => setNewQ({ ...newQ, timeLimit: Number(e.target.value) })} data-testid="input-time-limit" />
              </div>
            </div>
            <Button onClick={handleAddQuestion} disabled={addQuestion.isPending} className="gradient-purple border-0" data-testid="button-add-question">
              <Plus className="w-4 h-4 mr-1" /> Savol qo'shish
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
