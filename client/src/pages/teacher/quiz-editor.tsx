import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useRoute, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Save, Upload, ArrowLeft, CheckCircle, Image, Video, Music, X, Loader2, Download, FileText } from "lucide-react";
import type { Quiz, Question } from "@shared/schema";

function MediaPreview({ mediaUrl, mediaType, className }: { mediaUrl: string; mediaType: string; className?: string }) {
  if (!mediaUrl) return null;
  if (mediaType === "video") {
    return (
      <video src={mediaUrl} controls className={`rounded-md max-h-48 w-full object-contain bg-black ${className || ""}`} data-testid="media-preview-video" />
    );
  }
  if (mediaType === "audio") {
    return (
      <div className={`flex items-center gap-2 p-3 bg-muted rounded-md ${className || ""}`}>
        <Music className="w-5 h-5 text-muted-foreground shrink-0" />
        <audio src={mediaUrl} controls className="w-full h-8" data-testid="media-preview-audio" />
      </div>
    );
  }
  return (
    <img src={mediaUrl} alt="Media" className={`rounded-md max-h-48 object-contain ${className || ""}`} data-testid="media-preview-image" />
  );
}

export default function QuizEditor() {
  const [matchNew] = useRoute("/teacher/quizzes/new");
  const [, params] = useRoute("/teacher/quizzes/:id");
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const isNew = matchNew || params?.id === "new";
  const quizId = isNew ? null : params?.id;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [timePerQuestion, setTimePerQuestion] = useState(30);
  const [initialized, setInitialized] = useState(false);
  const [textImportOpen, setTextImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleTextImport = async () => {
    if (!importText.trim() || !quizId) return;
    try {
      const res = await fetch(`/api/quizzes/${quizId}/import-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: importText }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Import failed");
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes", quizId, "questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      toast({ title: `${data.imported} ta savol yuklandi!` });
      setImportText("");
      setTextImportOpen(false);
    } catch {
      toast({ title: "Import xatosi", variant: "destructive" });
    }
  };

  const [newQ, setNewQ] = useState({
    questionText: "",
    options: ["", "", "", ""],
    correctIndex: -1,
    points: 100,
    timeLimit: 30,
    mediaUrl: "",
    mediaType: "",
  });

  const [uploading, setUploading] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setNewQ((prev) => ({ ...prev, mediaUrl: data.url, mediaType: data.mediaType }));
      toast({ title: "Media yuklandi!" });
    } catch {
      toast({ title: "Media yuklashda xatolik", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleAddQuestion = () => {
    if (!newQ.questionText.trim()) {
      toast({ title: "Savol matnini kiriting", variant: "destructive" });
      return;
    }
    const filledOptions = newQ.options.filter((o) => o.trim());
    if (filledOptions.length < 2) {
      toast({ title: "Kamida 2 ta variant kiriting", variant: "destructive" });
      return;
    }
    if (newQ.correctIndex < 0 || newQ.correctIndex >= newQ.options.length || !newQ.options[newQ.correctIndex]?.trim()) {
      toast({ title: "To'g'ri javobni tanlang", variant: "destructive" });
      return;
    }
    addQuestion.mutate({
      type: "multiple_choice",
      questionText: newQ.questionText,
      options: filledOptions,
      correctAnswer: newQ.options[newQ.correctIndex].trim(),
      points: newQ.points,
      timeLimit: newQ.timeLimit,
      mediaUrl: newQ.mediaUrl || null,
      mediaType: newQ.mediaType || null,
      orderIndex: (questionsList?.length || 0),
    });
    setNewQ({ questionText: "", options: ["", "", "", ""], correctIndex: -1, points: 100, timeLimit: 30, mediaUrl: "", mediaType: "" });
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
        <div className="flex gap-2 flex-wrap">
          {!isNew && (
            <Button
              onClick={() => updateQuiz.mutate()}
              disabled={updateQuiz.isPending}
              className="gradient-purple border-0"
              data-testid="button-save-quiz-top"
            >
              <Save className="w-4 h-4 mr-1" /> Saqlash
            </Button>
          )}
          {!isNew && quiz?.status === "draft" && (
            <Button onClick={() => publishQuiz.mutate()} className="gradient-teal border-0" data-testid="button-publish">
              <CheckCircle className="w-4 h-4 mr-1" /> Nashr qilish
            </Button>
          )}
        </div>
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
              <Button variant="outline" onClick={() => window.open("/api/template/download")} data-testid="button-download-template">
                <Download className="w-4 h-4 mr-1" /> Shablon
              </Button>
              <input type="file" ref={fileInputRef} onChange={handleImport} accept=".xlsx,.xls,.csv" className="hidden" />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} data-testid="button-import">
                <Upload className="w-4 h-4 mr-1" /> Excel import
              </Button>
              <Dialog open={textImportOpen} onOpenChange={setTextImportOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-text-import">
                    <FileText className="w-4 h-4 mr-1" /> Matndan import
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Matndan savollar yuklash</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Har bir savolni quyidagi formatda yozing. To'g'ri javob yoniga * belgisini qo'ying:
                    </p>
                    <Card className="p-3 text-xs font-mono text-muted-foreground space-y-1">
                      <p>1. Savol matni</p>
                      <p>A) Birinchi variant</p>
                      <p>B) To'g'ri javob *</p>
                      <p>C) Uchinchi variant</p>
                      <p>D) To'rtinchi variant</p>
                    </Card>
                    <Textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder="Savollarni shu yerga yozing yoki joylashtiring..."
                      className="min-h-[200px] font-mono text-sm"
                      data-testid="textarea-text-import"
                    />
                    <Button onClick={handleTextImport} className="w-full gradient-purple border-0" data-testid="button-submit-text-import">
                      <Upload className="w-4 h-4 mr-1" /> Yuklash
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
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
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="secondary" className="text-xs">{idx + 1}</Badge>
                          <span className="text-xs text-muted-foreground">{q.points} ball | {q.timeLimit}s</span>
                        </div>
                        <p className="font-medium">{q.questionText}</p>
                        {q.mediaUrl && q.mediaType && (
                          <MediaPreview mediaUrl={q.mediaUrl} mediaType={q.mediaType} />
                        )}
                        {q.options && (
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {(q.options as string[]).map((opt, oi) => (
                              <span key={oi} className={`text-xs px-2 py-1 rounded-sm ${opt === q.correctAnswer ? "gradient-teal text-white" : "bg-muted"}`}>
                                {String.fromCharCode(65 + oi)}) {opt}
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
              <Label>Savol matni</Label>
              <Textarea value={newQ.questionText} onChange={(e) => setNewQ({ ...newQ, questionText: e.target.value })} placeholder="Savolingizni yozing..." data-testid="input-question-text" />
            </div>

            <div className="space-y-2">
              <Label>Media (rasm, audio yoki video)</Label>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="file"
                  ref={mediaInputRef}
                  onChange={handleMediaUpload}
                  accept="image/*,audio/*,video/*"
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => mediaInputRef.current?.click()}
                  disabled={uploading}
                  data-testid="button-upload-media"
                >
                  {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                  {uploading ? "Yuklanmoqda..." : "Media yuklash"}
                </Button>
                {newQ.mediaUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setNewQ((prev) => ({ ...prev, mediaUrl: "", mediaType: "" }))}
                    data-testid="button-remove-media"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {newQ.mediaUrl && newQ.mediaType && (
                <MediaPreview mediaUrl={newQ.mediaUrl} mediaType={newQ.mediaType} />
              )}
            </div>

            <div className="space-y-2">
              <Label>Javob variantlari (to'g'ri javobni tanlang)</Label>
              {newQ.options.map((opt, i) => (
                <label
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                    newQ.correctIndex === i ? "border-green-500 bg-green-500/10" : "hover-elevate"
                  }`}
                  data-testid={`label-option-${i}`}
                >
                  <input
                    type="radio"
                    name="correctAnswer"
                    checked={newQ.correctIndex === i}
                    onChange={() => setNewQ({ ...newQ, correctIndex: i })}
                    className="w-4 h-4 accent-green-500"
                    data-testid={`radio-option-${i}`}
                  />
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center text-white text-sm font-bold shrink-0 ${["quiz-option-a", "quiz-option-b", "quiz-option-c", "quiz-option-d"][i]}`}>
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
                    className="flex-1"
                    data-testid={`input-option-${i}`}
                  />
                </label>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
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
