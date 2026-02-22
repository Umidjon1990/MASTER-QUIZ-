import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Edit, Play, Eye, Upload, Send, Users, Megaphone, Loader2, Bot, CalendarClock, X, Copy, Link, Clock, CheckCircle, Lock, Unlock, School, Repeat, FolderPlus, FolderInput } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import type { Quiz, UserProfile, TelegramChat, QuizCategory, QuizFolder } from "@shared/schema";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderOpen, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function getUzbekistanDefaults() {
  const fmt = (n: number) => String(n).padStart(2, "0");
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value || "";
  const minDate = `${get("year")}-${get("month")}-${get("day")}`;
  let year = parseInt(get("year"), 10);
  let month = parseInt(get("month"), 10);
  let day = parseInt(get("day"), 10);
  let hour = parseInt(get("hour"), 10) + 1;
  const minute = parseInt(get("minute"), 10);
  if (hour >= 24) {
    hour = 0;
    const daysInMonth = new Date(year, month, 0).getDate();
    day += 1;
    if (day > daysInMonth) { day = 1; month += 1; }
    if (month > 12) { month = 1; year += 1; }
  }
  return { date: `${year}-${fmt(month)}-${fmt(day)}`, time: `${fmt(hour)}:${fmt(minute)}`, minDate };
}

export default function TeacherQuizzes() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [telegramQuiz, setTelegramQuiz] = useState<Quiz | null>(null);
  const [scheduleQuiz, setScheduleQuiz] = useState<Quiz | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleRequireCode, setScheduleRequireCode] = useState(true);
  const [scheduleTelegramEnabled, setScheduleTelegramEnabled] = useState(false);
  const [scheduleTelegramChatId, setScheduleTelegramChatId] = useState("");
  const [scheduleTelegramQuizEnabled, setScheduleTelegramQuizEnabled] = useState(false);
  const [scheduleTelegramQuizChatId, setScheduleTelegramQuizChatId] = useState("");
  const [scheduleAllowReplay, setScheduleAllowReplay] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [moveQuiz, setMoveQuiz] = useState<Quiz | null>(null);

  const { data: quizzes, isLoading } = useQuery<Quiz[]>({
    queryKey: ["/api/quizzes"],
    refetchInterval: 30000,
  });

  const { data: categories } = useQuery<QuizCategory[]>({
    queryKey: ["/api/quiz-categories"],
  });

  const { data: folders } = useQuery<QuizFolder[]>({
    queryKey: ["/api/quiz-folders"],
  });

  const filteredQuizzes = quizzes?.filter(q => {
    if (categoryFilter !== "all") {
      if (categoryFilter === "__uncategorized" && q.category) return false;
      if (categoryFilter !== "__uncategorized" && q.category !== categoryFilter) return false;
    }
    if (folderFilter !== "all") {
      if (folderFilter === "__unfiled" && q.folderId) return false;
      if (folderFilter !== "__unfiled" && q.folderId !== folderFilter) return false;
    }
    return true;
  });

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
  });

  const telegramChats = ((profile?.telegramChats as TelegramChat[]) || []);
  const hasTelegramBot = !!(profile as any)?.hasTelegramBot;

  const sendToTelegramMutation = useMutation({
    mutationFn: async ({ quizId, chatId }: { quizId: string; chatId: string }) => {
      const res = await apiRequest("POST", "/api/telegram/send-quiz", {
        quizId,
        chatId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `${data.sent} ta savol Telegramga yuborildi!` });
      setTelegramQuiz(null);
    },
    onError: (error: any) => {
      toast({ title: error.message || "Telegramga yuborishda xatolik", variant: "destructive" });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/quiz-folders", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quiz-folders"] });
      setNewFolderName("");
      setShowNewFolderInput(false);
      toast({ title: "Papka yaratildi" });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/quiz-folders/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quiz-folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      if (folderFilter !== "all") setFolderFilter("all");
      toast({ title: "Papka o'chirildi" });
    },
  });

  const moveToFolderMutation = useMutation({
    mutationFn: async ({ quizId, folderId }: { quizId: string; folderId: string | null }) => {
      const res = await apiRequest("POST", `/api/quizzes/${quizId}/move-to-folder`, { folderId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      setMoveQuiz(null);
      toast({ title: "Quiz ko'chirildi" });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async ({ quizId, scheduledAt, requireCode, telegramChatId, telegramQuizChatId, allowReplay }: { quizId: string; scheduledAt: string; requireCode: boolean; telegramChatId?: string; telegramQuizChatId?: string; allowReplay?: boolean }) => {
      const res = await apiRequest("POST", `/api/quizzes/${quizId}/schedule`, { scheduledAt, requireCode, telegramChatId, telegramQuizChatId, allowReplay });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Xatolik");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      setScheduleQuiz(null);
      setScheduleDate("");
      setScheduleTime("");
      setScheduleTelegramEnabled(false);
      setScheduleTelegramChatId("");
      setScheduleTelegramQuizEnabled(false);
      setScheduleTelegramQuizChatId("");
      setScheduleAllowReplay(false);
      toast({ title: "Quiz rejalashtirildi!" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Rejalashtirishda xatolik", variant: "destructive" });
    },
  });

  const cancelScheduleMutation = useMutation({
    mutationFn: async (quizId: string) => {
      const res = await apiRequest("POST", `/api/quizzes/${quizId}/cancel-schedule`);
      if (!res.ok) throw new Error("Xatolik");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      toast({ title: "Reja bekor qilindi" });
    },
  });

  const deleteQuiz = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/quizzes/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      toast({ title: "Quiz o'chirildi" });
    },
  });

  const handleSchedule = () => {
    if (!scheduleQuiz || !scheduleDate || !scheduleTime) {
      toast({ title: "Sana va vaqtni kiriting", variant: "destructive" });
      return;
    }
    if (scheduleTelegramEnabled && !scheduleTelegramChatId) {
      toast({ title: "Natija uchun Telegram chatni tanlang yoki o'chiring", variant: "destructive" });
      return;
    }
    if (scheduleTelegramQuizEnabled && !scheduleTelegramQuizChatId) {
      toast({ title: "Quiz uchun Telegram chatni tanlang yoki o'chiring", variant: "destructive" });
      return;
    }
    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00+05:00`).toISOString();
    const telegramChatId = scheduleTelegramEnabled && scheduleTelegramChatId ? scheduleTelegramChatId : undefined;
    const telegramQuizChatId = scheduleTelegramQuizEnabled && scheduleTelegramQuizChatId ? scheduleTelegramQuizChatId : undefined;
    scheduleMutation.mutate({ quizId: scheduleQuiz.id, scheduledAt, requireCode: scheduleRequireCode, telegramChatId, telegramQuizChatId, allowReplay: scheduleAllowReplay });
  };

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (scheduledAt: string | Date) => {
    const target = new Date(scheduledAt).getTime();
    const diff = target - now;
    if (diff <= 0) return "Vaqt keldi!";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    if (days > 0) return `${days}k ${hours}s ${minutes}d qoldi`;
    if (hours > 0) return `${hours}s ${minutes}d ${seconds}s qoldi`;
    return `${minutes}d ${seconds}s qoldi`;
  };

  const copyScheduleLink = (quizScheduledCode: string) => {
    const link = `${window.location.origin}/play/scheduled/${quizScheduledCode}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Link nusxalandi!" });
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-quizzes-title">Quizlarim</h1>
          <p className="text-muted-foreground">Barcha quizlarni boshqarish</p>
        </div>
        <Button className="gradient-purple border-0" onClick={() => navigate("/teacher/quizzes/new")} data-testid="button-new-quiz">
          <Plus className="w-4 h-4 mr-1" /> Yangi Quiz
        </Button>
      </motion.div>

      {categories && categories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <FolderOpen className="w-4 h-4 text-muted-foreground" />
          <div className="flex gap-1.5 flex-wrap">
            <Button
              variant={categoryFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setCategoryFilter("all")}
              data-testid="filter-category-all"
            >
              Barchasi
            </Button>
            {categories.map(cat => (
              <Button
                key={cat.id}
                variant={categoryFilter === cat.name ? "default" : "outline"}
                size="sm"
                onClick={() => setCategoryFilter(cat.name)}
                data-testid={`filter-category-${cat.id}`}
              >
                {cat.name}
              </Button>
            ))}
            <Button
              variant={categoryFilter === "__uncategorized" ? "default" : "outline"}
              size="sm"
              onClick={() => setCategoryFilter("__uncategorized")}
              data-testid="filter-category-uncategorized"
            >
              Kategoriyasiz
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <FolderInput className="w-4 h-4 text-muted-foreground" />
        <div className="flex gap-1.5 flex-wrap items-center">
          <Button
            variant={folderFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFolderFilter("all")}
            data-testid="filter-folder-all"
          >
            Barchasi
          </Button>
          {folders && folders.map(f => (
            <div key={f.id} className="flex items-center gap-0.5">
              <Button
                variant={folderFilter === f.id ? "default" : "outline"}
                size="sm"
                onClick={() => setFolderFilter(f.id)}
                data-testid={`filter-folder-${f.id}`}
              >
                {f.name}
              </Button>
              {folderFilter === f.id && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { if (confirm(`"${f.name}" papkasini o'chirmoqchimisiz?`)) deleteFolderMutation.mutate(f.id); }} data-testid={`button-delete-folder-${f.id}`}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}
          <Button
            variant={folderFilter === "__unfiled" ? "default" : "outline"}
            size="sm"
            onClick={() => setFolderFilter("__unfiled")}
            data-testid="filter-folder-unfiled"
          >
            Papkasiz
          </Button>
          {showNewFolderInput ? (
            <div className="flex items-center gap-1">
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Papka nomi..."
                className="h-8 w-36"
                onKeyDown={(e) => { if (e.key === "Enter" && newFolderName.trim()) createFolderMutation.mutate(newFolderName.trim()); }}
                data-testid="input-new-folder"
              />
              <Button size="sm" className="h-8" onClick={() => { if (newFolderName.trim()) createFolderMutation.mutate(newFolderName.trim()); }} disabled={!newFolderName.trim()} data-testid="button-create-folder">
                <CheckCircle className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowNewFolderInput(false); setNewFolderName(""); }} data-testid="button-cancel-folder">
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setShowNewFolderInput(true)} data-testid="button-new-folder">
              <FolderPlus className="w-3 h-3 mr-1" /> Papka
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-5 w-3/4 mb-3" />
              <Skeleton className="h-4 w-1/2 mb-4" />
              <Skeleton className="h-9 w-full" />
            </Card>
          ))}
        </div>
      ) : filteredQuizzes && filteredQuizzes.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {filteredQuizzes.map((quiz) => (
            <motion.div key={quiz.id} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
              <Card className="p-5 hover-elevate" data-testid={`card-quiz-${quiz.id}`}>
                <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                  <h3 className="font-semibold">{quiz.title}</h3>
                  <div className="flex gap-1.5 flex-wrap">
                    {quiz.scheduledStatus === "pending" && (
                      <>
                        <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-600 dark:text-orange-400">
                          <CalendarClock className="w-3 h-3 mr-1" />
                          Rejalashtirilgan
                        </Badge>
                        {!quiz.scheduledRequireCode && (
                          <Badge variant="outline" className="text-xs border-green-500/30 text-green-600 dark:text-green-400">
                            <Unlock className="w-3 h-3 mr-1" />
                            Ochiq
                          </Badge>
                        )}
                      </>
                    )}
                    {quiz.scheduledStatus === "started" && (
                      <Badge variant="outline" className="text-xs border-green-500/30 text-green-600 dark:text-green-400">
                        <Play className="w-3 h-3 mr-1" />
                        Boshlandi
                      </Badge>
                    )}
                    <Badge variant={quiz.status === "published" ? "default" : "secondary"}>
                      {quiz.status === "published" ? "Nashr" : "Qoralama"}
                    </Badge>
                  </div>
                </div>
                {quiz.description && (
                  <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{quiz.description}</p>
                )}
                <div className="flex gap-1.5 items-center mb-1 flex-wrap">
                  {quiz.category && <Badge variant="secondary" className="text-xs">{quiz.category}</Badge>}
                  {quiz.folderId && folders && (() => { const f = folders.find(fo => fo.id === quiz.folderId); return f ? <Badge variant="outline" className="text-xs"><FolderOpen className="w-3 h-3 mr-0.5" />{f.name}</Badge> : null; })()}
                  {quiz.allowReplay && <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-600 dark:text-blue-400"><Repeat className="w-3 h-3 mr-0.5" />Qayta yechish</Badge>}
                  <span className="text-sm text-muted-foreground">{quiz.totalQuestions} savol | {quiz.totalPlays} marta o'ynalgan</span>
                </div>

                {quiz.scheduledStatus === "pending" && quiz.scheduledAt && (
                  <div className="mb-3 p-2.5 rounded-md bg-orange-50 dark:bg-orange-950/20 border border-orange-200/50 dark:border-orange-800/30">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="w-3.5 h-3.5 text-orange-500" />
                          <span className="text-orange-700 dark:text-orange-300 font-medium">
                            {new Date(quiz.scheduledAt).toLocaleDateString("uz-UZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" })}
                          </span>
                        </div>
                        <p className="text-xs font-medium tabular-nums text-orange-600 dark:text-orange-400 pl-5" data-testid={`countdown-${quiz.id}`}>
                          {formatCountdown(quiz.scheduledAt)}
                        </p>
                      </div>
                      <div className="flex gap-1.5 items-center flex-wrap">
                        {quiz.scheduledRequireCode && quiz.scheduledCode && (
                          <>
                            <Badge variant="secondary" className="font-mono tracking-wider text-xs">{quiz.scheduledCode}</Badge>
                            <Button variant="ghost" size="sm" onClick={() => copyScheduleLink(quiz.scheduledCode!)} data-testid={`button-copy-link-${quiz.id}`}>
                              <Copy className="w-3 h-3 mr-1" /> Link
                            </Button>
                          </>
                        )}
                        {!quiz.scheduledRequireCode && (
                          <Button variant="ghost" size="sm" onClick={() => {
                            const link = `${window.location.origin}/play/scheduled-open/${quiz.id}`;
                            navigator.clipboard.writeText(link);
                            toast({ title: "Link nusxalandi!" });
                          }} data-testid={`button-copy-open-link-${quiz.id}`}>
                            <Copy className="w-3 h-3 mr-1" /> Ochiq link
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelScheduleMutation.mutate(quiz.id)}
                          data-testid={`button-cancel-schedule-${quiz.id}`}
                        >
                          <X className="w-3 h-3 mr-1" /> Bekor
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/quizzes/${quiz.id}`)} data-testid={`button-edit-${quiz.id}`}>
                    <Edit className="w-3 h-3 mr-1" /> Tahrirlash
                  </Button>
                  {quiz.status === "published" && (
                    <Button size="sm" className="gradient-purple border-0" onClick={() => navigate(`/teacher/live?quizId=${quiz.id}`)} data-testid={`button-start-live-${quiz.id}`}>
                      <Play className="w-3 h-3 mr-1" /> Jonli
                    </Button>
                  )}
                  {quiz.status === "published" && (
                    <Button size="sm" variant="outline" onClick={() => navigate(`/classroom/${quiz.id}`)} data-testid={`button-classroom-${quiz.id}`}>
                      <School className="w-3 h-3 mr-1" /> Sinf Xona
                    </Button>
                  )}
                  {quiz.status === "published" && quiz.scheduledStatus !== "pending" && (
                    <Button variant="outline" size="sm" onClick={() => { const defs = getUzbekistanDefaults(); setScheduleDate(defs.date); setScheduleTime(defs.time); setScheduleQuiz(quiz); }} data-testid={`button-schedule-${quiz.id}`}>
                      <CalendarClock className="w-3 h-3 mr-1" /> Rejalashtirish
                    </Button>
                  )}
                  {hasTelegramBot && quiz.totalQuestions > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setTelegramQuiz(quiz)} data-testid={`button-telegram-${quiz.id}`}>
                      <Send className="w-3 h-3 mr-1" /> Telegram
                    </Button>
                  )}
                  {folders && folders.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setMoveQuiz(quiz)} data-testid={`button-move-folder-${quiz.id}`}>
                      <FolderInput className="w-3 h-3" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => deleteQuiz.mutate(quiz.id)} data-testid={`button-delete-${quiz.id}`}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 rounded-full gradient-purple/10 flex items-center justify-center mx-auto mb-4">
            <Plus className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Quizlaringiz yo'q</h3>
          <p className="text-muted-foreground mb-4">Birinchi quizingizni yarating!</p>
          <Button className="gradient-purple border-0" onClick={() => navigate("/teacher/quizzes/new")} data-testid="button-first-quiz">
            <Plus className="w-4 h-4 mr-1" /> Yangi Quiz
          </Button>
        </Card>
      )}

      <Dialog open={!!telegramQuiz} onOpenChange={(open) => !open && setTelegramQuiz(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Telegramga ulashish</DialogTitle>
          </DialogHeader>
          {telegramQuiz && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">"{telegramQuiz.title}"</span> quizini qaysi guruh/kanalga yubormoqchisiz?
              </p>
              {telegramChats.length === 0 ? (
                <div className="text-center py-6 space-y-3">
                  <Bot className="w-8 h-8 mx-auto text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground">Hali guruh/kanal ulanmagan</p>
                  <Button variant="outline" onClick={() => { setTelegramQuiz(null); navigate("/teacher/telegram"); }} data-testid="button-go-telegram-settings">
                    Telegram sozlamalariga o'tish
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {telegramChats.map((chat) => (
                    <div
                      key={chat.chatId}
                      className="flex items-center justify-between gap-3 p-3 rounded-md border hover-elevate cursor-pointer"
                      data-testid={`button-send-to-chat-${chat.chatId}`}
                      onClick={() => sendToTelegramMutation.mutate({ quizId: telegramQuiz.id, chatId: chat.chatId })}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${chat.type === "channel" ? "gradient-teal" : "gradient-purple"}`}>
                          {chat.type === "channel" ? <Megaphone className="w-4 h-4 text-white" /> : <Users className="w-4 h-4 text-white" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{chat.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {chat.type === "channel" ? "Kanal" : "Guruh"}
                            {chat.username ? ` | @${chat.username}` : ""}
                          </p>
                        </div>
                      </div>
                      {sendToTelegramMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      ) : (
                        <Send className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!scheduleQuiz} onOpenChange={(open) => { if (!open) { setScheduleQuiz(null); setScheduleDate(""); setScheduleTime(""); setScheduleRequireCode(true); setScheduleTelegramEnabled(false); setScheduleTelegramChatId(""); setScheduleTelegramQuizEnabled(false); setScheduleTelegramQuizChatId(""); setScheduleAllowReplay(false); } else if (!scheduleDate) { const defs = getUzbekistanDefaults(); setScheduleDate(defs.date); setScheduleTime(defs.time); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              <CalendarClock className="w-5 h-5 inline mr-2" />
              Quizni rejalashtirish
            </DialogTitle>
          </DialogHeader>
          {scheduleQuiz && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">"{scheduleQuiz.title}"</span> quizi belgilangan vaqtda avtomatik boshlanadi. O'quvchilar linkni ochib kutish zalida kutishadi.
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Sana</label>
                  <Input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    min={getUzbekistanDefaults().minDate}
                    data-testid="input-schedule-date"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Vaqt</label>
                  <Input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    data-testid="input-schedule-time"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted">
                <div className="flex items-center gap-2">
                  {scheduleRequireCode ? <Lock className="w-4 h-4 text-muted-foreground" /> : <Unlock className="w-4 h-4 text-muted-foreground" />}
                  <div>
                    <p className="text-sm font-medium">Kod bilan kirish</p>
                    <p className="text-xs text-muted-foreground">
                      {scheduleRequireCode ? "O'quvchilar faqat kod orqali kirishlari mumkin" : "O'quvchilar to'g'ridan-to'g'ri link orqali kirishlari mumkin"}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={scheduleRequireCode}
                  onCheckedChange={setScheduleRequireCode}
                  data-testid="switch-require-code"
                />
              </div>
              <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted">
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Qayta yechish mumkin</p>
                    <p className="text-xs text-muted-foreground">
                      {scheduleAllowReplay ? "Test tugagandan keyin o'quvchilar qayta yecha oladi" : "Test tugagandan keyin qayta yechib bo'lmaydi"}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={scheduleAllowReplay}
                  onCheckedChange={setScheduleAllowReplay}
                  data-testid="switch-allow-replay"
                />
              </div>
              {hasTelegramBot && telegramChats.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Natijalarni Telegramga yuborish</p>
                        <p className="text-xs text-muted-foreground">
                          Quiz tugagach natijalar avtomatik yuboriladi
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={scheduleTelegramEnabled}
                      onCheckedChange={(checked) => {
                        setScheduleTelegramEnabled(checked);
                        if (!checked) setScheduleTelegramChatId("");
                      }}
                      data-testid="switch-telegram-auto-send"
                    />
                  </div>
                  {scheduleTelegramEnabled && (
                    <Select value={scheduleTelegramChatId} onValueChange={setScheduleTelegramChatId}>
                      <SelectTrigger data-testid="select-telegram-chat">
                        <SelectValue placeholder="Chat tanlang..." />
                      </SelectTrigger>
                      <SelectContent>
                        {telegramChats.map((chat) => (
                          <SelectItem key={chat.chatId} value={chat.chatId} data-testid={`select-chat-${chat.chatId}`}>
                            {chat.title || chat.chatId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              {hasTelegramBot && telegramChats.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted">
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Quizni Telegramga yuborish</p>
                        <p className="text-xs text-muted-foreground">
                          Test tugagach quiz savollar boshqa kanalga yuboriladi
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={scheduleTelegramQuizEnabled}
                      onCheckedChange={(checked) => {
                        setScheduleTelegramQuizEnabled(checked);
                        if (!checked) setScheduleTelegramQuizChatId("");
                      }}
                      data-testid="switch-telegram-quiz-send"
                    />
                  </div>
                  {scheduleTelegramQuizEnabled && (
                    <Select value={scheduleTelegramQuizChatId} onValueChange={setScheduleTelegramQuizChatId}>
                      <SelectTrigger data-testid="select-telegram-quiz-chat">
                        <SelectValue placeholder="Quiz yuborish uchun chat tanlang..." />
                      </SelectTrigger>
                      <SelectContent>
                        {telegramChats.map((chat) => (
                          <SelectItem key={chat.chatId} value={chat.chatId} data-testid={`select-quiz-chat-${chat.chatId}`}>
                            {chat.title || chat.chatId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              {scheduleDate && scheduleTime && (
                <div className="p-3 rounded-md bg-muted text-sm text-center">
                  <Clock className="w-4 h-4 inline mr-1.5" />
                  {new Date(`${scheduleDate}T${scheduleTime}:00+05:00`).toLocaleDateString("uz-UZ", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Tashkent",
                  })}
                  <span className="text-muted-foreground ml-1">(O'zbekiston vaqti)</span>
                </div>
              )}
              <Button
                className="w-full gradient-purple border-0"
                onClick={handleSchedule}
                disabled={scheduleMutation.isPending || !scheduleDate || !scheduleTime}
                data-testid="button-confirm-schedule"
              >
                {scheduleMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <CalendarClock className="w-4 h-4 mr-2" />
                )}
                Rejalashtirish
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!moveQuiz} onOpenChange={(open) => !open && setMoveQuiz(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              <FolderInput className="w-5 h-5 inline mr-2" />
              Papkaga ko'chirish
            </DialogTitle>
          </DialogHeader>
          {moveQuiz && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-3">
                <span className="font-medium text-foreground">"{moveQuiz.title}"</span> quizini qaysi papkaga ko'chirmoqchisiz?
              </p>
              {moveQuiz.folderId && (
                <div
                  className="flex items-center gap-3 p-3 rounded-md border hover-elevate cursor-pointer"
                  onClick={() => moveToFolderMutation.mutate({ quizId: moveQuiz.id, folderId: null })}
                  data-testid="button-remove-from-folder"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Papkadan chiqarish</span>
                </div>
              )}
              {folders && folders.map(f => (
                <div
                  key={f.id}
                  className={`flex items-center gap-3 p-3 rounded-md border hover-elevate cursor-pointer ${moveQuiz.folderId === f.id ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => moveToFolderMutation.mutate({ quizId: moveQuiz.id, folderId: f.id })}
                  data-testid={`button-move-to-${f.id}`}
                >
                  <FolderOpen className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{f.name}</span>
                  {moveQuiz.folderId === f.id && <CheckCircle className="w-4 h-4 text-primary ml-auto" />}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
