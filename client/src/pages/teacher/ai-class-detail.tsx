import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Power, PowerOff, Users, ListChecks, Settings, BarChart3, X, Phone, Wifi, WifiOff, Pencil, Check, ChevronDown, ChevronRight, Send, Upload, Loader2, Download, DollarSign, EyeOff, Eye, CreditCard, Copy } from "lucide-react";
import { motion } from "framer-motion";

const cleanName = (s: string) => {
  let r = s.replace(/[\u200E\u200F\u200B\u200C\u200D\uFEFF]/g, "");
  r = Array.from(r).map(c => {
    const cp = c.codePointAt(0)!;
    if (cp >= 0x1D400 && cp <= 0x1D419) return String.fromCharCode(65 + cp - 0x1D400);
    if (cp >= 0x1D41A && cp <= 0x1D433) return String.fromCharCode(97 + cp - 0x1D41A);
    if (cp >= 0x1D434 && cp <= 0x1D44D) return String.fromCharCode(65 + cp - 0x1D434);
    if (cp >= 0x1D44E && cp <= 0x1D467) return String.fromCharCode(97 + cp - 0x1D44E);
    if (cp >= 0x1D468 && cp <= 0x1D481) return String.fromCharCode(65 + cp - 0x1D468);
    if (cp >= 0x1D482 && cp <= 0x1D49B) return String.fromCharCode(97 + cp - 0x1D482);
    return c;
  }).join("");
  return r.trim();
};

export default function AiClassDetail() {
  const [, params] = useRoute("/teacher/ai-classes/:id");
  const classId = params?.id;
  const { toast } = useToast();

  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentPhone, setNewStudentPhone] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPrompt, setNewTaskPrompt] = useState("");
  const [newTaskRef, setNewTaskRef] = useState("");
  const [newTaskLessonNum, setNewTaskLessonNum] = useState(1);
  const [newTaskHasParts, setNewTaskHasParts] = useState(false);
  const [newTaskParts, setNewTaskParts] = useState<{ partNumber: number; referenceText: string }[]>([
    { partNumber: 1, referenceText: "" },
    { partNumber: 2, referenceText: "" },
  ]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<any>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editRef, setEditRef] = useState("");
  const [expandedLessons, setExpandedLessons] = useState<Set<number>>(new Set());
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [selectedTgChat, setSelectedTgChat] = useState("");
  const [selectedTgLesson, setSelectedTgLesson] = useState<string>("all");
  const [statSelectedLessons, setStatSelectedLessons] = useState<Set<number>>(new Set());
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentStudent, setPaymentStudent] = useState<any>(null);
  const [payStatus, setPayStatus] = useState<"paid"|"unpaid"|"partial"|"nasiya">("unpaid");
  const [studentSearch, setStudentSearch] = useState("");
  const [payFilter, setPayFilter] = useState<"all"|"paid"|"nasiya"|"partial"|"unpaid">("all");
  const [payAmount, setPayAmount] = useState("");
  const [payLessons, setPayLessons] = useState("");
  const [payUntil, setPayUntil] = useState("");
  const [payNote, setPayNote] = useState("");
  const [editStudentOpen, setEditStudentOpen] = useState(false);
  const [editStudentId, setEditStudentId] = useState<string | null>(null);
  const [editStudentName, setEditStudentName] = useState("");
  const [editStudentPhone, setEditStudentPhone] = useState("");
  const [payPdfOpen, setPayPdfOpen] = useState(false);
  const [payPdfFilter, setPayPdfFilter] = useState<"all"|"paid"|"nasiya"|"partial"|"unpaid">("all");
  const [monitoringId, setMonitoringId] = useState("");
  const [showHiddenInNatija, setShowHiddenInNatija] = useState(false);
  const [copyImportOpen, setCopyImportOpen] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [copyConfirmStep, setCopyConfirmStep] = useState(false);
  const [copySourceInfo, setCopySourceInfo] = useState<{ name: string; count: number } | null>(null);
  const [copyMode, setCopyMode] = useState<"replace" | "append">("replace");

  const { data: aiClass, isLoading } = useQuery<any>({
    queryKey: ["/api/ai-classes", classId],
    enabled: !!classId,
  });

  const { data: results } = useQuery<any>({
    queryKey: ["/api/ai-classes", classId, "results"],
    enabled: !!classId,
  });

  const { data: profile } = useQuery<any>({
    queryKey: ["/api/profile"],
  });

  const { data: allAiClasses = [] } = useQuery<any[]>({
    queryKey: ["/api/ai-classes"],
  });

  const botStartMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/ai-classes/${classId}/bot/start`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId] });
      toast({ title: "Bot ishga tushdi!" });
    },
    onError: (err: any) => toast({ title: "Xatolik", description: err.message, variant: "destructive" }),
  });

  const botStopMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/ai-classes/${classId}/bot/stop`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId] });
      toast({ title: "Bot to'xtatildi" });
    },
  });

  const addStudentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/ai-classes/${classId}/students`, { name: newStudentName, phone: newStudentPhone });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId, "results"] });
      setAddStudentOpen(false);
      setNewStudentName("");
      setNewStudentPhone("");
      toast({ title: "O'quvchi qo'shildi" });
    },
    onError: (err: any) => toast({ title: "Xatolik", description: err.message, variant: "destructive" }),
  });

  const updateStudentMutation = useMutation({
    mutationFn: async ({ id, name, phone }: { id: string; name: string; phone: string }) => {
      const res = await apiRequest("PUT", `/api/ai-students/${id}`, { name, phone });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId] });
      setEditStudentOpen(false);
      toast({ title: "O'quvchi ma'lumotlari yangilandi" });
    },
    onError: (err: any) => toast({ title: "Xatolik", description: err.message, variant: "destructive" }),
  });

  const bulkStudentMutation = useMutation({
    mutationFn: async (students: { name: string; phone: string }[]) => {
      const res = await apiRequest("POST", `/api/ai-classes/${classId}/students/bulk`, { students });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId, "results"] });
      setBulkOpen(false);
      setBulkText("");
      toast({ title: `${data.created} ta o'quvchi qo'shildi` });
    },
    onError: (err: any) => toast({ title: "Xatolik", description: err.message, variant: "destructive" }),
  });

  const deleteStudentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/ai-students/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId, "results"] });
    },
  });

  const paymentMutation = useMutation({
    mutationFn: async ({ studentId, paymentInfo }: { studentId: string; paymentInfo: any }) => {
      const res = await apiRequest("PUT", `/api/ai-students/${studentId}/payment`, { paymentInfo });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId] });
      setPaymentOpen(false);
      toast({ title: "To'lov ma'lumoti saqlandi!" });
    },
    onError: () => toast({ title: "Xatolik", variant: "destructive" }),
  });

  const hiddenLessonsMutation = useMutation({
    mutationFn: async (hiddenLessons: number[]) => {
      const res = await apiRequest("PUT", `/api/ai-classes/${classId}/hidden-lessons`, { hiddenLessons });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId] });
    },
  });

  const copyTasksMutation = useMutation({
    mutationFn: async ({ sourceId, mode }: { sourceId: string; mode: "replace" | "append" }) => {
      const res = await apiRequest("POST", `/api/ai-classes/${classId}/copy-tasks-from/${sourceId}`, { mode });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId, "results"] });
      setCopyImportOpen(false);
      setCopyConfirmStep(false);
      setSelectedSourceId("");
      setCopySourceInfo(null);
      setCopyMode("replace");
      const actionLabel = data.mode === "append" ? "qo'shildi" : "ko'chirildi";
      toast({ title: `${data.count} ta vazifa muvaffaqiyatli ${actionLabel}!` });
    },
    onError: (err: any) => toast({ title: "Xatolik", description: err.message, variant: "destructive" }),
  });

  function openPaymentDialog(student: any) {
    setPaymentStudent(student);
    const p = student.paymentInfo;
    setPayStatus(p?.status || "unpaid");
    setPayAmount(p?.amount?.toString() || "");
    setPayLessons(p?.lessonsCount?.toString() || "");
    setPayUntil(p?.untilDate || "");
    setPayNote(p?.note || "");
    setPaymentOpen(true);
  }

  function savePayment() {
    if (!paymentStudent) return;
    paymentMutation.mutate({
      studentId: paymentStudent.id,
      paymentInfo: {
        status: payStatus,
        amount: payAmount ? parseInt(payAmount) : undefined,
        lessonsCount: payLessons ? parseInt(payLessons) : undefined,
        untilDate: payUntil || undefined,
        note: payNote || undefined,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  function toggleHideLesson(lessonNum: number) {
    const current: number[] = aiClass?.hiddenLessons || [];
    const next = current.includes(lessonNum)
      ? current.filter((n: number) => n !== lessonNum)
      : [...current, lessonNum];
    hiddenLessonsMutation.mutate(next);
  }

  const addTaskMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        title: newTaskTitle,
        prompt: newTaskPrompt,
        referenceText: newTaskHasParts ? "" : newTaskRef,
        lessonNumber: newTaskLessonNum,
        type: "audio",
      };
      if (newTaskHasParts) {
        body.parts = newTaskParts
          .filter(p => p.referenceText.trim().length > 0)
          .map((p, i) => ({ ...p, partNumber: i + 1 }));
      }
      const res = await apiRequest("POST", `/api/ai-classes/${classId}/tasks`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId, "results"] });
      setAddTaskOpen(false);
      setNewTaskTitle("");
      setNewTaskPrompt("");
      setNewTaskRef("");
      setNewTaskHasParts(false);
      setNewTaskParts([{ partNumber: 1, referenceText: "" }, { partNumber: 2, referenceText: "" }]);
      toast({ title: "Vazifa qo'shildi" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/ai-tasks/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId, "results"] });
      setEditingTaskId(null);
      toast({ title: "Vazifa yangilandi" });
    },
    onError: (err: any) => toast({ title: "Xatolik", description: err.message, variant: "destructive" }),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/ai-tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId, "results"] });
    },
  });

  const resetSubmissionMutation = useMutation({
    mutationFn: async (submissionId: string) => {
      await apiRequest("DELETE", `/api/ai-submissions/${submissionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId, "results"] });
      setDetailOpen(false);
      toast({ title: "Natija bekor qilindi. O'quvchi qayta topshira oladi." });
    },
    onError: (err: any) => toast({ title: "Xatolik", description: err.message, variant: "destructive" }),
  });

  const resetLessonMutation = useMutation({
    mutationFn: async (lessonNumber: number) => {
      await apiRequest("DELETE", `/api/ai-classes/${classId}/lessons/${lessonNumber}/submissions`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId, "results"] });
      toast({ title: "Dars natijalari bekor qilindi. O'quvchilar qayta topshira oladi." });
    },
    onError: (err: any) => toast({ title: "Xatolik", description: err.message, variant: "destructive" }),
  });

  const sendResultsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/ai-classes/${classId}/send-results`, {
        chatId: selectedTgChat,
        lessonNumber: selectedTgLesson === "all" ? null : parseInt(selectedTgLesson),
      });
      return res.json();
    },
    onSuccess: () => {
      setTelegramOpen(false);
      toast({ title: "Natijalar Telegram ga yuborildi!" });
    },
    onError: (err: any) => toast({ title: "Xatolik", description: err.message, variant: "destructive" }),
  });

  function startEditing(task: any) {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditPrompt(task.prompt || "");
    setEditRef(task.referenceText || "");
  }

  function saveEdit(taskId: string) {
    updateTaskMutation.mutate({
      id: taskId,
      data: { title: editTitle, prompt: editPrompt, referenceText: editRef },
    });
  }

  function toggleLesson(lessonNum: number) {
    const next = new Set(expandedLessons);
    if (next.has(lessonNum)) next.delete(lessonNum);
    else next.add(lessonNum);
    setExpandedLessons(next);
  }

  function parseBulkStudents(): { name: string; phone: string }[] {
    return bulkText
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const parts = line.split(/[\t,]+/).map(p => p.trim());
        if (parts.length >= 2) {
          const lastPart = parts[parts.length - 1];
          if (/\d{9,}/.test(lastPart.replace(/\D/g, ""))) {
            return { name: parts.slice(0, -1).join(" "), phone: lastPart.replace(/\D/g, "") };
          }
        }
        const match = line.match(/^(.+?)\s+([\d\s+()-]{9,})$/);
        if (match) {
          return { name: match[1].trim(), phone: match[2].replace(/\D/g, "") };
        }
        return null;
      })
      .filter((s): s is { name: string; phone: string } => s !== null && s.name.length > 0 && s.phone.length >= 9);
  }

  if (isLoading) return <div className="p-6"><div className="h-8 bg-muted animate-pulse rounded w-48 mb-4" /></div>;
  if (!aiClass) return <div className="p-6">AI sinf topilmadi</div>;

  const scoreColor = (score: number | null) => {
    if (!score) return "";
    if (score >= 7) return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
    if (score >= 4) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300";
    return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  };

  const allTasks = aiClass.tasks || [];
  const lessonNumbers = [...new Set(allTasks.map((t: any) => t.lessonNumber || 1))].sort((a: number, b: number) => a - b) as number[];
  const maxLessonNum = lessonNumbers.length > 0 ? Math.max(...lessonNumbers) : 0;

  const resultLessons = results?.lessons || [];
  const tgChats = profile?.telegramChats || [];
  const hasTgBot = !!profile?.hasTelegramBot || !!aiClass?.telegramBotToken;
  const parsedStudents = parseBulkStudents();

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/teacher/ai-classes">
          <Button variant="ghost" size="icon" data-testid="button-back-ai"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate">{aiClass.name}</h1>
          <p className="text-xs text-muted-foreground">AI nazorat sinfi</p>
        </div>
        <div className="flex items-center gap-2">
          {aiClass.botActive ? (
            <Button variant="outline" size="sm" onClick={() => botStopMutation.mutate()} disabled={botStopMutation.isPending} className="text-red-600" data-testid="button-stop-bot">
              <PowerOff className="w-3.5 h-3.5 mr-1" /> Bot to'xtatish
            </Button>
          ) : (
            <Button size="sm" onClick={() => botStartMutation.mutate()} disabled={botStartMutation.isPending || !aiClass.telegramBotToken} className="gradient-purple border-0" data-testid="button-start-bot">
              <Power className="w-3.5 h-3.5 mr-1" /> {botStartMutation.isPending ? "Ishga tushmoqda..." : "Bot ishga tushirish"}
            </Button>
          )}
          <Badge variant={aiClass.botActive ? "default" : "secondary"} className={aiClass.botActive ? "bg-green-500" : ""}>
            {aiClass.botActive ? "Bot faol" : "Bot o'chiq"}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="results">
        <TabsList className="grid w-full grid-cols-5 sm:w-auto sm:inline-grid" data-testid="ai-class-tabs">
          <TabsTrigger value="results"><BarChart3 className="w-3.5 h-3.5 mr-1 hidden sm:inline" />Natijalar</TabsTrigger>
          <TabsTrigger value="students"><Users className="w-3.5 h-3.5 mr-1 hidden sm:inline" />O'quvchilar</TabsTrigger>
          <TabsTrigger value="tasks"><ListChecks className="w-3.5 h-3.5 mr-1 hidden sm:inline" />Darslar</TabsTrigger>
          <TabsTrigger value="statistics" data-testid="tab-ai-statistics"><BarChart3 className="w-3.5 h-3.5 mr-1 hidden sm:inline" />Statistika</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="w-3.5 h-3.5 mr-1 hidden sm:inline" />Sozlamalar</TabsTrigger>
        </TabsList>

        <TabsContent value="results" className="mt-4">
          {results?.results?.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                {hasTgBot && (
                  <Button size="sm" variant="outline" onClick={() => setTelegramOpen(true)} data-testid="button-send-tg-results">
                    <Send className="w-3.5 h-3.5 mr-1" /> Telegram ga yuborish
                  </Button>
                )}
                {(aiClass?.hiddenLessons?.length > 0) && (
                  <Button size="sm" variant={showHiddenInNatija ? "secondary" : "outline"} onClick={() => setShowHiddenInNatija(v => !v)} data-testid="button-show-hidden-lessons">
                    {showHiddenInNatija ? <Eye className="w-3.5 h-3.5 mr-1" /> : <EyeOff className="w-3.5 h-3.5 mr-1" />}
                    {showHiddenInNatija ? "Barcha darslar" : `${aiClass.hiddenLessons.length} ta yashirilgan`}
                  </Button>
                )}
              </div>
              {(() => {
                const hiddenNums: number[] = aiClass?.hiddenLessons || [];
                const visibleLessons = resultLessons.filter((l: any) => showHiddenInNatija || !hiddenNums.includes(l.lessonNumber));
                const visibleTaskIds = new Set(visibleLessons.flatMap((l: any) => l.tasks.map((t: any) => t.id)));
                const visibleTasks = results.tasks?.filter((t: any) => visibleTaskIds.has(t.id)) || [];
                return (
                  <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs sm:text-sm" data-testid="ai-results-table">
                        <thead>
                          {visibleLessons.length > 0 && (
                            <tr className="border-b bg-purple-50 dark:bg-purple-950/30">
                              <th className="p-1 sticky left-0 bg-purple-50 dark:bg-purple-950/30 z-20" />
                              <th className="p-1 sticky left-[32px] bg-purple-50 dark:bg-purple-950/30 z-20" />
                              {visibleLessons.map((lesson: any) => {
                                const isHidden = hiddenNums.includes(lesson.lessonNumber);
                                return (
                                  <th key={lesson.lessonNumber} colSpan={lesson.tasks.length}
                                    className={`text-center p-1 text-xs font-bold border-l ${isHidden ? "text-muted-foreground" : "text-purple-700 dark:text-purple-300"}`}>
                                    <div className="flex items-center justify-center gap-1">
                                      <span>{lesson.lessonNumber}-dars</span>
                                      <button className="text-blue-400 hover:text-blue-600 p-0.5 rounded" title="PDF yuklab olish"
                                        onClick={() => window.open(`/api/ai-classes/${classId}/download-lesson/${lesson.lessonNumber}`, "_blank")}
                                        data-testid={`button-download-lesson-${lesson.lessonNumber}`}>
                                        <Download className="w-3 h-3" />
                                      </button>
                                      <button className={`p-0.5 rounded transition-colors ${isHidden ? "text-gray-400 hover:text-green-600" : "text-gray-400 hover:text-orange-500"}`}
                                        title={isHidden ? "Darsni ko'rsatish" : "Darsni yashirish"}
                                        onClick={() => toggleHideLesson(lesson.lessonNumber)}
                                        data-testid={`button-hide-lesson-${lesson.lessonNumber}`}>
                                        {isHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                      </button>
                                      <button className="text-red-400 hover:text-red-600 p-0.5 rounded" title="Natijalarni bekor qilish"
                                        disabled={resetLessonMutation.isPending}
                                        onClick={() => { if (confirm(`${lesson.lessonNumber}-dars barcha natijalarini bekor qilasizmi?`)) resetLessonMutation.mutate(lesson.lessonNumber); }}
                                        data-testid={`button-reset-lesson-${lesson.lessonNumber}`}>
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </th>
                                );
                              })}
                              <th className="p-1 border-l bg-purple-50 dark:bg-purple-950/30" />
                            </tr>
                          )}
                          <tr className="border-b bg-muted/30">
                            <th className="text-center p-2 font-medium w-[32px] sticky left-0 bg-muted/30 z-20">N</th>
                            <th className="text-left p-2 font-medium min-w-[130px] sticky left-[32px] bg-muted/30 z-20">O'quvchi</th>
                            {visibleTasks.map((t: any, idx: number) => (
                              <th key={idx} className="text-center p-2 font-medium border-l min-w-[55px] text-[10px] sm:text-xs">{t.taskTitle || t.title}</th>
                            ))}
                            <th className="text-center p-2 font-medium border-l min-w-[50px]">O'rtacha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.results.map((r: any, idx: number) => {
                            const rowBg = idx % 2 ? "bg-muted/20" : "bg-card";
                            const visibleTaskResults = r.taskResults.filter((tr: any) => visibleTaskIds.has(tr.taskId));
                            const visibleAvg = visibleTaskResults.filter((tr: any) => tr.score).length > 0
                              ? (visibleTaskResults.reduce((s: number, tr: any) => s + (tr.score || 0), 0) / visibleTaskResults.filter((tr: any) => tr.score).length).toFixed(1)
                              : null;
                            return (
                              <tr key={r.studentId} className={`border-b ${rowBg}`}>
                                <td className={`text-center p-2 text-xs text-muted-foreground sticky left-0 z-10 ${rowBg}`}>{idx + 1}</td>
                                <td className={`p-2 font-medium sticky left-[32px] z-10 ${rowBg}`}>
                                  <div className="flex items-center gap-1">
                                    <span className="truncate max-w-[100px] sm:max-w-[140px]">{r.studentName}</span>
                                    {r.connected ? <Wifi className="w-3 h-3 text-green-500 flex-shrink-0" /> : <WifiOff className="w-3 h-3 text-gray-400 flex-shrink-0" />}
                                  </div>
                                </td>
                                {visibleTaskResults.map((tr: any, tIdx: number) => (
                                  <td key={tIdx} className={`text-center p-2 border-l cursor-pointer hover:opacity-80 transition-all ${scoreColor(tr.score)}`}
                                    onClick={() => { setSelectedDetail(tr); setDetailOpen(true); }}
                                    data-testid={`cell-result-${r.studentId}-${tr.taskId}`}>
                                    {tr.score ? <span className="font-semibold">{tr.score}</span> : <span className="text-muted-foreground">—</span>}
                                  </td>
                                ))}
                                <td className={`text-center p-2 border-l font-semibold ${visibleAvg ? scoreColor(Math.round(parseFloat(visibleAvg))) : ""}`}>
                                  {visibleAvg || "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                );
              })()}
            </>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Natijalar hali yo'q. O'quvchilar bot orqali vazifalarni yuborishi kerak.</p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="students" className="mt-4">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
            <p className="text-sm text-muted-foreground">{aiClass.students?.length || 0} ta o'quvchi</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={async () => {
                const students = aiClass.students || [];
                if (students.length === 0) { toast({ title: "O'quvchilar yo'q" }); return; }
                const XLSX = await import("xlsx");
                const isArabic = (str: string) => /[\u0600-\u06FF]/.test(str);
                const payLabel: Record<string, string> = { paid: "To'langan", unpaid: "To'lanmagan", partial: "Qisman", nasiya: "Nasiya" };
                const data = students.map((s: any, i: number) => ({
                  "№": i + 1,
                  "Ism": cleanName(s.name),
                  "Telefon": s.phone || "",
                  "Telegram": s.telegramChatId ? "Ulangan" : "Kutilmoqda",
                  "To'lov holati": payLabel[s.paymentInfo?.status] || "To'lanmagan",
                  "Miqdor": s.paymentInfo?.amount || "",
                  "Izoh": s.paymentInfo?.note || "",
                }));
                const ws = XLSX.utils.json_to_sheet(data);
                ws["!cols"] = [{ wch: 5 }, { wch: 32 }, { wch: 15 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 22 }];
                const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
                for (let R = range.s.r + 1; R <= range.e.r; R++) {
                  const nameCell = XLSX.utils.encode_cell({ r: R, c: 1 });
                  if (ws[nameCell] && isArabic(ws[nameCell].v)) {
                    ws[nameCell].s = { alignment: { readingOrder: 2, horizontal: "right" } };
                  }
                }
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "O'quvchilar");
                XLSX.writeFile(wb, `${aiClass.name || "sinf"}_oquvchilar.xlsx`);
                toast({ title: `${students.length} ta o'quvchi yuklab olindi` });
              }} data-testid="button-download-students">
                <Download className="w-3.5 h-3.5 mr-1" /> Yuklab olish
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPayPdfOpen(true)} data-testid="button-payment-pdf">
                <Download className="w-3.5 h-3.5 mr-1" /> To'lov PDF
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)} data-testid="button-bulk-add-students">
                <Upload className="w-3.5 h-3.5 mr-1" /> Bulk qo'shish
              </Button>
              <Button size="sm" onClick={() => setAddStudentOpen(true)} data-testid="button-add-ai-student">
                <Plus className="w-3.5 h-3.5 mr-1" /> Qo'shish
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <Input
              placeholder="Ism bo'yicha qidirish..."
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              className="h-8 text-sm max-w-[220px]"
              data-testid="input-student-search"
            />
            <div className="flex gap-1 flex-wrap">
              {([
                { key: "all", label: "Barchasi" },
                { key: "paid", label: "✅ To'langan" },
                { key: "nasiya", label: "🔵 Nasiya" },
                { key: "partial", label: "⏳ Qisman" },
                { key: "unpaid", label: "❌ To'lanmagan" },
              ] as const).map(f => (
                <button key={f.key} onClick={() => setPayFilter(f.key)}
                  className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${payFilter === f.key ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/50"}`}
                  data-testid={`button-filter-${f.key}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {(aiClass.students || [])
              .filter((s: any) => {
                const matchSearch = !studentSearch || s.name.toLowerCase().includes(studentSearch.toLowerCase());
                const st = s.paymentInfo?.status;
                const matchPay = payFilter === "all"
                  || (payFilter === "unpaid" && (!st || st === "unpaid"))
                  || (payFilter !== "unpaid" && st === payFilter);
                return matchSearch && matchPay;
              })
              .map((s: any, idx: number) => {
              const pay = s.paymentInfo;
              const payBadgeClass = !pay || pay.status === "unpaid"
                ? "border-red-300 text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400"
                : pay.status === "partial"
                ? "border-yellow-300 text-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400"
                : pay.status === "nasiya"
                ? "border-blue-400 text-blue-700 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400"
                : "border-green-300 text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400";
              const payLabel = !pay || pay.status === "unpaid" ? "To'lanmagan"
                : pay.status === "partial" ? "Qisman"
                : pay.status === "nasiya" ? "Nasiya"
                : "To'langan";
              return (
                <Card key={s.id} className="p-3" data-testid={`card-ai-student-${s.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs text-muted-foreground w-5 flex-shrink-0">{idx + 1}</span>
                      <div className="min-w-0">
                        <span className="font-medium text-sm">{cleanName(s.name)}</span>
                        <div className="flex items-center flex-wrap gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {s.phone}</span>
                          {s.telegramChatId
                            ? <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-600">Ulangan</Badge>
                            : <Badge variant="outline" className="text-[10px] px-1 py-0">Kutilmoqda</Badge>}
                        </div>
                        {pay && (pay.amount || pay.lessonsCount || pay.untilDate) && (
                          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
                            {pay.amount && <span>{pay.amount.toLocaleString()} so'm</span>}
                            {pay.lessonsCount && <span>{pay.lessonsCount} dars</span>}
                            {pay.untilDate && <span>— {pay.untilDate}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => openPaymentDialog(s)}
                        className={`text-[11px] px-2 py-0.5 rounded-full border font-medium transition-colors hover:opacity-80 flex items-center gap-1 ${payBadgeClass}`}
                        data-testid={`button-payment-${s.id}`}>
                        <CreditCard className="w-3 h-3" />
                        {payLabel}
                      </button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500"
                        onClick={() => { setEditStudentId(s.id); setEditStudentName(s.name); setEditStudentPhone(s.phone || ""); setEditStudentOpen(true); }}
                        data-testid={`button-edit-student-${s.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => deleteStudentMutation.mutate(s.id)} data-testid={`button-delete-student-${s.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <p className="text-sm text-muted-foreground">{lessonNumbers.length} ta dars, {allTasks.length} ta vazifa</p>
            <div className="flex gap-2">
              {allAiClasses.filter((c: any) => c.id !== classId).length > 0 && (
                <Button size="sm" variant="outline" onClick={() => { setCopyConfirmStep(false); setSelectedSourceId(""); setCopySourceInfo(null); setCopyImportOpen(true); }} data-testid="button-import-ai-tasks">
                  <Copy className="w-3.5 h-3.5 mr-1" /> Vazifalarni import
                </Button>
              )}
              <Button size="sm" onClick={() => { setNewTaskLessonNum(maxLessonNum + 1); setAddTaskOpen(true); }} data-testid="button-add-ai-task">
                <Plus className="w-3.5 h-3.5 mr-1" /> Vazifa qo'shish
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            {lessonNumbers.map(lessonNum => {
              const lessonTasks = allTasks.filter((t: any) => (t.lessonNumber || 1) === lessonNum).sort((a: any, b: any) => a.orderIndex - b.orderIndex);
              const isExpanded = expandedLessons.has(lessonNum);
              return (
                <div key={lessonNum}>
                  <div
                    className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                    onClick={() => toggleLesson(lessonNum)}
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <span className="font-medium text-sm">{lessonNum}-dars</span>
                    <span className="text-xs text-muted-foreground">({lessonTasks.length} vazifa)</span>
                  </div>
                  {isExpanded && (
                    <div className="ml-6 space-y-2 mb-2">
                      {lessonTasks.map((t: any, localIdx: number) => (
                        <Card key={t.id} className="p-3" data-testid={`card-ai-task-${t.id}`}>
                          {editingTaskId === t.id ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-muted-foreground w-5">{localIdx + 1}.</span>
                                <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Vazifa nomi" className="flex-1" data-testid={`input-edit-task-title-${t.id}`} />
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={() => saveEdit(t.id)} disabled={updateTaskMutation.isPending}>
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingTaskId(null)}>
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                              <Textarea value={editRef} onChange={e => setEditRef(e.target.value)} placeholder="Mavzu matni (faqat AI uchun)" rows={3} data-testid={`input-edit-task-ref-${t.id}`} />
                              <Input value={editPrompt} onChange={e => setEditPrompt(e.target.value)} placeholder="AI ga ko'rsatma" data-testid={`input-edit-task-prompt-${t.id}`} />
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{localIdx + 1}. {t.title}</span>
                                  {t.parts && Array.isArray(t.parts) && t.parts.length > 0 && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t.parts.length} bo'lim</Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" onClick={() => startEditing(t)} data-testid={`button-edit-task-${t.id}`}>
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => deleteTaskMutation.mutate(t.id)} data-testid={`button-delete-task-${t.id}`}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                              {t.referenceText && <p className="text-xs text-muted-foreground line-clamp-2">{t.referenceText}</p>}
                              {t.parts && Array.isArray(t.parts) && t.parts.length > 0 && (
                                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                  {t.parts.map((p: any) => (
                                    <p key={p.partNumber} className="line-clamp-1">{p.partNumber}. {p.referenceText?.substring(0, 80)}{p.referenceText?.length > 80 ? "..." : ""}</p>
                                  ))}
                                </div>
                              )}
                              {t.prompt && <p className="text-xs text-muted-foreground mt-1">{t.prompt}</p>}
                            </>
                          )}
                        </Card>
                      ))}
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => { setNewTaskLessonNum(lessonNum); setAddTaskOpen(true); }}>
                        <Plus className="w-3 h-3 mr-1" /> Vazifa qo'shish
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="statistics" className="mt-4">
          {(() => {
            const students: any[] = aiClass.students || [];
            const tasks: any[] = aiClass.tasks || [];
            const submissions: any[] = aiClass.submissions || [];
            const allLessonNums = Array.from(new Set(tasks.map((t: any) => t.lessonNumber))).sort((a, b) => a - b);

            const toggleLesson = (num: number) => {
              setStatSelectedLessons(prev => {
                const next = new Set(prev);
                if (next.has(num)) next.delete(num); else next.add(num);
                return next;
              });
            };
            const selLessons = allLessonNums.filter(n => statSelectedLessons.size === 0 || statSelectedLessons.has(n));

            const getCellData = (studentId: string, lessonNum: number) => {
              const lessonTasks = tasks.filter((t: any) => t.lessonNumber === lessonNum);
              if (lessonTasks.length === 0) return { done: false, partial: false, score: 0, completed: 0, total: 0 };
              const taskIds = new Set(lessonTasks.map((t: any) => t.id));
              const subs = submissions.filter((s: any) => s.aiStudentId === studentId && taskIds.has(s.aiTaskId) && s.status === "completed");
              const done = subs.length === lessonTasks.length;
              const partial = subs.length > 0 && subs.length < lessonTasks.length;
              const score = subs.reduce((sum: number, s: any) => sum + (s.score || 0), 0);
              return { done, partial, score, completed: subs.length, total: lessonTasks.length };
            };

            const totalPossible = students.length * selLessons.length;
            let totalDone = 0;
            students.forEach(st => selLessons.forEach(ln => { if (getCellData(st.id, ln).done) totalDone++; }));
            const overallPct = totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0;

            return (
              <div className="space-y-4">
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">Darslarni tanlang</h3>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setStatSelectedLessons(new Set())} data-testid="button-stat-all">Hammasi</Button>
                      <Button size="sm" variant="outline" onClick={() => setStatSelectedLessons(new Set(allLessonNums))} data-testid="button-stat-none">Hech biri</Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {allLessonNums.map(num => (
                      <button key={num} onClick={() => toggleLesson(num)}
                        className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${statSelectedLessons.size === 0 || statSelectedLessons.has(num) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary"}`}
                        data-testid={`button-stat-lesson-${num}`}>
                        {num}-dars
                      </button>
                    ))}
                  </div>
                  {statSelectedLessons.size > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">{statSelectedLessons.size} ta dars tanlandi</p>
                  )}
                </Card>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold">{students.length}</div>
                    <div className="text-xs text-muted-foreground mt-1">Jami o'quvchi</div>
                  </Card>
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">{totalDone}</div>
                    <div className="text-xs text-muted-foreground mt-1">Topshirildi</div>
                  </Card>
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold text-red-500">{totalPossible - totalDone}</div>
                    <div className="text-xs text-muted-foreground mt-1">Topshirilmadi</div>
                  </Card>
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">{overallPct}%</div>
                    <div className="text-xs text-muted-foreground mt-1">Umumiy foiz</div>
                  </Card>
                </div>

                {selLessons.length > 0 && (
                  <Card className="p-4">
                    <h3 className="font-semibold mb-3">Dars bo'yicha statistika</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 pr-4 font-medium">Dars</th>
                            <th className="text-center py-2 px-2 font-medium">Vazifalar</th>
                            <th className="text-center py-2 px-2 font-medium text-green-600">Topshirdi</th>
                            <th className="text-center py-2 px-2 font-medium text-red-500">Topshirmadi</th>
                            <th className="text-center py-2 px-2 font-medium text-blue-600">Foiz</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selLessons.map(lessonNum => {
                            const lessonTasks = tasks.filter((t: any) => t.lessonNumber === lessonNum);
                            const doneSt = students.filter(st => getCellData(st.id, lessonNum).done).length;
                            const pct = students.length > 0 ? Math.round((doneSt / students.length) * 100) : 0;
                            return (
                              <tr key={lessonNum} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-stat-lesson-${lessonNum}`}>
                                <td className="py-2 pr-4 font-medium">{lessonNum}-dars</td>
                                <td className="text-center py-2 px-2">{lessonTasks.length}</td>
                                <td className="text-center py-2 px-2 text-green-600 font-medium">{doneSt}</td>
                                <td className="text-center py-2 px-2 text-red-500 font-medium">{students.length - doneSt}</td>
                                <td className="text-center py-2 px-2">
                                  <span className={`font-semibold ${pct >= 70 ? "text-green-600" : pct >= 40 ? "text-yellow-600" : "text-red-500"}`}>{pct}%</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}

                {students.length > 0 && selLessons.length > 0 && (() => {
                  const sortedStudents = [...students].map((st: any) => {
                    let stDone = 0; let stScore = 0;
                    selLessons.forEach(ln => { const cell = getCellData(st.id, ln); if (cell.done) stDone++; stScore += cell.score; });
                    const stPct = selLessons.length > 0 ? Math.round((stDone / selLessons.length) * 100) : 0;
                    return { ...st, stDone, stScore, stPct };
                  }).sort((a: any, b: any) => b.stPct - a.stPct);

                  const downloadStatXlsx = async () => {
                    const XLSX = await import("xlsx");
                    const header = ["#", "O'quvchi", ...selLessons.map((ln: number) => `${ln}-dars`), "Ball", "Foiz"];
                    const rows = sortedStudents.map((st: any, idx: number) => {
                      const cells: any = { "#": idx + 1, "O'quvchi": cleanName(st.name) };
                      selLessons.forEach((ln: number) => {
                        const cell = getCellData(st.id, ln);
                        cells[`${ln}-dars`] = cell.total === 0 ? "—" : cell.done ? "✅" : cell.score > 0 ? `${cell.score}` : "❌";
                      });
                      cells["Ball"] = st.stScore;
                      cells["Foiz"] = `${st.stPct}%`;
                      return cells;
                    });
                    const ws = XLSX.utils.json_to_sheet(rows, { header });
                    ws["!cols"] = [{ wch: 4 }, { wch: 28 }, ...selLessons.map(() => ({ wch: 10 })), { wch: 8 }, { wch: 8 }];
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Statistika");
                    XLSX.writeFile(wb, `${aiClass?.name || "sinf"}_statistika.xlsx`);
                  };

                  return (
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold">O'quvchi bo'yicha statistika</h3>
                      <Button size="sm" variant="outline" onClick={downloadStatXlsx} data-testid="button-download-ai-stats">
                        <Download className="w-3.5 h-3.5 mr-1" /> Yuklab olish
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 pr-1 font-medium w-8">#</th>
                            <th className="text-left py-2 pr-4 font-medium sticky left-0 bg-card">O'quvchi</th>
                            {selLessons.map((ln: number) => (
                              <th key={ln} className="text-center py-2 px-1 font-medium min-w-[60px]">{ln}-d</th>
                            ))}
                            <th className="text-center py-2 px-2 font-medium">Ball</th>
                            <th className="text-center py-2 px-2 font-medium">Foiz</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedStudents.map((st: any, idx: number) => {
                            return (
                              <tr key={st.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-stat-student-${idx}`}>
                                <td className="py-2 pr-1 text-muted-foreground text-xs">{idx + 1}</td>
                                <td className="py-2 pr-4 sticky left-0 bg-card">
                                  <div className="font-medium truncate max-w-[140px]">{cleanName(st.name)}</div>
                                  {!st.telegramChatId && <div className="text-xs text-muted-foreground">Ulanmagan</div>}
                                </td>
                                {selLessons.map((ln: number) => {
                                  const cell = getCellData(st.id, ln);
                                  return (
                                    <td key={ln} className="text-center py-2 px-1" data-testid={`cell-stat-${idx}-${ln}`}>
                                      {cell.total === 0 ? (
                                        <span className="text-muted-foreground">—</span>
                                      ) : cell.done ? (
                                        <span title={`${cell.score} ball`} className="text-green-600 font-bold">✅</span>
                                      ) : cell.partial ? (
                                        <span title={`${cell.completed}/${cell.total} vazifa`} className="text-yellow-600">⏳</span>
                                      ) : (
                                        <span className="text-red-500">❌</span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="text-center py-2 px-2 font-medium">{st.stScore}</td>
                                <td className="text-center py-2 px-2">
                                  <span className={`font-semibold ${st.stPct >= 70 ? "text-green-600" : st.stPct >= 40 ? "text-yellow-600" : "text-red-500"}`}>{st.stPct}%</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                  );
                })()}

                {students.length === 0 && (
                  <Card className="p-12 text-center text-muted-foreground">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p>O'quvchilar yo'q</p>
                  </Card>
                )}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card className="p-4 space-y-4">
            <div>
              <Label className="text-sm font-medium">Telegram Bot Token</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {aiClass.telegramBotToken ? "****" + aiClass.telegramBotToken.slice(-8) : "Sozlanmagan"}
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">AI uchun umumiy ko'rsatma</Label>
              <p className="text-sm text-muted-foreground mt-1">{aiClass.instructions || "Ko'rsatma yo'q"}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Monitoring guruh (Telegram)</Label>
              <p className="text-xs text-muted-foreground mb-1">O'quvchi audio yuborganda natija va audio shu guruhga ham yuboriladi</p>
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="-100xxxxxxxxxx"
                  value={monitoringId}
                  onChange={e => setMonitoringId(e.target.value)}
                  className="max-w-[280px] h-8 text-sm"
                  data-testid="input-monitoring-chat-id"
                />
                <Button size="sm" variant="outline" data-testid="button-save-monitoring"
                  onClick={async () => {
                    const val = monitoringId.trim();
                    try {
                      await apiRequest("PATCH", `/api/ai-classes/${classId}`, { monitoringChatId: val || null });
                      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId] });
                      toast({ title: val ? "Monitoring guruh saqlandi" : "Monitoring o'chirildi" });
                    } catch {
                      toast({ title: "Xatolik", variant: "destructive" });
                    }
                  }}>
                  <Check className="w-3.5 h-3.5 mr-1" /> Saqlash
                </Button>
                {aiClass.monitoringChatId && <Badge variant="default" className="text-xs">Faol</Badge>}
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Status</Label>
              <p className="text-sm mt-1"><Badge variant={aiClass.status === "active" ? "default" : "secondary"}>{aiClass.status === "active" ? "Faol" : "To'xtatilgan"}</Badge></p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={addStudentOpen} onOpenChange={setAddStudentOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>O'quvchi qo'shish</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Ism</Label>
              <Input value={newStudentName} onChange={e => setNewStudentName(e.target.value)} placeholder="Ism familiya" data-testid="input-new-student-name" />
            </div>
            <div>
              <Label>Telefon raqam</Label>
              <Input value={newStudentPhone} onChange={e => setNewStudentPhone(e.target.value)} placeholder="998901234567" data-testid="input-new-student-phone" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => addStudentMutation.mutate()} disabled={!newStudentName || !newStudentPhone || addStudentMutation.isPending} data-testid="button-confirm-add-student">
              {addStudentMutation.isPending ? "Qo'shilmoqda..." : "Qo'shish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payPdfOpen} onOpenChange={setPayPdfOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>To'lov hisobotini yuklab olish</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Qaysi guruhni yuklab olmoqchisiz?</p>
            <div className="grid grid-cols-1 gap-2">
              {([
                { key: "all", label: "📋 Barcha o'quvchilar", desc: "Hammasi bitta jadvaldahi" },
                { key: "paid", label: "✅ To'lov qilganlar", desc: "Faqat to'langan o'quvchilar" },
                { key: "nasiya", label: "🔵 Nasiya", desc: "Nasiyaga olinganlar" },
                { key: "partial", label: "⏳ Qisman to'lov", desc: "Qisman to'laganlar" },
                { key: "unpaid", label: "❌ To'lov qilmaganlar", desc: "Hali to'lamagan o'quvchilar" },
              ] as const).map(f => (
                <button key={f.key} onClick={() => setPayPdfFilter(f.key)}
                  className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${payPdfFilter === f.key ? "bg-primary/10 border-primary" : "border-border hover:bg-muted/40"}`}
                  data-testid={`button-pdf-filter-${f.key}`}>
                  <div className="font-medium text-sm">{f.label}</div>
                  <div className="text-xs text-muted-foreground">{f.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayPdfOpen(false)}>Bekor qilish</Button>
            <Button onClick={() => { window.open(`/api/ai-classes/${classId}/payment-pdf?filter=${payPdfFilter}`, "_blank"); setPayPdfOpen(false); }}
              data-testid="button-confirm-payment-pdf">
              <Download className="w-3.5 h-3.5 mr-1" /> PDF yuklab olish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>O'quvchilarni bulk qo'shish</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Har bir qatorda ism va telefon raqamni yozing. Tab, vergul yoki bo'sh joy bilan ajrating.</p>
            <Textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              placeholder={"Ali Valiyev\t998901234567\nVali Aliyev\t998907654321\nHasan Husanov, 998931112233"}
              rows={8}
              className="font-mono text-sm"
              data-testid="textarea-bulk-students"
            />
            {bulkText && (
              <div className="text-sm">
                <p className="font-medium">{parsedStudents.length} ta o'quvchi aniqlandi:</p>
                {parsedStudents.length > 0 && (
                  <div className="max-h-[120px] overflow-y-auto mt-1 space-y-0.5">
                    {parsedStudents.slice(0, 10).map((s, i) => (
                      <p key={i} className="text-xs text-muted-foreground">{i + 1}. {s.name} — {s.phone}</p>
                    ))}
                    {parsedStudents.length > 10 && <p className="text-xs text-muted-foreground">... va yana {parsedStudents.length - 10} ta</p>}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => bulkStudentMutation.mutate(parsedStudents)}
              disabled={parsedStudents.length === 0 || bulkStudentMutation.isPending}
              data-testid="button-confirm-bulk-add"
            >
              {bulkStudentMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Qo'shilmoqda...</> : `${parsedStudents.length} ta qo'shish`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editStudentOpen} onOpenChange={setEditStudentOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>O'quvchini tahrirlash</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Ism familiya</Label>
              <Input
                value={editStudentName}
                onChange={e => setEditStudentName(e.target.value)}
                placeholder="Ism Familiya"
                className="mt-1"
                data-testid="input-edit-student-name"
              />
            </div>
            <div>
              <Label>Telefon raqam</Label>
              <Input
                value={editStudentPhone}
                onChange={e => setEditStudentPhone(e.target.value)}
                placeholder="998901234567"
                className="mt-1"
                data-testid="input-edit-student-phone"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStudentOpen(false)}>Bekor qilish</Button>
            <Button
              onClick={() => editStudentId && updateStudentMutation.mutate({ id: editStudentId, name: editStudentName, phone: editStudentPhone })}
              disabled={!editStudentName.trim() || updateStudentMutation.isPending}
              data-testid="button-confirm-edit-student"
            >
              {updateStudentMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Saqlanmoqda...</> : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={copyImportOpen} onOpenChange={(open) => { setCopyImportOpen(open); if (!open) { setCopyConfirmStep(false); setSelectedSourceId(""); setCopySourceInfo(null); setCopyMode("replace"); } }}>
        <DialogContent className="max-w-sm max-h-[75vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{copyConfirmStep ? "Usul va tasdiqlash" : "Boshqa guruhdan vazifalar import"}</DialogTitle>
          </DialogHeader>
          {!copyConfirmStep ? (
            <>
              <p className="text-sm text-muted-foreground mb-3">Guruh tanlang — uning barcha darslar va vazifalari bu sinfga import qilinadi</p>
              <div className="space-y-2">
                {allAiClasses.filter((c: any) => c.id !== classId).map((cls: any) => (
                  <button
                    key={cls.id}
                    onClick={() => {
                      setSelectedSourceId(cls.id);
                      setCopySourceInfo({ name: cls.name, count: cls.taskCount || 0 });
                      setCopyMode("replace");
                      setCopyConfirmStep(true);
                    }}
                    className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors flex items-center justify-between"
                    data-testid={`button-copy-from-${cls.id}`}
                  >
                    <div>
                      <p className="font-medium text-sm">{cls.name}</p>
                      <p className="text-xs text-muted-foreground">{cls.taskCount || 0} ta vazifa</p>
                    </div>
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-medium">"{copySourceInfo?.name}" guruhidan {copySourceInfo?.count} ta vazifa import qilinadi</p>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Import usuli</p>
                <button
                  onClick={() => setCopyMode("replace")}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${copyMode === "replace" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  data-testid="button-mode-replace"
                >
                  <p className="font-medium text-sm">Almashtirish</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Mavjud {allTasks.length} ta vazifa o'chirilib, yangilari bilan almashtiriladi</p>
                </button>
                <button
                  onClick={() => setCopyMode("append")}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${copyMode === "append" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  data-testid="button-mode-append"
                >
                  <p className="font-medium text-sm">Qo'shish (append)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Mavjud {allTasks.length} ta vazifa saqlanib, {copySourceInfo?.count} ta yangi vazifa oxiriga qo'shiladi</p>
                </button>
              </div>
              {copyMode === "replace" && allTasks.length > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
                  Diqqat: mavjud {allTasks.length} ta vazifa va ularning natijalari o'chirilib ketadi
                </div>
              )}
              <DialogFooter className="flex gap-2">
                <Button variant="outline" onClick={() => setCopyConfirmStep(false)}>Orqaga</Button>
                <Button
                  onClick={() => copyTasksMutation.mutate({ sourceId: selectedSourceId, mode: copyMode })}
                  disabled={copyTasksMutation.isPending}
                  data-testid="button-confirm-copy-tasks"
                >
                  {copyTasksMutation.isPending
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Bajarilmoqda...</>
                    : copyMode === "replace" ? "Almashtirish" : "Qo'shish"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addTaskOpen} onOpenChange={setAddTaskOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Vazifa qo'shish</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Dars raqami</Label>
              <Input type="number" min={1} value={newTaskLessonNum} onChange={e => setNewTaskLessonNum(parseInt(e.target.value) || 1)} data-testid="input-new-task-lesson" />
            </div>
            <div>
              <Label>Vazifa nomi</Label>
              <Input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="Grammatika" data-testid="input-new-task-title" />
            </div>
            <div>
              <Label>AI ga ko'rsatma</Label>
              <Input value={newTaskPrompt} onChange={e => setNewTaskPrompt(e.target.value)} placeholder="Tarjimani tekshir va baho ber" />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="has-parts"
                checked={newTaskHasParts}
                onChange={e => setNewTaskHasParts(e.target.checked)}
                className="rounded border-gray-300"
                data-testid="checkbox-has-parts"
              />
              <Label htmlFor="has-parts" className="cursor-pointer text-sm">Bo'limlarga ajratish (ko'p bo'limli vazifa)</Label>
            </div>
            {!newTaskHasParts ? (
              <div>
                <Label>Mavzu matni (faqat AI uchun)</Label>
                <Textarea value={newTaskRef} onChange={e => setNewTaskRef(e.target.value)} placeholder="O'quvchi tarjima qilishi kerak bo'lgan matn" rows={3} />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Bo'limlar</Label>
                {newTaskParts.map((part, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <span className="text-xs font-bold mt-2 min-w-[28px]">{part.partNumber}.</span>
                    <Textarea
                      value={part.referenceText}
                      onChange={e => {
                        const updated = [...newTaskParts];
                        updated[idx] = { ...updated[idx], referenceText: e.target.value };
                        setNewTaskParts(updated);
                      }}
                      placeholder={`${part.partNumber}-bo'lim matni`}
                      rows={2}
                      className="flex-1"
                      data-testid={`input-part-${part.partNumber}`}
                    />
                    {newTaskParts.length > 2 && (
                      <Button variant="ghost" size="icon" className="mt-0.5 shrink-0" onClick={() => {
                        const filtered = newTaskParts.filter((_, i) => i !== idx).map((p, i) => ({ ...p, partNumber: i + 1 }));
                        setNewTaskParts(filtered);
                      }} data-testid={`button-remove-part-${part.partNumber}`}>
                        <X className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    )}
                  </div>
                ))}
                {newTaskParts.length < 5 && (
                  <Button variant="outline" size="sm" onClick={() => {
                    setNewTaskParts([...newTaskParts, { partNumber: newTaskParts.length + 1, referenceText: "" }]);
                  }} data-testid="button-add-part">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Bo'lim qo'shish ({newTaskParts.length}/5)
                  </Button>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => addTaskMutation.mutate()} disabled={!newTaskTitle || addTaskMutation.isPending || (newTaskHasParts && newTaskParts.filter(p => p.referenceText.trim().length > 0).length < 2)} data-testid="button-submit-task">
              {addTaskMutation.isPending ? "Qo'shilmoqda..." : "Qo'shish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedDetail?.taskTitle} — natija</DialogTitle></DialogHeader>
          {selectedDetail && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Baho</Label>
                <p className="text-2xl font-bold">{selectedDetail.score || "—"}<span className="text-sm font-normal text-muted-foreground">/10</span></p>
                {selectedDetail.totalParts > 0 && (
                  <p className="text-xs text-muted-foreground">{selectedDetail.completedParts}/{selectedDetail.totalParts} bo'lim topshirilgan</p>
                )}
              </div>
              {selectedDetail.partSubmissions && selectedDetail.partSubmissions.length > 0 ? (
                <div className="space-y-2">
                  {selectedDetail.partSubmissions.map((ps: any) => (
                    <div key={ps.partNumber} className="border rounded p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">{ps.partNumber}-bo'lim</span>
                        <Badge variant={ps.score >= 7 ? "default" : ps.score >= 5 ? "secondary" : "destructive"} className="text-xs">{ps.score}/10</Badge>
                      </div>
                      {ps.transcription && <p className="text-xs bg-muted/50 p-1 rounded max-h-[80px] overflow-y-auto">{ps.transcription}</p>}
                      {ps.aiResponse && <p className="text-xs bg-blue-50 dark:bg-blue-950/30 p-1 rounded">{ps.aiResponse}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {selectedDetail.transcription && (
                    <div>
                      <Label className="text-xs text-muted-foreground">O'quvchi javobi (transkripsiya)</Label>
                      <p className="text-sm bg-muted/50 p-2 rounded mt-1 max-h-[150px] overflow-y-auto">{selectedDetail.transcription}</p>
                    </div>
                  )}
                  {selectedDetail.aiResponse && (
                    <div>
                      <Label className="text-xs text-muted-foreground">AI izohi</Label>
                      <p className="text-sm bg-blue-50 dark:bg-blue-950/30 p-2 rounded mt-1">{selectedDetail.aiResponse}</p>
                    </div>
                  )}
                </>
              )}
              {selectedDetail.status === "pending" && (
                <p className="text-sm text-muted-foreground">Hali topshirilmagan</p>
              )}
              {selectedDetail.submissionId && selectedDetail.status === "completed" && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  disabled={resetSubmissionMutation.isPending}
                  onClick={() => {
                    if (confirm("Natijani bekor qilasizmi? O'quvchi qayta topshira oladi.")) {
                      resetSubmissionMutation.mutate(selectedDetail.submissionId);
                    }
                  }}
                  data-testid="button-reset-submission"
                >
                  {resetSubmissionMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Bekor qilinmoqda...</> : <><Trash2 className="w-3.5 h-3.5 mr-1" /> Natijani bekor qilish</>}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={telegramOpen} onOpenChange={setTelegramOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Natijalarni Telegram ga yuborish</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Telegram guruh/kanal</Label>
              <p className="text-xs text-muted-foreground mb-1">AI bot qo'shilgan guruh ID sini kiriting. Botni guruhga admin qilib qo'shing.</p>
              <Input
                placeholder="Chat ID (masalan: -100123456789 yoki @guruh_nomi)"
                value={selectedTgChat}
                onChange={(e) => setSelectedTgChat(e.target.value)}
                data-testid="input-tg-chat-id"
              />
            </div>
            <div>
              <Label>Qaysi natijalarni yuborish</Label>
              <Select value={selectedTgLesson} onValueChange={setSelectedTgLesson}>
                <SelectTrigger data-testid="select-tg-lesson"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Barcha darslar</SelectItem>
                  {lessonNumbers.map(num => (
                    <SelectItem key={num} value={String(num)}>{num}-dars</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => sendResultsMutation.mutate()}
              disabled={!selectedTgChat || sendResultsMutation.isPending}
              className="gradient-purple border-0"
              data-testid="button-confirm-send-results"
            >
              {sendResultsMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Yuborilmoqda...</> : <><Send className="w-3.5 h-3.5 mr-1" /> Yuborish</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              To'lov — {paymentStudent?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">To'lov holati</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: "paid", label: "✅ To'langan", active: "bg-green-100 border-green-400 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
                  { key: "nasiya", label: "🔵 Nasiya", active: "bg-blue-100 border-blue-400 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
                  { key: "partial", label: "⏳ Qisman", active: "bg-yellow-100 border-yellow-400 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300" },
                  { key: "unpaid", label: "❌ To'lanmagan", active: "bg-red-100 border-red-400 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
                ] as const).map(s => (
                  <button key={s.key} onClick={() => setPayStatus(s.key)}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${payStatus === s.key ? s.active : "border-border hover:bg-muted/40"}`}
                    data-testid={`button-pay-status-${s.key}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Summa (so'm)</Label>
                <Input type="number" placeholder="masalan: 500000" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="mt-1" data-testid="input-pay-amount" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Nechta dars uchun</Label>
                <Input type="number" placeholder="masalan: 4" value={payLessons} onChange={e => setPayLessons(e.target.value)} className="mt-1" data-testid="input-pay-lessons" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Qachongacha (sana)</Label>
              <Input type="date" value={payUntil} onChange={e => setPayUntil(e.target.value)} className="mt-1" data-testid="input-pay-until" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Izoh (ixtiyoriy)</Label>
              <Input placeholder="Qo'shimcha izoh..." value={payNote} onChange={e => setPayNote(e.target.value)} className="mt-1" data-testid="input-pay-note" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPaymentOpen(false)} data-testid="button-pay-cancel">Bekor</Button>
            <Button onClick={savePayment} disabled={paymentMutation.isPending} data-testid="button-pay-save">
              {paymentMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
              Saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
