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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, Upload, ArrowLeft, CheckCircle, Image, Video, Music, X, Loader2, Download, FileText, Send, ListChecks, ToggleLeft, MessageSquare, Pencil } from "lucide-react";
import type { Quiz, Question, UserProfile } from "@shared/schema";

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
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [tgBotToken, setTgBotToken] = useState("");
  const [tgChatId, setTgChatId] = useState("");
  const [tgSending, setTgSending] = useState(false);

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
  });

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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Savol saqlashda xatolik");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes", quizId, "questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      toast({ title: "Savol qo'shildi!" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Savol saqlashda xatolik", variant: "destructive" });
    },
  });

  const updateQuestion = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/questions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Saqlashda xatolik");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes", quizId, "questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      toast({ title: "Savol yangilandi!" });
      setEditingQuestion(null);
    },
    onError: (error: any) => {
      toast({ title: error.message || "Saqlashda xatolik", variant: "destructive" });
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

  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editQ, setEditQ] = useState({
    questionText: "",
    options: ["", "", "", ""],
    correctIndex: -1,
    points: 100,
    timeLimit: 30,
    type: "multiple_choice" as string,
    openAnswer: "",
  });

  const openEditDialog = (q: Question) => {
    setEditingQuestion(q);
    const opts = (q.options as string[]) || ["", "", "", ""];
    while (opts.length < 4) opts.push("");
    let correctIdx = -1;
    if (q.type === "multiple_choice" || !q.type) {
      correctIdx = opts.indexOf(q.correctAnswer);
    } else if (q.type === "true_false") {
      correctIdx = q.correctAnswer === "true" ? 0 : 1;
    }
    setEditQ({
      questionText: q.questionText,
      options: opts,
      correctIndex: correctIdx,
      points: q.points,
      timeLimit: q.timeLimit,
      type: q.type || "multiple_choice",
      openAnswer: q.type === "open_ended" ? q.correctAnswer : "",
    });
  };

  const handleSaveEdit = () => {
    if (!editingQuestion || !editQ.questionText.trim()) {
      toast({ title: "Savol matnini kiriting", variant: "destructive" });
      return;
    }
    let correctAnswer = "";
    let options: string[] | null = null;

    if (editQ.type === "multiple_choice") {
      const filledOptions = editQ.options.filter((o) => o.trim());
      if (filledOptions.length < 2) {
        toast({ title: "Kamida 2 ta variant kiriting", variant: "destructive" });
        return;
      }
      if (editQ.correctIndex < 0 || !editQ.options[editQ.correctIndex]?.trim()) {
        toast({ title: "To'g'ri javobni tanlang", variant: "destructive" });
        return;
      }
      options = filledOptions;
      correctAnswer = editQ.options[editQ.correctIndex].trim();
    } else if (editQ.type === "true_false") {
      if (editQ.correctIndex < 0) {
        toast({ title: "To'g'ri yoki Noto'g'ri tanlang", variant: "destructive" });
        return;
      }
      correctAnswer = editQ.correctIndex === 0 ? "true" : "false";
      options = ["To'g'ri", "Noto'g'ri"];
    } else if (editQ.type === "open_ended") {
      if (!editQ.openAnswer.trim()) {
        toast({ title: "To'g'ri javobni kiriting", variant: "destructive" });
        return;
      }
      correctAnswer = editQ.openAnswer.trim();
    }

    updateQuestion.mutate({
      id: editingQuestion.id,
      data: {
        questionText: editQ.questionText,
        options,
        correctAnswer,
        type: editQ.type,
        points: editQ.points,
        timeLimit: editQ.timeLimit,
      },
    });
  };

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

  const handleTelegramOpen = (open: boolean) => {
    setTelegramOpen(open);
    if (open && profile) {
      if (profile.telegramBotToken && !tgBotToken) setTgBotToken(profile.telegramBotToken);
      if (profile.telegramChatId && !tgChatId) setTgChatId(profile.telegramChatId);
    }
  };

  const handleTelegramSend = async () => {
    if (!tgBotToken.trim() || !tgChatId.trim()) {
      toast({ title: "Bot token va Chat ID kiriting", variant: "destructive" });
      return;
    }
    setTgSending(true);
    try {
      if (profile?.telegramBotToken !== tgBotToken || profile?.telegramChatId !== tgChatId) {
        await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telegramBotToken: tgBotToken, telegramChatId: tgChatId }),
          credentials: "include",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      }
      const res = await fetch("/api/telegram/send-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, botToken: tgBotToken, chatId: tgChatId }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Xatolik");
      toast({ title: `${data.sent} ta savol Telegramga yuborildi!` });
      setTelegramOpen(false);
    } catch (error: any) {
      toast({ title: error.message || "Telegramga yuborishda xatolik", variant: "destructive" });
    } finally {
      setTgSending(false);
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
    type: "multiple_choice" as "multiple_choice" | "true_false" | "open_ended",
    openAnswer: "",
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
    let correctAnswer = "";
    let options: string[] | null = null;

    if (newQ.type === "multiple_choice") {
      const filledOptions = newQ.options.filter((o) => o.trim());
      if (filledOptions.length < 2) {
        toast({ title: "Kamida 2 ta variant kiriting", variant: "destructive" });
        return;
      }
      if (newQ.correctIndex < 0 || newQ.correctIndex >= newQ.options.length || !newQ.options[newQ.correctIndex]?.trim()) {
        toast({ title: "To'g'ri javobni tanlang", variant: "destructive" });
        return;
      }
      options = filledOptions;
      correctAnswer = newQ.options[newQ.correctIndex].trim();
    } else if (newQ.type === "true_false") {
      if (newQ.correctIndex < 0) {
        toast({ title: "To'g'ri yoki Noto'g'ri tanlang", variant: "destructive" });
        return;
      }
      correctAnswer = newQ.correctIndex === 0 ? "true" : "false";
      options = ["To'g'ri", "Noto'g'ri"];
    } else if (newQ.type === "open_ended") {
      if (!newQ.openAnswer.trim()) {
        toast({ title: "To'g'ri javobni kiriting", variant: "destructive" });
        return;
      }
      correctAnswer = newQ.openAnswer.trim();
    }

    addQuestion.mutate({
      type: newQ.type,
      questionText: newQ.questionText,
      options,
      correctAnswer,
      points: newQ.points,
      timeLimit: newQ.timeLimit,
      mediaUrl: newQ.mediaUrl || null,
      mediaType: newQ.mediaType || null,
      orderIndex: (questionsList?.length || 0),
    });
    setNewQ({ questionText: "", options: ["", "", "", ""], correctIndex: -1, points: 100, timeLimit: 30, mediaUrl: "", mediaType: "", type: newQ.type, openAnswer: "" });
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
              <Dialog open={telegramOpen} onOpenChange={handleTelegramOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" disabled={!questionsList?.length} data-testid="button-telegram-send">
                    <Send className="w-4 h-4 mr-1" /> Telegramga yuborish
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Telegramga anonim quiz yuborish</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Savollar Telegram guruh yoki kanalingizga anonim quiz (poll) shaklida yuboriladi. Har bir savol alohida quiz poll bo'ladi.
                    </p>
                    <Card className="p-3 text-xs text-muted-foreground space-y-1">
                      <p>1. @BotFather da yangi bot yarating va tokenni oling</p>
                      <p>2. Botni guruh/kanalga admin qilib qo'shing</p>
                      <p>3. Chat ID: guruh uchun "-100..." yoki kanal uchun "@kanalusername"</p>
                    </Card>
                    <div>
                      <Label>Bot Token</Label>
                      <Input
                        value={tgBotToken}
                        onChange={(e) => setTgBotToken(e.target.value)}
                        placeholder="123456:ABC-DEF..."
                        type="password"
                        data-testid="input-tg-bot-token"
                      />
                    </div>
                    <div>
                      <Label>Chat ID yoki kanal username</Label>
                      <Input
                        value={tgChatId}
                        onChange={(e) => setTgChatId(e.target.value)}
                        placeholder="@kanalusername yoki -1001234567890"
                        data-testid="input-tg-chat-id"
                      />
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Yuboriladi: <span className="font-medium text-foreground">{questionsList?.length || 0}</span> ta savol</p>
                      {questionsList && questionsList.length > 0 && (
                        <p className="text-xs">
                          {(() => {
                            const mc = questionsList.filter(q => q.type === "multiple_choice" || !q.type).length;
                            const tf = questionsList.filter(q => q.type === "true_false").length;
                            const oe = questionsList.filter(q => q.type === "open_ended").length;
                            const parts = [];
                            if (mc > 0) parts.push(`${mc} variantli`);
                            if (tf > 0) parts.push(`${tf} to'g'ri/noto'g'ri`);
                            if (oe > 0) parts.push(`${oe} yozma (matn sifatida)`);
                            return parts.join(", ");
                          })()}
                        </p>
                      )}
                    </div>
                    <Button
                      onClick={handleTelegramSend}
                      disabled={tgSending || !tgBotToken.trim() || !tgChatId.trim()}
                      className="w-full gradient-purple border-0"
                      data-testid="button-submit-telegram"
                    >
                      {tgSending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                      {tgSending ? "Yuborilmoqda..." : "Yuborish"}
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
                          <Badge variant="outline" className="text-xs">
                            {q.type === "true_false" ? "To'g'ri/Noto'g'ri" : q.type === "open_ended" ? "Yozma" : "Variantli"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{q.points} ball | {q.timeLimit}s</span>
                        </div>
                        <p className="font-medium">{q.questionText}</p>
                        {q.mediaUrl && q.mediaType && (
                          <MediaPreview mediaUrl={q.mediaUrl} mediaType={q.mediaType} />
                        )}
                        {q.type === "open_ended" ? (
                          <div className="mt-2">
                            <span className="text-xs px-2 py-1 rounded-sm gradient-teal text-white">Javob: {q.correctAnswer}</span>
                          </div>
                        ) : q.options && (
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {(q.options as string[]).map((opt, oi) => (
                              <span key={oi} className={`text-xs px-2 py-1 rounded-sm ${
                                q.type === "true_false"
                                  ? ((opt === "To'g'ri" && q.correctAnswer === "true") || (opt === "Noto'g'ri" && q.correctAnswer === "false") ? "gradient-teal text-white" : "bg-muted")
                                  : (opt === q.correctAnswer ? "gradient-teal text-white" : "bg-muted")
                              }`}>
                                {q.type === "true_false" ? opt : `${String.fromCharCode(65 + oi)}) ${opt}`}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(q)} data-testid={`button-edit-q-${q.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteQuestion.mutate(q.id)} data-testid={`button-delete-q-${q.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
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
              <Select value={newQ.type} onValueChange={(v: "multiple_choice" | "true_false" | "open_ended") => setNewQ({ ...newQ, type: v, correctIndex: -1, openAnswer: "" })}>
                <SelectTrigger data-testid="select-question-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="multiple_choice">
                    <span className="flex items-center gap-2"><ListChecks className="w-4 h-4" /> Variantli (A/B/C/D)</span>
                  </SelectItem>
                  <SelectItem value="true_false">
                    <span className="flex items-center gap-2"><ToggleLeft className="w-4 h-4" /> To'g'ri / Noto'g'ri</span>
                  </SelectItem>
                  <SelectItem value="open_ended">
                    <span className="flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Yozma javob</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

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

            {newQ.type === "multiple_choice" && (
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
            )}

            {newQ.type === "true_false" && (
              <div className="space-y-2">
                <Label>To'g'ri javobni tanlang</Label>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`flex items-center justify-center gap-2 p-4 rounded-md border cursor-pointer transition-colors text-lg font-semibold ${
                      newQ.correctIndex === 0 ? "border-green-500 bg-green-500/10" : "hover-elevate"
                    }`}
                    data-testid="label-tf-true"
                  >
                    <input
                      type="radio"
                      name="correctAnswer"
                      checked={newQ.correctIndex === 0}
                      onChange={() => setNewQ({ ...newQ, correctIndex: 0 })}
                      className="w-4 h-4 accent-green-500"
                      data-testid="radio-tf-true"
                    />
                    <CheckCircle className="w-5 h-5 text-green-500" /> To'g'ri
                  </label>
                  <label
                    className={`flex items-center justify-center gap-2 p-4 rounded-md border cursor-pointer transition-colors text-lg font-semibold ${
                      newQ.correctIndex === 1 ? "border-red-500 bg-red-500/10" : "hover-elevate"
                    }`}
                    data-testid="label-tf-false"
                  >
                    <input
                      type="radio"
                      name="correctAnswer"
                      checked={newQ.correctIndex === 1}
                      onChange={() => setNewQ({ ...newQ, correctIndex: 1 })}
                      className="w-4 h-4 accent-red-500"
                      data-testid="radio-tf-false"
                    />
                    <X className="w-5 h-5 text-red-500" /> Noto'g'ri
                  </label>
                </div>
              </div>
            )}

            {newQ.type === "open_ended" && (
              <div className="space-y-2">
                <Label>To'g'ri javob (talaba kiritishi kerak bo'lgan javob)</Label>
                <Input
                  value={newQ.openAnswer}
                  onChange={(e) => setNewQ({ ...newQ, openAnswer: e.target.value })}
                  placeholder="To'g'ri javobni yozing..."
                  data-testid="input-open-correct"
                />
                <p className="text-xs text-muted-foreground">Talabaning javobi shu matnga mos kelsa, to'g'ri hisoblanadi (katta-kichik harfga e'tibor berilmaydi)</p>
              </div>
            )}

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

      <Dialog open={!!editingQuestion} onOpenChange={(open) => !open && setEditingQuestion(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Savolni tahrirlash</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Savol turi</Label>
              <Select value={editQ.type} onValueChange={(v) => setEditQ({ ...editQ, type: v, correctIndex: -1, openAnswer: "" })}>
                <SelectTrigger data-testid="edit-select-question-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="multiple_choice">
                    <span className="flex items-center gap-2"><ListChecks className="w-4 h-4" /> Variantli (A/B/C/D)</span>
                  </SelectItem>
                  <SelectItem value="true_false">
                    <span className="flex items-center gap-2"><ToggleLeft className="w-4 h-4" /> To'g'ri / Noto'g'ri</span>
                  </SelectItem>
                  <SelectItem value="open_ended">
                    <span className="flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Yozma javob</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Savol matni</Label>
              <Textarea value={editQ.questionText} onChange={(e) => setEditQ({ ...editQ, questionText: e.target.value })} data-testid="edit-input-question-text" />
            </div>

            {editQ.type === "multiple_choice" && (
              <div className="space-y-2">
                <Label>Javob variantlari</Label>
                {editQ.options.map((opt, i) => (
                  <label
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                      editQ.correctIndex === i ? "border-green-500 bg-green-500/10" : "hover-elevate"
                    }`}
                  >
                    <input
                      type="radio"
                      name="editCorrectAnswer"
                      checked={editQ.correctIndex === i}
                      onChange={() => setEditQ({ ...editQ, correctIndex: i })}
                      className="w-4 h-4 accent-green-500"
                      data-testid={`edit-radio-option-${i}`}
                    />
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center text-white text-sm font-bold shrink-0 ${["quiz-option-a", "quiz-option-b", "quiz-option-c", "quiz-option-d"][i]}`}>
                      {String.fromCharCode(65 + i)}
                    </div>
                    <Input
                      value={opt}
                      onChange={(e) => {
                        const opts = [...editQ.options];
                        opts[i] = e.target.value;
                        setEditQ({ ...editQ, options: opts });
                      }}
                      placeholder={`Variant ${String.fromCharCode(65 + i)}`}
                      className="flex-1"
                      data-testid={`edit-input-option-${i}`}
                    />
                  </label>
                ))}
              </div>
            )}

            {editQ.type === "true_false" && (
              <div className="space-y-2">
                <Label>To'g'ri javobni tanlang</Label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`flex items-center justify-center gap-2 p-4 rounded-md border cursor-pointer transition-colors text-lg font-semibold ${editQ.correctIndex === 0 ? "border-green-500 bg-green-500/10" : "hover-elevate"}`}>
                    <input type="radio" name="editCorrectAnswer" checked={editQ.correctIndex === 0} onChange={() => setEditQ({ ...editQ, correctIndex: 0 })} className="w-4 h-4 accent-green-500" data-testid="edit-radio-tf-true" />
                    <CheckCircle className="w-5 h-5 text-green-500" /> To'g'ri
                  </label>
                  <label className={`flex items-center justify-center gap-2 p-4 rounded-md border cursor-pointer transition-colors text-lg font-semibold ${editQ.correctIndex === 1 ? "border-red-500 bg-red-500/10" : "hover-elevate"}`}>
                    <input type="radio" name="editCorrectAnswer" checked={editQ.correctIndex === 1} onChange={() => setEditQ({ ...editQ, correctIndex: 1 })} className="w-4 h-4 accent-red-500" data-testid="edit-radio-tf-false" />
                    <X className="w-5 h-5 text-red-500" /> Noto'g'ri
                  </label>
                </div>
              </div>
            )}

            {editQ.type === "open_ended" && (
              <div className="space-y-2">
                <Label>To'g'ri javob</Label>
                <Input value={editQ.openAnswer} onChange={(e) => setEditQ({ ...editQ, openAnswer: e.target.value })} placeholder="To'g'ri javobni yozing..." data-testid="edit-input-open-correct" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Ball</Label>
                <Input type="number" value={editQ.points} onChange={(e) => setEditQ({ ...editQ, points: Number(e.target.value) })} data-testid="edit-input-points" />
              </div>
              <div>
                <Label>Vaqt (soniya)</Label>
                <Input type="number" value={editQ.timeLimit} onChange={(e) => setEditQ({ ...editQ, timeLimit: Number(e.target.value) })} data-testid="edit-input-time-limit" />
              </div>
            </div>
            <Button onClick={handleSaveEdit} disabled={updateQuestion.isPending} className="w-full gradient-purple border-0" data-testid="button-save-edit">
              {updateQuestion.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Saqlash
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
