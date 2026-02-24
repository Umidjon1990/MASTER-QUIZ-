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
import { Plus, Trash2, Edit, Play, Send, Users, Megaphone, Loader2, Bot, CalendarClock, X, Copy, Clock, CheckCircle, Lock, Unlock, Repeat, FolderPlus, FolderInput, ChevronUp, ChevronDown, BookOpen, Share2, Download, FileText, FileType } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import type { Quiz, UserProfile, TelegramChat, QuizCategory, QuizFolder } from "@shared/schema";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderOpen, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function QuizRow({ quiz, qIdx, totalInFolder, folderId, folders, hasTelegramBot, onEdit, onLive, onSchedule, onTelegram, onMove, onDelete, onMoveUp, onMoveDown, onCancelSchedule, onCopyLink, onShare, onExport, formatCountdown, toast }: {
  quiz: Quiz;
  qIdx: number;
  totalInFolder: number;
  folderId: string | null;
  folders: QuizFolder[];
  hasTelegramBot: boolean;
  onEdit: () => void;
  onLive: () => void;
  onSchedule: () => void;
  onTelegram: () => void;
  onMove: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onCancelSchedule: () => void;
  onCopyLink: (code: string) => void;
  onShare: () => void;
  onExport: (format: "pdf" | "docx", withAnswers: boolean) => void;
  formatCountdown: (scheduledAt: string | Date) => string;
  toast: (opts: any) => void;
}) {
  return (
    <div className="p-4 hover:bg-muted/30 transition-colors" data-testid={`card-quiz-${quiz.id}`}>
      <div className="flex items-start gap-3">
        {folderId && (
          <div className="flex flex-col items-center gap-0.5 pt-0.5 shrink-0">
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={onMoveUp} disabled={qIdx === 0} data-testid={`button-quiz-up-${quiz.id}`}>
              <ChevronUp className="w-3 h-3" />
            </Button>
            <span className="text-xs font-bold text-muted-foreground w-5 text-center">{qIdx + 1}</span>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={onMoveDown} disabled={qIdx === totalInFolder - 1} data-testid={`button-quiz-down-${quiz.id}`}>
              <ChevronDown className="w-3 h-3" />
            </Button>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold">{quiz.title}</h3>
            <div className="flex gap-1.5 flex-wrap shrink-0">
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
            <p className="text-sm text-muted-foreground mb-1.5 line-clamp-1">{quiz.description}</p>
          )}

          <div className="flex gap-1.5 items-center mb-2 flex-wrap">
            {quiz.category && <Badge variant="secondary" className="text-xs">{quiz.category}</Badge>}
            {quiz.allowReplay && <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-600 dark:text-blue-400"><Repeat className="w-3 h-3 mr-0.5" />Qayta yechish</Badge>}
            <span className="text-sm text-muted-foreground">{quiz.totalQuestions} savol | {quiz.totalPlays} marta o'ynalgan</span>
          </div>

          {quiz.scheduledStatus === "pending" && quiz.scheduledAt && (
            <div className="mb-2 p-2.5 rounded-md bg-orange-50 dark:bg-orange-950/20 border border-orange-200/50 dark:border-orange-800/30">
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
                      <Button variant="ghost" size="sm" onClick={() => onCopyLink(quiz.scheduledCode!)} data-testid={`button-copy-link-${quiz.id}`}>
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
                  <Button variant="ghost" size="sm" onClick={onCancelSchedule} data-testid={`button-cancel-schedule-${quiz.id}`}>
                    <X className="w-3 h-3 mr-1" /> Bekor
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={onEdit} data-testid={`button-edit-${quiz.id}`}>
              <Edit className="w-3 h-3 mr-1" /> Tahrirlash
            </Button>
            {quiz.status === "published" && (
              <Button size="sm" className="gradient-purple border-0" onClick={onLive} data-testid={`button-start-live-${quiz.id}`}>
                <Play className="w-3 h-3 mr-1" /> Jonli
              </Button>
            )}
            {quiz.status === "published" && quiz.scheduledStatus !== "pending" && (
              <Button variant="outline" size="sm" onClick={onSchedule} data-testid={`button-schedule-${quiz.id}`}>
                <CalendarClock className="w-3 h-3 mr-1" /> Rejalashtirish
              </Button>
            )}
            {hasTelegramBot && quiz.totalQuestions > 0 && (
              <Button variant="outline" size="sm" onClick={onTelegram} data-testid={`button-telegram-${quiz.id}`}>
                <Send className="w-3 h-3 mr-1" /> Telegram
              </Button>
            )}
            {quiz.status === "published" && (
              <Button variant="outline" size="sm" onClick={onShare} data-testid={`button-share-${quiz.id}`}>
                <Share2 className="w-3 h-3 mr-1" /> Mustaqil test
              </Button>
            )}
            {quiz.totalQuestions > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid={`button-download-${quiz.id}`}>
                    <Download className="w-3 h-3 mr-1" /> Yuklab olish
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => onExport("pdf", false)} data-testid={`download-pdf-no-answers-${quiz.id}`}>
                    <FileText className="w-3.5 h-3.5 mr-1.5" /> PDF (javoblarsiz)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onExport("pdf", true)} data-testid={`download-pdf-with-answers-${quiz.id}`}>
                    <FileText className="w-3.5 h-3.5 mr-1.5" /> PDF (javoblari bilan)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onExport("docx", false)} data-testid={`download-docx-no-answers-${quiz.id}`}>
                    <FileType className="w-3.5 h-3.5 mr-1.5" /> Word (javoblarsiz)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onExport("docx", true)} data-testid={`download-docx-with-answers-${quiz.id}`}>
                    <FileType className="w-3.5 h-3.5 mr-1.5" /> Word (javoblari bilan)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {folders && folders.length > 0 && (
              <Button variant="ghost" size="sm" onClick={onMove} data-testid={`button-move-folder-${quiz.id}`}>
                <FolderInput className="w-3 h-3" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onDelete} data-testid={`button-delete-${quiz.id}`}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [moveQuiz, setMoveQuiz] = useState<Quiz | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [shareLoading, setShareLoading] = useState(false);

  const handleShare = async (quiz: Quiz) => {
    setShareLoading(true);
    try {
      const res = await apiRequest("POST", `/api/quizzes/${quiz.id}/share`);
      const data = await res.json();
      const link = `${window.location.origin}/shared/${data.code}`;
      setShareLink(link);
      setShareDialogOpen(true);
    } catch (err: any) {
      toast({ title: "Xatolik", description: err.message || "Link yaratib bo'lmadi", variant: "destructive" });
    } finally {
      setShareLoading(false);
    }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink);
    toast({ title: "Link nusxalandi!" });
  };

  const handleExport = async (quizId: string, format: "pdf" | "docx", withAnswers: boolean) => {
    try {
      toast({ title: "Yuklab olinmoqda..." });
      const response = await fetch(`/api/quizzes/${quizId}/export/${format}?answers=${withAnswers}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Xatolik");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = response.headers.get("Content-Disposition");
      let filename = `quiz.${format}`;
      if (disposition) {
        const match = disposition.match(/filename="?(.+?)"?$/);
        if (match) filename = decodeURIComponent(match[1]);
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Muvaffaqiyatli yuklandi!" });
    } catch (error: any) {
      toast({ title: "Xatolik", description: error.message, variant: "destructive" });
    }
  };

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

  const categoryFiltered = quizzes?.filter(q => {
    if (categoryFilter === "all") return true;
    if (categoryFilter === "__uncategorized") return !q.category;
    return q.category === categoryFilter;
  });

  const getQuizzesForFolder = (folderId: string) => {
    return (categoryFiltered || [])
      .filter(q => q.folderId === folderId)
      .sort((a, b) => ((a as any).orderInFolder || 0) - ((b as any).orderInFolder || 0));
  };

  const unfiledQuizzes = (categoryFiltered || []).filter(q => !q.folderId);

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
      toast({ title: "Dars yaratildi" });
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
      toast({ title: "Dars o'chirildi" });
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
      toast({ title: "Darsga ko'chirildi" });
    },
  });

  const reorderFoldersMutation = useMutation({
    mutationFn: async (folderIds: string[]) => {
      const res = await apiRequest("POST", "/api/quiz-folders/reorder", { folderIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quiz-folders"] });
    },
  });

  const reorderQuizzesMutation = useMutation({
    mutationFn: async ({ folderId, quizIds }: { folderId: string; quizIds: string[] }) => {
      const res = await apiRequest("POST", `/api/quiz-folders/${folderId}/reorder-quizzes`, { quizIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
    },
  });

  const moveFolderUp = (folderId: string) => {
    if (!folders) return;
    const idx = folders.findIndex(f => f.id === folderId);
    if (idx <= 0) return;
    const newOrder = folders.map(f => f.id);
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    reorderFoldersMutation.mutate(newOrder);
  };

  const moveFolderDown = (folderId: string) => {
    if (!folders) return;
    const idx = folders.findIndex(f => f.id === folderId);
    if (idx < 0 || idx >= folders.length - 1) return;
    const newOrder = folders.map(f => f.id);
    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    reorderFoldersMutation.mutate(newOrder);
  };

  const moveQuizUp = (quizId: string, folderId: string) => {
    const folderQuizzes = getQuizzesForFolder(folderId);
    const idx = folderQuizzes.findIndex(q => q.id === quizId);
    if (idx <= 0) return;
    const newOrder = folderQuizzes.map(q => q.id);
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    reorderQuizzesMutation.mutate({ folderId, quizIds: newOrder });
  };

  const moveQuizDown = (quizId: string, folderId: string) => {
    const folderQuizzes = getQuizzesForFolder(folderId);
    const idx = folderQuizzes.findIndex(q => q.id === quizId);
    if (idx < 0 || idx >= folderQuizzes.length - 1) return;
    const newOrder = folderQuizzes.map(q => q.id);
    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    reorderQuizzesMutation.mutate({ folderId, quizIds: newOrder });
  };

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

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-5 w-3/4 mb-3" />
              <Skeleton className="h-4 w-1/2 mb-4" />
              <Skeleton className="h-9 w-full" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {showNewFolderInput ? (
              <div className="flex items-center gap-1">
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Dars nomi..."
                  className="h-8 w-48"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && newFolderName.trim()) createFolderMutation.mutate(newFolderName.trim()); if (e.key === "Escape") { setShowNewFolderInput(false); setNewFolderName(""); } }}
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
                <FolderPlus className="w-4 h-4 mr-1" /> Yangi bo'lim yaratish
              </Button>
            )}
          </div>

          {folders && folders.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {folders.map((folder, fIdx) => {
                const folderQuizzes = getQuizzesForFolder(folder.id);
                return (
                  <motion.div key={folder.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: fIdx * 0.05 }}>
                    <Card
                      className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all"
                      onClick={() => navigate(`/teacher/folder/${folder.id}`)}
                      data-testid={`folder-card-${folder.id}`}
                    >
                      <div className="p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <Badge className="px-2.5 py-1 text-sm font-bold rounded-full gradient-purple border-0 text-white shrink-0">{fIdx + 1}</Badge>
                          <h3 className="font-semibold text-base flex-1 min-w-0 truncate">{folder.name}</h3>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{folderQuizzes.length} ta quiz</span>
                          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveFolderUp(folder.id)} disabled={fIdx === 0} data-testid={`button-folder-up-${folder.id}`}>
                              <ChevronUp className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveFolderDown(folder.id)} disabled={fIdx === (folders?.length || 1) - 1} data-testid={`button-folder-down-${folder.id}`}>
                              <ChevronDown className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => { if (confirm(`"${folder.name}" darsini o'chirmoqchimisiz?`)) deleteFolderMutation.mutate(folder.id); }} data-testid={`button-delete-folder-${folder.id}`}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}

          {unfiledQuizzes.length > 0 && (
            <>
              {folders && folders.length > 0 && (
                <div className="flex items-center gap-2 pt-2">
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                  <h2 className="font-semibold text-base text-muted-foreground">Darssiz quizlar</h2>
                  <Badge variant="secondary" className="text-xs">{unfiledQuizzes.length}</Badge>
                </div>
              )}
              <div className="space-y-3">
                {unfiledQuizzes.map((quiz, qIdx) => (
                  <motion.div key={quiz.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ((folders?.length || 0) + qIdx) * 0.03 }}>
                    <Card className="overflow-hidden">
                      <QuizRow
                        quiz={quiz}
                        qIdx={qIdx}
                        totalInFolder={unfiledQuizzes.length}
                        folderId={null}
                        folders={folders || []}
                        hasTelegramBot={hasTelegramBot}
                        onEdit={() => navigate(`/teacher/quizzes/${quiz.id}`)}
                        onLive={() => navigate(`/teacher/live?quizId=${quiz.id}`)}
                        onExport={(format, withAnswers) => handleExport(quiz.id, format, withAnswers)}
                        onSchedule={() => { const defs = getUzbekistanDefaults(); setScheduleDate(defs.date); setScheduleTime(defs.time); setScheduleQuiz(quiz); }}
                        onTelegram={() => setTelegramQuiz(quiz)}
                        onMove={() => setMoveQuiz(quiz)}
                        onDelete={() => deleteQuiz.mutate(quiz.id)}
                        onMoveUp={() => {}}
                        onMoveDown={() => {}}
                        onCancelSchedule={() => cancelScheduleMutation.mutate(quiz.id)}
                        onShare={() => handleShare(quiz)}
                        onCopyLink={copyScheduleLink}
                        formatCountdown={formatCountdown}
                        toast={toast}
                      />
                    </Card>
                  </motion.div>
                ))}
              </div>
            </>
          )}

          {(!quizzes || quizzes.length === 0) && (!folders || folders.length === 0) && (
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
        </div>
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
              <BookOpen className="w-5 h-5 inline mr-2" />
              Darsga ko'chirish
            </DialogTitle>
          </DialogHeader>
          {moveQuiz && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-3">
                <span className="font-medium text-foreground">"{moveQuiz.title}"</span> testini qaysi darsga ko'chirmoqchisiz?
              </p>
              {moveQuiz.folderId && (
                <div
                  className="flex items-center gap-3 p-3 rounded-md border hover-elevate cursor-pointer"
                  onClick={() => moveToFolderMutation.mutate({ quizId: moveQuiz.id, folderId: null })}
                  data-testid="button-remove-from-folder"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Darsdan chiqarish</span>
                </div>
              )}
              {folders && folders.map((f, idx) => (
                <div
                  key={f.id}
                  className={`flex items-center gap-3 p-3 rounded-md border hover-elevate cursor-pointer ${moveQuiz.folderId === f.id ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => moveToFolderMutation.mutate({ quizId: moveQuiz.id, folderId: f.id })}
                  data-testid={`button-move-to-${f.id}`}
                >
                  <Badge variant="secondary" className="px-1.5 py-0 text-xs font-bold rounded-full">{idx + 1}</Badge>
                  <span className="text-sm font-medium">{f.name}</span>
                  {moveQuiz.folderId === f.id && <CheckCircle className="w-4 h-4 text-primary ml-auto" />}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              <Share2 className="w-5 h-5 inline mr-2" />
              Mustaqil test linki
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Bu linkni o'quvchilarga yuboring. Ular mustaqil ravishda testni yechishlari mumkin.
            </p>
            <div className="flex items-center gap-2">
              <Input value={shareLink} readOnly className="font-mono text-sm" data-testid="input-share-link" />
              <Button size="sm" onClick={copyShareLink} data-testid="button-copy-share-link">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
