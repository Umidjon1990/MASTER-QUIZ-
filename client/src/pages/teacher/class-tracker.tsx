import { useState, useMemo, useRef, useCallback } from "react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowLeft, Users, BookOpen, CheckCircle2, Clock, XCircle, RotateCcw, AlertTriangle, Send, CalendarCheck, FileText, BarChart3, ChevronRight, Calendar, MoreVertical, Plus, Pencil, Copy, Trash2 } from "lucide-react";
import { Link } from "wouter";
import type { Class, ClassLesson, TaskColumn, LessonTask, TaskSubmission, UserProfile, TelegramChat, AssistantPermissions } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";

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
  isAssistant?: boolean;
  assistantPermissions?: AssistantPermissions | null;
}

interface AssistantInfo {
  id: string;
  classId: string;
  userId: string | null;
  inviteCode: string;
  password: string | null;
  permissions: AssistantPermissions;
  invitedBy: string;
  status: string;
  userName: string | null;
  createdAt: string;
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
  return <Icon className={`w-5 h-5 sm:w-4 sm:h-4 ${config.className} ${className || ""}`} />;
}

export default function ClassTracker() {
  const [, params] = useRoute("/teacher/classes/:id/tracker");
  const classId = params?.id;
  const { toast } = useToast();

  const urlTab = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;

  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editStudentId, setEditStudentId] = useState("");
  const [editLessonTaskId, setEditLessonTaskId] = useState("");
  const [editStatus, setEditStatus] = useState<SubmissionStatus>("pending");
  const [editScore, setEditScore] = useState<number | undefined>(undefined);
  const [editFeedback, setEditFeedback] = useState("");
  const [editSubmissionId, setEditSubmissionId] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState("all");
  const [activeTab, setActiveTab] = useState(urlTab === "assistants" ? "assistants" : "tracker");
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [telegramType, setTelegramType] = useState<"today_task" | "debtors" | "weekly_report" | "monthly_report" | "lesson_report">("today_task");
  const [selectedChatId, setSelectedChatId] = useState("");

  const [lessonDialogOpen, setLessonDialogOpen] = useState(false);
  const [lessonDialogMode, setLessonDialogMode] = useState<"add" | "edit" | "duplicate">("add");
  const [lessonEditId, setLessonEditId] = useState<string | null>(null);
  const [lessonFormTitle, setLessonFormTitle] = useState("");
  const [lessonFormDate, setLessonFormDate] = useState("");
  const [lessonFormNo, setLessonFormNo] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLessonId, setDeleteLessonId] = useState<string | null>(null);
  const [taskEditOpen, setTaskEditOpen] = useState(false);
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingColTitle, setEditingColTitle] = useState("");
  const [assistantDialogOpen, setAssistantDialogOpen] = useState(false);
  const [assistantPassword, setAssistantPassword] = useState("");
  const [assistantPerms, setAssistantPerms] = useState<AssistantPermissions>({
    canMarkTasks: true, canSendTelegram: false, canEditLessons: false, canViewTracker: true,
  });

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

  const quickToggleMutation = useMutation({
    mutationFn: async (data: { studentId: string; lessonTaskId: string; status: string; id?: string }) => {
      await apiRequest("POST", "/api/submissions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes", classId, "tracker"] });
    },
    onError: () => {
      toast({ title: "Xatolik yuz berdi", variant: "destructive" });
    },
  });

  const invalidateTracker = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/classes", classId, "tracker"] });
    queryClient.invalidateQueries({ queryKey: ["/api/classes", classId, "debtors"] });
  };

  const addLessonMutation = useMutation({
    mutationFn: async (data: { lessonNo: number; date: string; title: string }) => {
      const res = await apiRequest("POST", `/api/classes/${classId}/lessons`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidateTracker();
      toast({ title: "Dars qo'shildi" });
      setLessonDialogOpen(false);
    },
    onError: () => toast({ title: "Xatolik yuz berdi", variant: "destructive" }),
  });

  const updateLessonMutation = useMutation({
    mutationFn: async (data: { id: string; title?: string; date?: string; lessonNo?: number }) => {
      const { id, ...body } = data;
      const res = await apiRequest("PATCH", `/api/class-lessons/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      invalidateTracker();
      toast({ title: "Dars yangilandi" });
      setLessonDialogOpen(false);
    },
    onError: () => toast({ title: "Xatolik yuz berdi", variant: "destructive" }),
  });

  const duplicateLessonMutation = useMutation({
    mutationFn: async (data: { id: string; date: string; lessonNo?: number }) => {
      const { id, ...body } = data;
      const res = await apiRequest("POST", `/api/class-lessons/${id}/duplicate`, body);
      return res.json();
    },
    onSuccess: () => {
      invalidateTracker();
      toast({ title: "Dars nusxalandi" });
      setLessonDialogOpen(false);
    },
    onError: () => toast({ title: "Xatolik yuz berdi", variant: "destructive" }),
  });

  const deleteLessonMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/class-lessons/${id}`);
    },
    onSuccess: () => {
      invalidateTracker();
      toast({ title: "Dars o'chirildi" });
      setDeleteConfirmOpen(false);
      if (selectedLessonId === deleteLessonId) setSelectedLessonId(null);
    },
    onError: () => toast({ title: "Xatolik yuz berdi", variant: "destructive" }),
  });

  const addLessonTaskMutation = useMutation({
    mutationFn: async (data: { lessonId: string; taskColumnId: string }) => {
      await apiRequest("POST", `/api/class-lessons/${data.lessonId}/tasks`, { taskColumnId: data.taskColumnId });
    },
    onSuccess: () => {
      invalidateTracker();
      toast({ title: "Vazifa qo'shildi" });
    },
    onError: () => toast({ title: "Xatolik yuz berdi", variant: "destructive" }),
  });

  const removeLessonTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/lesson-tasks/${id}`);
    },
    onSuccess: () => {
      invalidateTracker();
      toast({ title: "Vazifa o'chirildi" });
    },
    onError: () => toast({ title: "Xatolik yuz berdi", variant: "destructive" }),
  });

  const renameColumnMutation = useMutation({
    mutationFn: async (data: { colId: string; title: string }) => {
      await apiRequest("PATCH", `/api/classes/${classId}/task-columns/${data.colId}`, { title: data.title });
    },
    onSuccess: () => {
      invalidateTracker();
      setEditingColId(null);
      toast({ title: "Vazifa nomi o'zgartirildi" });
    },
    onError: () => toast({ title: "Xatolik yuz berdi", variant: "destructive" }),
  });

  const deleteColumnMutation = useMutation({
    mutationFn: async (colId: string) => {
      await apiRequest("DELETE", `/api/classes/${classId}/task-columns/${colId}`);
    },
    onSuccess: () => {
      invalidateTracker();
      toast({ title: "Vazifa turi o'chirildi" });
    },
    onError: () => toast({ title: "Xatolik yuz berdi", variant: "destructive" }),
  });

  const { data: assistants = [] } = useQuery<AssistantInfo[]>({
    queryKey: ["/api/classes", classId, "assistants"],
    enabled: !!classId && !tracker?.isAssistant,
  });

  const createAssistantMutation = useMutation({
    mutationFn: async (data: { password?: string; permissions: AssistantPermissions }) => {
      const res = await apiRequest("POST", `/api/classes/${classId}/assistants`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes", classId, "assistants"] });
      toast({ title: "Yordamchi taklifi yaratildi" });
      setAssistantDialogOpen(false);
      setAssistantPassword("");
    },
    onError: () => toast({ title: "Xatolik yuz berdi", variant: "destructive" }),
  });

  const deleteAssistantMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/class-assistants/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes", classId, "assistants"] });
      toast({ title: "Yordamchi o'chirildi" });
    },
    onError: () => toast({ title: "Xatolik yuz berdi", variant: "destructive" }),
  });

  const updateAssistantMutation = useMutation({
    mutationFn: async (data: { id: string; permissions?: AssistantPermissions; status?: string }) => {
      const { id, ...body } = data;
      await apiRequest("PATCH", `/api/class-assistants/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes", classId, "assistants"] });
      toast({ title: "Yangilandi" });
    },
    onError: () => toast({ title: "Xatolik yuz berdi", variant: "destructive" }),
  });

  const isAssistantUser = tracker?.isAssistant || false;
  const aPerms = tracker?.assistantPermissions;

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
      return { lessonTaskId: task.id, taskColumnId: task.taskColumnId, colTitle: col?.title || "?" };
    });
  }, [selectedLessonTasks, taskColumnsData]);

  const availableColumnsForLesson = useMemo(() => {
    const assignedColIds = new Set(selectedLessonTasks.map(t => t.taskColumnId));
    return taskColumnsData.filter(c => !assignedColIds.has(c.id));
  }, [selectedLessonTasks, taskColumnsData]);

  const filteredMembers = useMemo(() => {
    if (filterStatus === "all") return members;
    return members.filter((m) => {
      return selectedLessonColumns.some((col) => {
        const sub = getSubmission(m.userId, col.lessonTaskId);
        const status = sub?.status || "missing";
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
    setEditStatus((existing?.status as SubmissionStatus) || "missing");
    setEditScore(existing?.score ?? undefined);
    setEditFeedback(existing?.feedback || "");
    setEditSubmissionId(existing?.id || null);
    setEditOpen(true);
  };

  const STATUS_CYCLE: SubmissionStatus[] = ["missing", "submitted", "pending"];
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canMarkTasks = !isAssistantUser || aPerms?.canMarkTasks;
  const canEditLessons = !isAssistantUser || aPerms?.canEditLessons;
  const canSendTelegram = !isAssistantUser || aPerms?.canSendTelegram;

  const handleCellClick = useCallback((studentId: string, lessonTaskId: string) => {
    if (!canMarkTasks) return;
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      openEditModal(studentId, lessonTaskId);
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        const existing = getSubmission(studentId, lessonTaskId);
        const currentStatus = (existing?.status as SubmissionStatus) || "missing";
        const currentIdx = STATUS_CYCLE.indexOf(currentStatus);
        const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];
        quickToggleMutation.mutate({
          studentId,
          lessonTaskId,
          status: nextStatus,
          id: existing?.id || undefined,
        });
      }, 250);
    }
  }, [submissionMap, quickToggleMutation]);

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

  const openAddLesson = () => {
    const nextNo = sortedLessons.length > 0 ? Math.max(...sortedLessons.map(l => l.lessonNo)) + 1 : 1;
    setLessonDialogMode("add");
    setLessonEditId(null);
    setLessonFormTitle(`Dars ${nextNo}`);
    setLessonFormDate(new Date().toISOString().split("T")[0]);
    setLessonFormNo(String(nextNo));
    setLessonDialogOpen(true);
  };

  const openEditLesson = (lesson: ClassLesson) => {
    setLessonDialogMode("edit");
    setLessonEditId(lesson.id);
    setLessonFormTitle(lesson.title || "");
    setLessonFormDate(lesson.date ? new Date(lesson.date).toISOString().split("T")[0] : "");
    setLessonFormNo(String(lesson.lessonNo));
    setLessonDialogOpen(true);
  };

  const openDuplicateLesson = (lesson: ClassLesson) => {
    const nextNo = sortedLessons.length > 0 ? Math.max(...sortedLessons.map(l => l.lessonNo)) + 1 : 1;
    setLessonDialogMode("duplicate");
    setLessonEditId(lesson.id);
    setLessonFormTitle(lesson.title || "");
    setLessonFormDate("");
    setLessonFormNo(String(nextNo));
    setLessonDialogOpen(true);
  };

  const openDeleteLesson = (lessonId: string) => {
    setDeleteLessonId(lessonId);
    setDeleteConfirmOpen(true);
  };

  const handleLessonSubmit = () => {
    if (lessonDialogMode === "add") {
      addLessonMutation.mutate({ lessonNo: Number(lessonFormNo), date: lessonFormDate, title: lessonFormTitle });
    } else if (lessonDialogMode === "edit" && lessonEditId) {
      updateLessonMutation.mutate({ id: lessonEditId, title: lessonFormTitle, date: lessonFormDate, lessonNo: Number(lessonFormNo) });
    } else if (lessonDialogMode === "duplicate" && lessonEditId) {
      duplicateLessonMutation.mutate({ id: lessonEditId, date: lessonFormDate, lessonNo: Number(lessonFormNo) });
    }
  };

  const lessonMutationPending = addLessonMutation.isPending || updateLessonMutation.isPending || duplicateLessonMutation.isPending;

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

  const openTelegramDialog = (type: "today_task" | "debtors" | "weekly_report" | "monthly_report" | "lesson_report") => {
    setTelegramType(type);
    setSelectedChatId("");
    setTelegramOpen(true);
  };

  const handleTelegramSend = () => {
    if (!selectedChatId) {
      toast({ title: "Chat tanlang", variant: "destructive" });
      return;
    }
    const payload: any = { chatId: selectedChatId, type: telegramType };
    if (telegramType === "lesson_report" && selectedLesson) {
      payload.lessonId = selectedLesson.id;
    }
    telegramNotifyMutation.mutate(payload);
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
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
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
            {!isAssistantUser && (
              <TabsTrigger value="assistants" data-testid="tab-assistants">
                <Users className="w-4 h-4 mr-1.5" />
                Yordamchilar
                {assistants.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5">{assistants.length}</Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          {hasTelegramBot && telegramChats.length > 0 && canSendTelegram && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => openTelegramDialog("today_task")} data-testid="button-telegram-today">
                <CalendarCheck className="w-4 h-4 mr-1.5" />
                Bugungi
              </Button>
              {selectedLesson && (
                <Button variant="outline" size="sm" onClick={() => openTelegramDialog("lesson_report")} data-testid="button-telegram-lesson">
                  <FileText className="w-4 h-4 mr-1.5" />
                  Dars {selectedLesson.lessonNo}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => openTelegramDialog("debtors")} data-testid="button-telegram-debtors">
                <AlertTriangle className="w-4 h-4 mr-1.5" />
                Qarzdorlar
              </Button>
              <Button variant="outline" size="sm" onClick={() => openTelegramDialog("weekly_report")} data-testid="button-telegram-weekly">
                <BarChart3 className="w-4 h-4 mr-1.5" />
                Haftalik
              </Button>
              <Button variant="outline" size="sm" onClick={() => openTelegramDialog("monthly_report")} data-testid="button-telegram-monthly">
                <BarChart3 className="w-4 h-4 mr-1.5" />
                Oylik
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="tracker" className="mt-4 space-y-4">
          {sortedLessons.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground mb-4" data-testid="text-no-data">
                Darslar topilmadi. Avval darslar va vazifa ustunlarini yarating.
              </p>
              {canEditLessons && (
                <Button onClick={openAddLesson} data-testid="button-add-first-lesson">
                  <Plus className="w-4 h-4 mr-1.5" /> Birinchi darsni qo'shish
                </Button>
              )}
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{sortedLessons.length} ta dars</p>
                {canEditLessons && (
                  <Button variant="outline" size="sm" onClick={openAddLesson} data-testid="button-add-lesson">
                    <Plus className="w-4 h-4 mr-1.5" /> Dars qo'shish
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2" data-testid="lesson-grid">
                {sortedLessons.map((lesson) => {
                  const prog = getLessonProgress(lesson.id);
                  const isActive = selectedLessonId === lesson.id;
                  return (
                    <Card
                      key={lesson.id}
                      className={`p-3 cursor-pointer transition-all hover:shadow-md relative group ${isActive ? "ring-2 ring-primary bg-primary/5 dark:bg-primary/10" : "hover:bg-muted/50"}`}
                      onClick={() => setSelectedLessonId(isActive ? null : lesson.id)}
                      data-testid={`card-lesson-${lesson.lessonNo}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-semibold ${isActive ? "text-primary" : ""}`}>
                          Dars {lesson.lessonNo}
                        </span>
                        {canEditLessons && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`button-lesson-menu-${lesson.lessonNo}`}>
                                <MoreVertical className="w-3.5 h-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => openEditLesson(lesson)} data-testid={`menu-edit-lesson-${lesson.lessonNo}`}>
                                <Pencil className="w-3.5 h-3.5 mr-2" /> Tahrirlash
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openDuplicateLesson(lesson)} data-testid={`menu-duplicate-lesson-${lesson.lessonNo}`}>
                                <Copy className="w-3.5 h-3.5 mr-2" /> Takrorlash
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => openDeleteLesson(lesson.id)} data-testid={`menu-delete-lesson-${lesson.lessonNo}`}>
                                <Trash2 className="w-3.5 h-3.5 mr-2" /> O'chirish
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
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
                  <div className="p-3 sm:p-4 border-b bg-muted/30">
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
                      <div className="flex items-center gap-2">
                        {canEditLessons && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setTaskEditOpen(true)}
                            data-testid="btn-edit-lesson-tasks"
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1.5" />
                            Vazifalar
                          </Button>
                        )}
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                          <SelectTrigger className="w-[120px] sm:w-[160px]" data-testid="select-filter-status">
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
                    <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1.5 sm:mt-2">
                      <span className="hidden sm:inline">1 marta bosish = status almashtirish &nbsp;|&nbsp; 2 marta bosish = ball va izoh kiritish</span>
                      <span className="sm:hidden">1x bosish = status &nbsp;|&nbsp; 2x bosish = ball</span>
                    </p>
                  </div>

                  <div className="overflow-x-auto -mx-2 sm:mx-0">
                    <table className="w-full text-xs sm:text-sm" data-testid="tracker-table">
                      <thead>
                        <tr className="border-b bg-muted/20">
                          <th className="text-center p-1.5 sm:p-2 font-medium w-[32px] sm:w-[40px] sticky left-0 bg-muted/20 z-20" data-testid="th-student-no">
                            №
                          </th>
                          <th className="text-left p-2 sm:p-3 font-medium min-w-[120px] sm:min-w-[160px] sticky left-[32px] sm:left-[40px] bg-muted/20 z-10" data-testid="th-student-name">
                            O'quvchi
                          </th>
                          {selectedLessonColumns.map((col, idx) => (
                            <th key={idx} className="text-center p-1.5 sm:p-2.5 font-medium border-l min-w-[56px] sm:min-w-[90px]" data-testid={`th-task-col-${idx}`}>
                              <span className="block truncate max-w-[52px] sm:max-w-none">{col.colTitle}</span>
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
                              <td className={`text-center p-1.5 sm:p-2 text-[10px] sm:text-xs text-muted-foreground w-[32px] sm:w-[40px] sticky left-0 z-20 ${mIdx % 2 === 0 ? "bg-background" : "bg-muted/10"}`}>
                                {mIdx + 1}
                              </td>
                              <td className={`p-2 sm:p-3 font-medium sticky left-[32px] sm:left-[40px] z-10 ${mIdx % 2 === 0 ? "bg-background" : "bg-muted/10"}`} data-testid={`cell-student-name-${member.userId}`}>
                                <span className="truncate block max-w-[110px] sm:max-w-[160px] text-xs sm:text-sm">{member.userName || "Foydalanuvchi"}</span>
                              </td>
                              {selectedLessonColumns.map((col, cIdx) => {
                                const sub = getSubmission(member.userId, col.lessonTaskId);
                                const status = (sub?.status as SubmissionStatus) || "missing";
                                const cellBg = status === "submitted" ? "bg-green-50 dark:bg-green-950/30" :
                                               status === "missing" ? "bg-red-50 dark:bg-red-950/30" :
                                               status === "pending" ? "bg-yellow-50 dark:bg-yellow-950/30" :
                                               status === "rework" ? "bg-blue-50 dark:bg-blue-950/30" : "";
                                return (
                                  <td
                                    key={cIdx}
                                    className={`text-center p-1 sm:p-2 border-l cursor-pointer hover:opacity-80 active:scale-95 transition-all select-none ${cellBg}`}
                                    onClick={() => handleCellClick(member.userId, col.lessonTaskId)}
                                    data-testid={`cell-${member.userId}-${col.lessonTaskId}`}
                                  >
                                    <div className="flex flex-col items-center justify-center gap-0.5 min-h-[28px] sm:min-h-0">
                                      <StatusIcon status={status} />
                                      {sub?.score != null && (
                                        <span className="text-[10px] sm:text-xs font-medium" data-testid={`score-${member.userId}-${col.lessonTaskId}`}>
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
                  <p className="text-muted-foreground mb-3">Bu darsda vazifa ustunlari topilmadi.</p>
                  {taskColumnsData.length > 0 && canEditLessons && (
                    <Button variant="outline" size="sm" onClick={() => setTaskEditOpen(true)} data-testid="btn-add-tasks-empty">
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Vazifa qo'shish
                    </Button>
                  )}
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

        {!isAssistantUser && (
          <TabsContent value="assistants" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Yordamchi o'qituvchilar</h3>
              <Button size="sm" onClick={() => {
                setAssistantPerms({ canMarkTasks: true, canSendTelegram: false, canEditLessons: false, canViewTracker: true });
                setAssistantPassword("");
                setAssistantDialogOpen(true);
              }} data-testid="button-add-assistant">
                <Plus className="w-4 h-4 mr-1.5" />
                Yordamchi qo'shish
              </Button>
            </div>

            {assistants.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>Hozircha yordamchi o'qituvchi yo'q</p>
                <p className="text-sm mt-1">Invite link yaratib, boshqa o'qituvchiga yuboring</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {assistants.map((a) => (
                  <Card key={a.id} className="p-4" data-testid={`card-assistant-${a.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{a.userName || "Kutilmoqda..."}</span>
                          <Badge variant={a.status === "active" ? "default" : a.status === "revoked" ? "destructive" : "secondary"}>
                            {a.status === "active" ? "Faol" : a.status === "revoked" ? "Bekor qilingan" : "Kutilmoqda"}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {a.permissions.canViewTracker && <Badge variant="outline" className="text-xs">Trackerni ko'rish</Badge>}
                          {a.permissions.canMarkTasks && <Badge variant="outline" className="text-xs">Vazifalarni belgilash</Badge>}
                          {a.permissions.canSendTelegram && <Badge variant="outline" className="text-xs">Telegram yuborish</Badge>}
                          {a.permissions.canEditLessons && <Badge variant="outline" className="text-xs">Darslarni tahrirlash</Badge>}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-0.5 rounded">{`${window.location.origin}/classes/join-assistant/${a.inviteCode}`}</code>
                          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/classes/join-assistant/${a.inviteCode}`);
                            toast({ title: "Link nusxalandi" });
                          }} data-testid={`button-copy-link-${a.id}`}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {a.status === "active" && (
                          <Button variant="ghost" size="sm" onClick={() => updateAssistantMutation.mutate({ id: a.id, status: "revoked" })} data-testid={`button-revoke-${a.id}`}>
                            <XCircle className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                        {a.status === "revoked" && (
                          <Button variant="ghost" size="sm" onClick={() => updateAssistantMutation.mutate({ id: a.id, status: "active" })} data-testid={`button-reactivate-${a.id}`}>
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => deleteAssistantMutation.mutate(a.id)} data-testid={`button-delete-assistant-${a.id}`}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={assistantDialogOpen} onOpenChange={setAssistantDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yordamchi o'qituvchi qo'shish</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Parol (ixtiyoriy)</Label>
              <Input
                type="text"
                placeholder="Parol qo'yish (bo'sh qoldirsa paroli yo'q)"
                value={assistantPassword}
                onChange={(e) => setAssistantPassword(e.target.value)}
                data-testid="input-assistant-password"
              />
              <p className="text-xs text-muted-foreground mt-1">Link orqali kirganda parol so'raladi</p>
            </div>
            <div>
              <Label className="mb-2 block">Huquqlar</Label>
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={assistantPerms.canViewTracker}
                    onCheckedChange={(c) => setAssistantPerms(p => ({ ...p, canViewTracker: !!c }))}
                    data-testid="checkbox-perm-view"
                  />
                  <span className="text-sm">Trackerni ko'rish</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={assistantPerms.canMarkTasks}
                    onCheckedChange={(c) => setAssistantPerms(p => ({ ...p, canMarkTasks: !!c }))}
                    data-testid="checkbox-perm-mark"
                  />
                  <span className="text-sm">Vazifalarni belgilash</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={assistantPerms.canSendTelegram}
                    onCheckedChange={(c) => setAssistantPerms(p => ({ ...p, canSendTelegram: !!c }))}
                    data-testid="checkbox-perm-telegram"
                  />
                  <span className="text-sm">Telegram xabar yuborish</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={assistantPerms.canEditLessons}
                    onCheckedChange={(c) => setAssistantPerms(p => ({ ...p, canEditLessons: !!c }))}
                    data-testid="checkbox-perm-lessons"
                  />
                  <span className="text-sm">Darslarni tahrirlash</span>
                </label>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={createAssistantMutation.isPending}
              onClick={() => createAssistantMutation.mutate({
                password: assistantPassword || undefined,
                permissions: assistantPerms,
              })}
              data-testid="button-create-assistant"
            >
              {createAssistantMutation.isPending ? "Yaratilmoqda..." : "Invite link yaratish"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={telegramOpen} onOpenChange={setTelegramOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle data-testid="text-telegram-title">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                {telegramType === "today_task" && "Bugungi vazifani yuborish"}
                {telegramType === "lesson_report" && `Dars ${selectedLesson?.lessonNo || ""} hisobotini yuborish`}
                {telegramType === "debtors" && "Qarzdorlar ro'yxatini yuborish"}
                {telegramType === "weekly_report" && "Haftalik hisobotni yuborish"}
                {telegramType === "monthly_report" && "Oylik hisobotni yuborish"}
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

      <Dialog open={lessonDialogOpen} onOpenChange={setLessonDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle data-testid="text-lesson-dialog-title">
              {lessonDialogMode === "add" && "Yangi dars qo'shish"}
              {lessonDialogMode === "edit" && "Darsni tahrirlash"}
              {lessonDialogMode === "duplicate" && "Darsni takrorlash"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Dars raqami</Label>
              <Input
                type="number"
                min={1}
                value={lessonFormNo}
                onChange={(e) => setLessonFormNo(e.target.value)}
                data-testid="input-lesson-no"
              />
            </div>
            <div>
              <Label>Nomi</Label>
              <Input
                value={lessonFormTitle}
                onChange={(e) => setLessonFormTitle(e.target.value)}
                placeholder="Dars nomi..."
                data-testid="input-lesson-title"
              />
            </div>
            <div>
              <Label>{lessonDialogMode === "duplicate" ? "Yangi sana" : "Sana"}</Label>
              <Input
                type="date"
                value={lessonFormDate}
                onChange={(e) => setLessonFormDate(e.target.value)}
                data-testid="input-lesson-date"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLessonDialogOpen(false)} data-testid="button-lesson-cancel">
                Bekor qilish
              </Button>
              <Button
                className="gradient-purple border-0"
                onClick={handleLessonSubmit}
                disabled={lessonMutationPending || !lessonFormDate || !lessonFormNo}
                data-testid="button-lesson-save"
              >
                {lessonMutationPending ? "Saqlanmoqda..." : (
                  lessonDialogMode === "add" ? "Qo'shish" :
                  lessonDialogMode === "edit" ? "Saqlash" : "Nusxalash"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle data-testid="text-delete-lesson-title">Darsni o'chirish</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Bu dars va unga bog'liq barcha vazifalar hamda baholashlar o'chiriladi. Bu amalni qaytarib bo'lmaydi.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} data-testid="button-delete-cancel">
                Bekor qilish
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteLessonId && deleteLessonMutation.mutate(deleteLessonId)}
                disabled={deleteLessonMutation.isPending}
                data-testid="button-delete-confirm"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                {deleteLessonMutation.isPending ? "O'chirilmoqda..." : "O'chirish"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={taskEditOpen} onOpenChange={(open) => { setTaskEditOpen(open); if (!open) setEditingColId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle data-testid="text-task-edit-title">
              Dars vazifalarini tahrirlash
              {selectedLesson && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  — Dars {selectedLesson.lessonNo}{selectedLesson.title ? `: ${selectedLesson.title}` : ""}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Hozirgi vazifalar</Label>
              {selectedLessonColumns.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center">Vazifalar yo'q</p>
              ) : (
                <div className="space-y-1.5">
                  {selectedLessonColumns.map((col) => (
                    <div key={col.lessonTaskId} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20 gap-2" data-testid={`task-item-${col.lessonTaskId}`}>
                      {editingColId === col.taskColumnId ? (
                        <form
                          className="flex items-center gap-1.5 flex-1"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (editingColTitle.trim()) {
                              renameColumnMutation.mutate({ colId: col.taskColumnId, title: editingColTitle.trim() });
                            }
                          }}
                        >
                          <Input
                            value={editingColTitle}
                            onChange={(e) => setEditingColTitle(e.target.value)}
                            className="h-7 text-sm"
                            autoFocus
                            data-testid={`input-rename-col-${col.taskColumnId}`}
                          />
                          <Button type="submit" size="sm" className="h-7 px-2" disabled={renameColumnMutation.isPending} data-testid={`btn-save-rename-${col.taskColumnId}`}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditingColId(null)} data-testid={`btn-cancel-rename-${col.taskColumnId}`}>
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </form>
                      ) : (
                        <span
                          className="text-sm font-medium cursor-pointer hover:text-primary transition-colors flex-1"
                          onClick={() => { setEditingColId(col.taskColumnId); setEditingColTitle(col.colTitle); }}
                          title="Nomini o'zgartirish uchun bosing"
                          data-testid={`text-col-title-${col.taskColumnId}`}
                        >
                          {col.colTitle}
                        </span>
                      )}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                          onClick={() => { setEditingColId(col.taskColumnId); setEditingColTitle(col.colTitle); }}
                          data-testid={`btn-edit-col-${col.taskColumnId}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => removeLessonTaskMutation.mutate(col.lessonTaskId)}
                          disabled={removeLessonTaskMutation.isPending}
                          title="Bu darsdan olib tashlash"
                          data-testid={`btn-remove-task-${col.lessonTaskId}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {availableColumnsForLesson.length > 0 && selectedLesson && (
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Vazifa qo'shish</Label>
                <div className="flex flex-wrap gap-2">
                  {availableColumnsForLesson.map((col) => (
                    <Button
                      key={col.id}
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => addLessonTaskMutation.mutate({ lessonId: selectedLesson.id, taskColumnId: col.id })}
                      disabled={addLessonTaskMutation.isPending}
                      data-testid={`btn-add-task-col-${col.id}`}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      {col.title}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {availableColumnsForLesson.length === 0 && selectedLessonColumns.length > 0 && (
              <p className="text-xs text-muted-foreground text-center py-1">Barcha vazifa turlari allaqachon qo'shilgan</p>
            )}

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setTaskEditOpen(false)} data-testid="btn-close-task-edit">
                Yopish
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
