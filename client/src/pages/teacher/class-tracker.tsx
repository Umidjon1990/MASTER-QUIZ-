import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Users, BookOpen, CheckCircle2, Clock, XCircle, RotateCcw, AlertTriangle, Send, CalendarCheck, FileText, BarChart3, ChevronRight, Calendar } from "lucide-react";
import { Link } from "wouter";
import type { Class, ClassLesson, TaskColumn, LessonTask, TaskSubmission, UserProfile, TelegramChat } from "@shared/schema";

interface ClassMemberInfo {
  id: string;
  userId: string;
  userName?: string;
  joinedAt?: string;
}

interface TrackerData {
  students: ClassMemberInfo[];
  lessons: ClassLesson[];
  taskColumns: TaskColumn[];
  lessonTasks: LessonTask[];
  submissions: TaskSubmission[];
}

interface DebtorItem {
  studentId: string;
  studentName: string;
  lessonTaskId: string;
  taskTitle: string;
  lessonNo: number;
  dueDate: string | null;
}

type SubmissionStatus = "pending" | "submitted" | "missing" | "rework";

const STATUS_CONFIG: Record<SubmissionStatus, { icon: typeof CheckCircle2; label: string; className: string }> = {
  submitted: { icon: CheckCircle2, label: "Topshirildi", className: "text-green-600 dark:text-green-400" },
  pending: { icon: Clock, label: "Kutilmoqda", className: "text-yellow-600 dark:text-yellow-400" },
  missing: { icon: XCircle, label: "Topshirilmadi", className: "text-red-500 dark:text-red-400" },
  rework: { icon: RotateCcw, label: "Qayta ishlash", className: "text-blue-500 dark:text-blue-400" },
};

function StatusIcon({ status, className }: { status: SubmissionStatus; className?: string }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return <Icon className={`w-4 h-4 ${config.className} ${className || ""}`} />;
}

export default function ClassTracker() {
  const [, params] = useRoute("/teacher/classes/:id/tracker");
  const classId = params?.id;
  const { toast } = useToast();

  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editStudentId, setEditStudentId] = useState("");
  const [editLessonTaskId, setEditLessonTaskId] = useState("");
  const [editStatus, setEditStatus] = useState<SubmissionStatus>("pending");
  const [editScore, setEditScore] = useState<number | undefined>(undefined);
  const [editFeedback, setEditFeedback] = useState("");
  const [editSubmissionId, setEditSubmissionId] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState("all");
  const [activeTab, setActiveTab] = useState("tracker");
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [telegramType, setTelegramType] = useState<"today_task" | "debtors" | "weekly_report">("today_task");
  const [selectedChatId, setSelectedChatId] = useState("");

  const { data: classInfo } = useQuery<Class>({
    queryKey: ["/api/classes", classId],
    enabled: !!classId,
  });

  const { data: tracker, isLoading } = useQuery<TrackerData>({
    queryKey: ["/api/classes", classId, "tracker"],
    enabled: !!classId,
  });

  const { data: debtors } = useQuery<DebtorItem[]>({
    queryKey: ["/api/classes", classId, "debtors"],
    enabled: !!classId,
  });

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
  });

  const hasTelegramBot = !!(profile as any)?.hasTelegramBot;
  const telegramChats = ((profile?.telegramChats as TelegramChat[]) || []);

  const telegramNotifyMutation = useMutation({
    mutationFn: async (data: { chatId: string; type: string }) => {
      const res = await apiRequest("POST", `/api/classes/${classId}/telegram-notify`, data);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: data.message || "Xabar yuborildi" });
      setTelegramOpen(false);
    },
    onError: (error: any) => {
      toast({ title: error.message || "Xabar yuborishda xatolik", variant: "destructive" });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: { studentId: string; lessonTaskId: string; status: string; score?: number; feedback?: string; id?: string }) => {
      await apiRequest("POST", "/api/submissions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes", classId, "tracker"] });
      toast({ title: "Saqlandi" });
      setEditOpen(false);
    },
    onError: () => {
      toast({ title: "Xatolik yuz berdi", variant: "destructive" });
    },
  });

  const members = tracker?.students || [];
  const lessons = tracker?.lessons || [];
  const taskColumnsData = tracker?.taskColumns || [];
  const lessonTasksData = tracker?.lessonTasks || [];
  const submissions = tracker?.submissions || [];

  const sortedLessons = useMemo(() => {
    return [...lessons].sort((a, b) => (a.lessonNo || 0) - (b.lessonNo || 0));
  }, [lessons]);

  const lessonTaskMap = useMemo(() => {
    const map: Record<string, LessonTask[]> = {};
    for (const lt of lessonTasksData) {
      if (!map[lt.lessonId]) map[lt.lessonId] = [];
      map[lt.lessonId].push(lt);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        const colA = taskColumnsData.find((c) => c.id === a.taskColumnId);
        const colB = taskColumnsData.find((c) => c.id === b.taskColumnId);
        return (colA?.sortOrder || 0) - (colB?.sortOrder || 0);
      });
    }
    return map;
  }, [lessonTasksData, taskColumnsData]);

  const submissionMap = useMemo(() => {
    const map: Record<string, TaskSubmission> = {};
    for (const s of submissions) {
      map[`${s.studentId}_${s.lessonTaskId}`] = s;
    }
    return map;
  }, [submissions]);

  const getSubmission = (studentId: string, lessonTaskId: string) => {
    return submissionMap[`${studentId}_${lessonTaskId}`];
  };

  const selectedLesson = useMemo(() => {
    return sortedLessons.find(l => l.id === selectedLessonId) || null;
  }, [sortedLessons, selectedLessonId]);

  const selectedLessonTasks = useMemo(() => {
    if (!selectedLessonId) return [];
    return lessonTaskMap[selectedLessonId] || [];
  }, [selectedLessonId, lessonTaskMap]);

  const selectedLessonColumns = useMemo(() => {
    return selectedLessonTasks.map(task => {
      const col = taskColumnsData.find(c => c.id === task.taskColumnId);
      return { lessonTaskId: task.id, colTitle: col?.title || "?" };
    });
  }, [selectedLessonTasks, taskColumnsData]);

  const filteredMembers = useMemo(() => {
    if (filterStatus === "all") return members;
    return members.filter((m) => {
      return selectedLessonColumns.some((col) => {
        const sub = getSubmission(m.userId, col.lessonTaskId);
        const status = sub?.status || "pending";
        return status === filterStatus;
      });
    });
  }, [members, filterStatus, selectedLessonColumns, submissionMap]);

  const getLessonProgress = (lessonId: string) => {
    const tasks = lessonTaskMap[lessonId] || [];
    if (tasks.length === 0 || members.length === 0) return { submitted: 0, total: 0, percent: 0 };
    let submitted = 0;
    let total = tasks.length * members.length;
    for (const m of members) {
      for (const t of tasks) {
        const sub = getSubmission(m.userId, t.id);
        if (sub?.status === "submitted") submitted++;
      }
    }
    return { submitted, total, percent: total > 0 ? Math.round((submitted / total) * 100) : 0 };
  };

  const overallProgress = useMemo(() => {
    if (members.length === 0 || lessonTasksData.length === 0) return 0;
    let submitted = 0;
    let total = 0;
    for (const m of members) {
      for (const lt of lessonTasksData) {
        total++;
        const sub = getSubmission(m.userId, lt.id);
        if (sub?.status === "submitted") submitted++;
      }
    }
    return total > 0 ? Math.round((submitted / total) * 100) : 0;
  }, [members, lessonTasksData, submissionMap]);

  const openEditModal = (studentId: string, lessonTaskId: string) => {
    const existing = getSubmission(studentId, lessonTaskId);
    setEditStudentId(studentId);
    setEditLessonTaskId(lessonTaskId);
    setEditStatus((existing?.status as SubmissionStatus) || "pending");
    setEditScore(existing?.score ?? undefined);
    setEditFeedback(existing?.feedback || "");
    setEditSubmissionId(existing?.id || null);
    setEditOpen(true);
  };

  const handleSave = () => {
    submitMutation.mutate({
      studentId: editStudentId,
      lessonTaskId: editLessonTaskId,
      status: editStatus,
      score: editScore,
      feedback: editFeedback || undefined,
      id: editSubmissionId || undefined,
    });
  };

  const groupedDebtors = useMemo(() => {
    if (!debtors || debtors.length === 0) return [];
    const map = new Map<string, { studentName: string; tasks: { taskTitle: string; lessonNo: number }[]; count: number }>();
    for (const d of debtors) {
      if (!map.has(d.studentId)) {
        map.set(d.studentId, { studentName: d.studentName, tasks: [], count: 0 });
      }
      const g = map.get(d.studentId)!;
      g.tasks.push({ taskTitle: d.taskTitle, lessonNo: d.lessonNo });
      g.count++;
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [debtors]);

  const totalDebtorTasks = debtors?.length || 0;
  const uniqueDebtorStudents = groupedDebtors.length;

  const openTelegramDialog = (type: "today_task" | "debtors" | "weekly_report") => {
    setTelegramType(type);
    setSelectedChatId("");
    setTelegramOpen(true);
  };

  const handleTelegramSend = () => {
    if (!selectedChatId) {
      toast({ title: "Chat tanlang", variant: "destructive" });
      return;
    }
    telegramNotifyMutation.mutate({ chatId: selectedChatId, type: telegramType });
  };

  const editStudentName = members.find((m) => m.userId === editStudentId)?.userName || "O'quvchi";

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/teacher/classes">
          <Button variant="ghost" size="icon" data-testid="button-back-classes">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate" data-testid="text-tracker-title">
            {classInfo?.name || "Tracker"}
          </h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              <span data-testid="text-student-count">{members.length} o'quvchi</span>
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" />
              <span data-testid="text-lesson-count">{lessons.length} dars</span>
            </span>
            {classInfo?.level && (
              <Badge variant="outline" data-testid="badge-class-level">{classInfo.level}</Badge>
            )}
          </div>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-4 mb-2 flex-wrap">
          <span className="text-sm font-medium">Umumiy progress</span>
          <span className="text-sm font-semibold" data-testid="text-overall-progress">{overallProgress}%</span>
        </div>
        <Progress value={overallProgress} className="h-2" data-testid="progress-overall" />
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            <TabsTrigger value="tracker" data-testid="tab-tracker">
              <BookOpen className="w-4 h-4 mr-1.5" />
              Tracker
            </TabsTrigger>
            <TabsTrigger value="debtors" data-testid="tab-debtors">
              <AlertTriangle className="w-4 h-4 mr-1.5" />
              Qarzdorlar
              {uniqueDebtorStudents > 0 && (
                <Badge variant="destructive" className="ml-1.5">{uniqueDebtorStudents}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {hasTelegramBot && telegramChats.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => openTelegramDialog("today_task")} data-testid="button-telegram-today">
                <CalendarCheck className="w-4 h-4 mr-1.5" />
                Bugungi vazifa
              </Button>
              <Button variant="outline" size="sm" onClick={() => openTelegramDialog("debtors")} data-testid="button-telegram-debtors">
                <FileText className="w-4 h-4 mr-1.5" />
                Qarzdorlar
              </Button>
              <Button variant="outline" size="sm" onClick={() => openTelegramDialog("weekly_report")} data-testid="button-telegram-weekly">
                <BarChart3 className="w-4 h-4 mr-1.5" />
                Haftalik hisobot
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="tracker" className="mt-4 space-y-4">
          {sortedLessons.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground" data-testid="text-no-data">
                Darslar topilmadi. Avval darslar va vazifa ustunlarini yarating.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2" data-testid="lesson-grid">
                {sortedLessons.map((lesson) => {
                  const prog = getLessonProgress(lesson.id);
                  const isActive = selectedLessonId === lesson.id;
                  return (
                    <Card
                      key={lesson.id}
                      className={`p-3 cursor-pointer transition-all hover:shadow-md ${isActive ? "ring-2 ring-primary bg-primary/5 dark:bg-primary/10" : "hover:bg-muted/50"}`}
                      onClick={() => setSelectedLessonId(isActive ? null : lesson.id)}
                      data-testid={`card-lesson-${lesson.lessonNo}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-semibold ${isActive ? "text-primary" : ""}`}>
                          Dars {lesson.lessonNo}
                        </span>
                        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isActive ? "rotate-90" : ""}`} />
                      </div>
                      {lesson.date && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                          <Calendar className="w-3 h-3" />
                          {new Date(lesson.date).toLocaleDateString("uz-UZ", { weekday: "short", day: "2-digit", month: "short" })}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Progress value={prog.percent} className="h-1.5 flex-1" />
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{prog.submitted}/{prog.total}</span>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {selectedLesson && selectedLessonColumns.length > 0 ? (
                <Card className="overflow-hidden" data-testid="selected-lesson-card">
                  <div className="p-4 border-b bg-muted/30">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h3 className="font-semibold" data-testid="text-selected-lesson-title">
                          Dars {selectedLesson.lessonNo}
                          {selectedLesson.title && `: ${selectedLesson.title}`}
                        </h3>
                        {selectedLesson.date && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(selectedLesson.date).toLocaleDateString("uz-UZ", { year: "numeric", month: "long", day: "numeric" })}
                          </p>
                        )}
                      </div>
                      <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="w-[160px]" data-testid="select-filter-status">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Barchasi</SelectItem>
                          <SelectItem value="submitted">Topshirildi</SelectItem>
                          <SelectItem value="pending">Kutilmoqda</SelectItem>
                          <SelectItem value="missing">Topshirilmadi</SelectItem>
                          <SelectItem value="rework">Qayta ishlash</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="tracker-table">
                      <thead>
                        <tr className="border-b bg-muted/20">
                          <th className="text-center p-2 font-medium w-[40px] sticky left-0 bg-muted/20 z-20" data-testid="th-student-no">
                            №
                          </th>
                          <th className="text-left p-3 font-medium min-w-[160px] sticky left-[40px] bg-muted/20 z-10" data-testid="th-student-name">
                            O'quvchi
                          </th>
                          {selectedLessonColumns.map((col, idx) => (
                            <th key={idx} className="text-center p-2.5 font-medium border-l min-w-[90px]" data-testid={`th-task-col-${idx}`}>
                              {col.colTitle}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMembers.length === 0 ? (
                          <tr>
                            <td colSpan={selectedLessonColumns.length + 2} className="text-center p-6 text-muted-foreground">
                              O'quvchilar topilmadi
                            </td>
                          </tr>
                        ) : (
                          filteredMembers.map((member, mIdx) => (
                            <tr key={member.id} className={`border-b ${mIdx % 2 === 0 ? "" : "bg-muted/10"}`} data-testid={`row-student-${member.userId}`}>
                              <td className={`text-center p-2 text-xs text-muted-foreground w-[40px] sticky left-0 z-20 ${mIdx % 2 === 0 ? "bg-background" : "bg-muted/10"}`}>
                                {mIdx + 1}
                              </td>
                              <td className={`p-3 font-medium sticky left-[40px] z-10 ${mIdx % 2 === 0 ? "bg-background" : "bg-muted/10"}`} data-testid={`cell-student-name-${member.userId}`}>
                                <span className="truncate block max-w-[160px]">{member.userName || "Foydalanuvchi"}</span>
                              </td>
                              {selectedLessonColumns.map((col, cIdx) => {
                                const sub = getSubmission(member.userId, col.lessonTaskId);
                                const status = (sub?.status as SubmissionStatus) || "pending";
                                return (
                                  <td
                                    key={cIdx}
                                    className="text-center p-2 border-l cursor-pointer hover:bg-muted/30 transition-colors"
                                    onClick={() => openEditModal(member.userId, col.lessonTaskId)}
                                    data-testid={`cell-${member.userId}-${col.lessonTaskId}`}
                                  >
                                    <div className="flex flex-col items-center gap-0.5">
                                      <StatusIcon status={status} />
                                      {sub?.score != null && (
                                        <span className="text-xs font-medium" data-testid={`score-${member.userId}-${col.lessonTaskId}`}>
                                          {sub.score}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ) : selectedLesson && selectedLessonColumns.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">Bu darsda vazifa ustunlari topilmadi.</p>
                </Card>
              ) : (
                <Card className="p-8 text-center border-dashed">
                  <BookOpen className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground" data-testid="text-select-lesson">
                    Yuqoridagi ro'yxatdan darsni tanlang
                  </p>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="debtors" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Qarzdor o'quvchilar</div>
              <div className="text-2xl font-bold mt-1" data-testid="text-debtor-students">{uniqueDebtorStudents}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Jami qolgan vazifalar</div>
              <div className="text-2xl font-bold mt-1" data-testid="text-debtor-tasks">{totalDebtorTasks}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">O'rtacha qarzdorlik</div>
              <div className="text-2xl font-bold mt-1" data-testid="text-debtor-avg">
                {uniqueDebtorStudents > 0 ? (totalDebtorTasks / uniqueDebtorStudents).toFixed(1) : 0} ta
              </div>
            </Card>
          </div>

          {groupedDebtors.length === 0 ? (
            <Card className="p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-lg font-medium" data-testid="text-no-debtors">Qarzdorlar yo'q</p>
              <p className="text-sm text-muted-foreground mt-1">Barcha vazifalar bajarilgan</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {groupedDebtors.map((debtor, idx) => (
                <Card key={idx} className="p-4" data-testid={`card-debtor-${idx}`}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-destructive/10">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate" data-testid={`text-debtor-name-${idx}`}>{debtor.studentName}</p>
                        <p className="text-sm text-muted-foreground" data-testid={`text-debtor-count-${idx}`}>
                          {debtor.count} ta vazifa qolgan
                        </p>
                      </div>
                    </div>
                    <Badge variant="destructive" data-testid={`badge-debtor-count-${idx}`}>{debtor.count}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {debtor.tasks.map((task, tIdx) => (
                      <Badge key={tIdx} variant="outline" className="text-xs" data-testid={`badge-debtor-task-${idx}-${tIdx}`}>
                        Dars {task.lessonNo}: {task.taskTitle}
                      </Badge>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={telegramOpen} onOpenChange={setTelegramOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle data-testid="text-telegram-title">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                {telegramType === "today_task" && "Bugungi vazifani yuborish"}
                {telegramType === "debtors" && "Qarzdorlar ro'yxatini yuborish"}
                {telegramType === "weekly_report" && "Haftalik hisobotni yuborish"}
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Telegram guruh</Label>
              <Select value={selectedChatId} onValueChange={setSelectedChatId}>
                <SelectTrigger data-testid="select-telegram-chat">
                  <SelectValue placeholder="Guruh tanlang..." />
                </SelectTrigger>
                <SelectContent>
                  {telegramChats.map((chat) => (
                    <SelectItem key={chat.chatId} value={chat.chatId} data-testid={`option-chat-${chat.chatId}`}>
                      {chat.title || chat.chatId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTelegramOpen(false)} data-testid="button-telegram-cancel">
                Bekor qilish
              </Button>
              <Button
                onClick={handleTelegramSend}
                disabled={telegramNotifyMutation.isPending || !selectedChatId}
                data-testid="button-telegram-send"
              >
                <Send className="w-4 h-4 mr-1.5" />
                {telegramNotifyMutation.isPending ? "Yuborilmoqda..." : "Yuborish"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle data-testid="text-edit-title">Baholash</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-xs">O'quvchi</Label>
              <p className="font-medium" data-testid="text-edit-student">{editStudentName}</p>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as SubmissionStatus)}>
                <SelectTrigger data-testid="select-edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_CONFIG) as SubmissionStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className="flex items-center gap-2">
                        <StatusIcon status={s} />
                        {STATUS_CONFIG[s].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ball (0-100)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={editScore ?? ""}
                onChange={(e) => setEditScore(e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="Ball kiriting..."
                data-testid="input-edit-score"
              />
            </div>
            <div>
              <Label>Izoh</Label>
              <Textarea
                value={editFeedback}
                onChange={(e) => setEditFeedback(e.target.value)}
                placeholder="Izoh yozing..."
                data-testid="input-edit-feedback"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)} data-testid="button-edit-cancel">
                Bekor qilish
              </Button>
              <Button
                className="gradient-purple border-0"
                onClick={handleSave}
                disabled={submitMutation.isPending}
                data-testid="button-edit-save"
              >
                {submitMutation.isPending ? "Saqlanmoqda..." : "Saqlash"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
