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
import { ArrowLeft, Plus, Trash2, Power, PowerOff, Users, ListChecks, Settings, BarChart3, X, Phone, Wifi, WifiOff, Pencil, Check, ChevronDown, ChevronRight, Send, Upload, Loader2, Download } from "lucide-react";
import { motion } from "framer-motion";

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

  const addTaskMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/ai-classes/${classId}/tasks`, {
        title: newTaskTitle,
        prompt: newTaskPrompt,
        referenceText: newTaskRef,
        lessonNumber: newTaskLessonNum,
        type: "audio",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes", classId, "results"] });
      setAddTaskOpen(false);
      setNewTaskTitle("");
      setNewTaskPrompt("");
      setNewTaskRef("");
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
        <TabsList className="grid w-full grid-cols-4 sm:w-auto sm:inline-grid" data-testid="ai-class-tabs">
          <TabsTrigger value="results"><BarChart3 className="w-3.5 h-3.5 mr-1 hidden sm:inline" />Natijalar</TabsTrigger>
          <TabsTrigger value="students"><Users className="w-3.5 h-3.5 mr-1 hidden sm:inline" />O'quvchilar</TabsTrigger>
          <TabsTrigger value="tasks"><ListChecks className="w-3.5 h-3.5 mr-1 hidden sm:inline" />Darslar</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="w-3.5 h-3.5 mr-1 hidden sm:inline" />Sozlamalar</TabsTrigger>
        </TabsList>

        <TabsContent value="results" className="mt-4">
          {results?.results?.length > 0 ? (
            <>
              {hasTgBot && (
                <div className="flex justify-end mb-3">
                  <Button size="sm" variant="outline" onClick={() => setTelegramOpen(true)} data-testid="button-send-tg-results">
                    <Send className="w-3.5 h-3.5 mr-1" /> Telegram ga yuborish
                  </Button>
                </div>
              )}
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm" data-testid="ai-results-table">
                    <thead>
                      {resultLessons.length > 0 && (
                        <tr className="border-b bg-purple-50 dark:bg-purple-950/20">
                          <th className="p-1 sticky left-0 bg-purple-50 dark:bg-purple-950/20 z-10" />
                          <th className="p-1 sticky left-[32px] bg-purple-50 dark:bg-purple-950/20 z-10" />
                          {resultLessons.map((lesson: any) => (
                            <th
                              key={lesson.lessonNumber}
                              colSpan={lesson.tasks.length}
                              className="text-center p-1 text-xs font-bold border-l text-purple-700 dark:text-purple-300"
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span>{lesson.lessonNumber}-dars</span>
                                <button
                                  className="text-blue-400 hover:text-blue-600 transition-colors p-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/30"
                                  title={`${lesson.lessonNumber}-dars natijalarini PDF yuklab olish`}
                                  onClick={() => {
                                    window.open(`/api/ai-classes/${classId}/download-lesson/${lesson.lessonNumber}`, "_blank");
                                  }}
                                  data-testid={`button-download-lesson-${lesson.lessonNumber}`}
                                >
                                  <Download className="w-3 h-3" />
                                </button>
                                <button
                                  className="text-red-400 hover:text-red-600 transition-colors p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
                                  title={`${lesson.lessonNumber}-dars natijalarini bekor qilish`}
                                  disabled={resetLessonMutation.isPending}
                                  onClick={() => {
                                    if (confirm(`${lesson.lessonNumber}-dars barcha natijalarini bekor qilasizmi? Barcha o'quvchilar qayta topshira oladi.`)) {
                                      resetLessonMutation.mutate(lesson.lessonNumber);
                                    }
                                  }}
                                  data-testid={`button-reset-lesson-${lesson.lessonNumber}`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </th>
                          ))}
                          <th className="p-1 border-l bg-purple-50 dark:bg-purple-950/20" />
                        </tr>
                      )}
                      <tr className="border-b bg-muted/20">
                        <th className="text-center p-2 font-medium w-[32px] sticky left-0 bg-muted/20 z-10">N</th>
                        <th className="text-left p-2 font-medium min-w-[120px] sticky left-[32px] bg-muted/20 z-10">O'quvchi</th>
                        {results.tasks?.map((t: any, idx: number) => (
                          <th key={idx} className="text-center p-2 font-medium border-l min-w-[55px] text-[10px] sm:text-xs">{t.taskTitle || t.title}</th>
                        ))}
                        <th className="text-center p-2 font-medium border-l min-w-[50px] bg-muted/10">O'rtacha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.results.map((r: any, idx: number) => (
                        <tr key={r.studentId} className={`border-b ${idx % 2 ? "bg-muted/10" : ""}`}>
                          <td className={`text-center p-2 text-xs text-muted-foreground sticky left-0 z-10 ${idx % 2 ? "bg-muted/10" : "bg-background"}`}>{idx + 1}</td>
                          <td className={`p-2 font-medium sticky left-[32px] z-10 ${idx % 2 ? "bg-muted/10" : "bg-background"}`}>
                            <div className="flex items-center gap-1">
                              <span className="truncate max-w-[100px] sm:max-w-[140px]">{r.studentName}</span>
                              {r.connected ? <Wifi className="w-3 h-3 text-green-500 flex-shrink-0" /> : <WifiOff className="w-3 h-3 text-gray-400 flex-shrink-0" />}
                            </div>
                          </td>
                          {r.taskResults.map((tr: any, tIdx: number) => (
                            <td
                              key={tIdx}
                              className={`text-center p-2 border-l cursor-pointer hover:opacity-80 transition-all ${scoreColor(tr.score)}`}
                              onClick={() => { setSelectedDetail(tr); setDetailOpen(true); }}
                              data-testid={`cell-result-${r.studentId}-${tr.taskId}`}
                            >
                              {tr.score ? <span className="font-semibold">{tr.score}</span> : <span className="text-muted-foreground">—</span>}
                            </td>
                          ))}
                          <td className={`text-center p-2 border-l font-semibold ${scoreColor(Math.round(r.avgScore))}`}>
                            {r.avgScore > 0 ? r.avgScore : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Natijalar hali yo'q. O'quvchilar bot orqali vazifalarni yuborishi kerak.</p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="students" className="mt-4">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">{aiClass.students?.length || 0} ta o'quvchi</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={async () => {
                const students = aiClass.students || [];
                if (students.length === 0) return;
                const XLSX = await import("xlsx");
                const data = students.map((s: any, i: number) => ({
                  "№": i + 1,
                  "Ism": s.name,
                  "Telefon": s.phone || "",
                  "Holat": s.telegramChatId ? "Ulangan" : "Kutilmoqda",
                }));
                const ws = XLSX.utils.json_to_sheet(data);
                ws["!cols"] = [{ wch: 5 }, { wch: 30 }, { wch: 15 }, { wch: 12 }];
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "O'quvchilar");
                XLSX.writeFile(wb, `${aiClass.name || "sinf"}_o'quvchilar.xlsx`);
              }} data-testid="button-download-students">
                <Download className="w-3.5 h-3.5 mr-1" /> Yuklab olish
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)} data-testid="button-bulk-add-students">
                <Upload className="w-3.5 h-3.5 mr-1" /> Bulk qo'shish
              </Button>
              <Button size="sm" onClick={() => setAddStudentOpen(true)} data-testid="button-add-ai-student">
                <Plus className="w-3.5 h-3.5 mr-1" /> Qo'shish
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {aiClass.students?.map((s: any, idx: number) => (
              <Card key={s.id} className="p-3 flex items-center justify-between" data-testid={`card-ai-student-${s.id}`}>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-5">{idx + 1}</span>
                  <div>
                    <span className="font-medium text-sm">{s.name}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="w-3 h-3" /> {s.phone}
                      {s.telegramChatId ? <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-600">Ulangan</Badge> : <Badge variant="outline" className="text-[10px] px-1 py-0">Kutilmoqda</Badge>}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => deleteStudentMutation.mutate(s.id)} data-testid={`button-delete-student-${s.id}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">{lessonNumbers.length} ta dars, {allTasks.length} ta vazifa</p>
            <Button size="sm" onClick={() => { setNewTaskLessonNum(maxLessonNum + 1); setAddTaskOpen(true); }} data-testid="button-add-ai-task">
              <Plus className="w-3.5 h-3.5 mr-1" /> Vazifa qo'shish
            </Button>
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
                                <span className="font-medium text-sm">{localIdx + 1}. {t.title}</span>
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

      <Dialog open={addTaskOpen} onOpenChange={setAddTaskOpen}>
        <DialogContent>
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
              <Label>Mavzu matni (faqat AI uchun)</Label>
              <Textarea value={newTaskRef} onChange={e => setNewTaskRef(e.target.value)} placeholder="O'quvchi tarjima qilishi kerak bo'lgan matn" rows={3} />
            </div>
            <div>
              <Label>AI ga ko'rsatma</Label>
              <Input value={newTaskPrompt} onChange={e => setNewTaskPrompt(e.target.value)} placeholder="Tarjimani tekshir va baho ber" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => addTaskMutation.mutate()} disabled={!newTaskTitle || addTaskMutation.isPending}>
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
              </div>
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
    </div>
  );
}
