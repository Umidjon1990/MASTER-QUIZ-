import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Copy, GraduationCap, Users, UserMinus, ChevronLeft, ChevronRight, CalendarDays, ListChecks, X, BarChart3, UserPlus, Download, FileText, UserCog, Link2 } from "lucide-react";
import { Link } from "wouter";
import type { Class } from "@shared/schema";

interface BulkResult {
  name: string;
  email: string;
  password: string;
  status: string;
}

interface ClassMemberInfo {
  id: string;
  userId: string;
  userName?: string;
  joinedAt?: string;
}

const WEEK_DAYS = [
  { value: "monday", label: "Dush" },
  { value: "tuesday", label: "Sesh" },
  { value: "wednesday", label: "Chor" },
  { value: "thursday", label: "Pay" },
  { value: "friday", label: "Jum" },
  { value: "saturday", label: "Shan" },
  { value: "sunday", label: "Yak" },
];

const DEFAULT_TASK_COLUMNS = [
  "Homework",
  "Listening",
  "Reading",
  "Writing",
  "Speaking",
  "Vocabulary",
];

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default function TeacherClasses() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  const [bulkText, setBulkText] = useState("");
  const [bulkResults, setBulkResults] = useState<BulkResult[] | null>(null);

  const [wizardStep, setWizardStep] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [scheduleType, setScheduleType] = useState("weekly");
  const [scheduleDays, setScheduleDays] = useState<string[]>([]);
  const [totalLessons, setTotalLessons] = useState(30);
  const [taskColumnNames, setTaskColumnNames] = useState<string[]>(["Homework", "Listening", "Reading"]);
  const [newColumnName, setNewColumnName] = useState("");

  const resetWizard = () => {
    setWizardStep(0);
    setName("");
    setDescription("");
    setLevel("");
    setStartDate("");
    setScheduleType("weekly");
    setScheduleDays([]);
    setTotalLessons(30);
    setTaskColumnNames(["Homework", "Listening", "Reading"]);
    setNewColumnName("");
  };

  const { data: classes, isLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  const { data: assistantClasses = [] } = useQuery<any[]>({
    queryKey: ["/api/assistant-classes"],
  });

  const { data: members, isLoading: membersLoading } = useQuery<ClassMemberInfo[]>({
    queryKey: ["/api/classes", selectedClassId, "members"],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${selectedClassId}/members`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedClassId && membersOpen,
  });

  const createClassWizard = useMutation({
    mutationFn: async () => {
      const classRes = await apiRequest("POST", "/api/classes", {
        name,
        description: description || undefined,
        level: level || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        scheduleType: scheduleType || undefined,
        scheduleDays: scheduleDays.length > 0 ? scheduleDays : undefined,
        totalLessons: totalLessons || undefined,
      });
      const createdClass = await classRes.json();

      if (startDate && totalLessons > 0) {
        try {
          await apiRequest("POST", `/api/classes/${createdClass.id}/generate-lessons`, {
            startDate: new Date(startDate).toISOString(),
            scheduleType,
            scheduleDays,
            totalLessons,
          });
        } catch (e) {
        }
      }

      for (let i = 0; i < taskColumnNames.length; i++) {
        try {
          await apiRequest("POST", `/api/classes/${createdClass.id}/task-columns`, {
            title: taskColumnNames[i],
            sortOrder: i,
          });
        } catch (e) {
        }
      }

      return createdClass;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({ title: "Sinf yaratildi!" });
      setCreateOpen(false);
      resetWizard();
    },
    onError: () => {
      toast({ title: "Sinf yaratishda xatolik", variant: "destructive" });
    },
  });

  const deleteClass = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/classes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({ title: "Sinf o'chirildi" });
    },
  });

  const removeMember = useMutation({
    mutationFn: async ({ classId, userId }: { classId: string; userId: string }) => {
      await apiRequest("DELETE", `/api/classes/${classId}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes", selectedClassId, "members"] });
      toast({ title: "A'zo chiqarildi" });
    },
  });

  const bulkAddStudents = useMutation({
    mutationFn: async () => {
      const names = bulkText.split("\n").map(s => s.trim()).filter(Boolean);
      if (names.length === 0) throw new Error("Ismlarni kiriting");
      const res = await apiRequest("POST", `/api/classes/${selectedClassId}/bulk-add-students`, { students: names });
      return res.json();
    },
    onSuccess: (data: { results: BulkResult[] }) => {
      setBulkResults(data.results);
      queryClient.invalidateQueries({ queryKey: ["/api/classes", selectedClassId, "members"] });
      toast({ title: `${data.results.filter(r => r.status === "created").length} ta o'quvchi qo'shildi!` });
    },
    onError: () => {
      toast({ title: "Xatolik yuz berdi", variant: "destructive" });
    },
  });

  const downloadCredentials = () => {
    if (!bulkResults) return;
    const created = bulkResults.filter(r => r.status === "created");
    let text = "Ism\tEmail\tParol\n";
    for (const r of created) {
      text += `${r.name}\t${r.email}\t${r.password}\n`;
    }
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students_credentials.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Kod nusxalandi!" });
  };

  const handleViewMembers = (id: string) => {
    setSelectedClassId(id);
    setBulkText("");
    setBulkResults(null);
    setMembersOpen(true);
  };

  const toggleDay = (day: string) => {
    setScheduleDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const addTaskColumn = () => {
    const trimmed = newColumnName.trim();
    if (trimmed && !taskColumnNames.includes(trimmed)) {
      setTaskColumnNames((prev) => [...prev, trimmed]);
      setNewColumnName("");
    }
  };

  const removeTaskColumn = (col: string) => {
    setTaskColumnNames((prev) => prev.filter((c) => c !== col));
  };

  const addDefaultColumn = (col: string) => {
    if (!taskColumnNames.includes(col)) {
      setTaskColumnNames((prev) => [...prev, col]);
    }
  };

  const canGoNext = () => {
    if (wizardStep === 0) return name.trim().length > 0;
    if (wizardStep === 1) return true;
    if (wizardStep === 2) return true;
    return false;
  };

  const stepTitles = ["Asosiy ma'lumotlar", "Dars jadvali", "Vazifa ustunlari"];

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-classes-title">Sinflarim</h1>
          <p className="text-muted-foreground">Sinflar va guruhlarni boshqarish</p>
        </div>
        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetWizard(); }}>
          <DialogTrigger asChild>
            <Button className="gradient-purple border-0" data-testid="button-new-class">
              <Plus className="w-4 h-4 mr-1" /> Yangi Sinf
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle data-testid="text-wizard-title">Yangi Sinf Yaratish</DialogTitle>
            </DialogHeader>

            <div className="flex items-center gap-2 mb-4">
              {stepTitles.map((title, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div
                    className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold ${
                      i === wizardStep
                        ? "bg-primary text-primary-foreground"
                        : i < wizardStep
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                    }`}
                    data-testid={`badge-step-${i}`}
                  >
                    {i + 1}
                  </div>
                  <span className={`text-xs hidden sm:inline ${i === wizardStep ? "font-semibold" : "text-muted-foreground"}`}>
                    {title}
                  </span>
                  {i < stepTitles.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                </div>
              ))}
            </div>

            {wizardStep === 0 && (
              <div className="space-y-4" data-testid="wizard-step-0">
                <div>
                  <Label>Sinf nomi</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Masalan: B2-Morning"
                    data-testid="input-class-name"
                  />
                </div>
                <div>
                  <Label>Daraja</Label>
                  <Select value={level} onValueChange={setLevel}>
                    <SelectTrigger data-testid="select-level">
                      <SelectValue placeholder="Darajani tanlang" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((l) => (
                        <SelectItem key={l} value={l} data-testid={`option-level-${l}`}>{l}</SelectItem>
                      ))}
                      <SelectItem value="other" data-testid="option-level-other">Boshqa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tavsif (ixtiyoriy)</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Sinf haqida qisqacha..."
                    data-testid="input-class-description"
                  />
                </div>
              </div>
            )}

            {wizardStep === 1 && (
              <div className="space-y-4" data-testid="wizard-step-1">
                <div>
                  <Label>Boshlanish sanasi</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    data-testid="input-start-date"
                  />
                </div>
                <div>
                  <Label>Jadval turi</Label>
                  <Select value={scheduleType} onValueChange={setScheduleType}>
                    <SelectTrigger data-testid="select-schedule-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Haftalik (kunlarni tanlash)</SelectItem>
                      <SelectItem value="every_other_day">Kun ora</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {scheduleType === "weekly" && (
                  <div>
                    <Label>Dars kunlari</Label>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {WEEK_DAYS.map((day) => (
                        <Button
                          key={day.value}
                          variant="outline"
                          size="sm"
                          className={`toggle-elevate ${scheduleDays.includes(day.value) ? "toggle-elevated" : ""}`}
                          onClick={() => toggleDay(day.value)}
                          data-testid={`button-day-${day.value}`}
                        >
                          {day.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <Label>Umumiy darslar soni</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={totalLessons}
                    onChange={(e) => setTotalLessons(parseInt(e.target.value) || 0)}
                    data-testid="input-total-lessons"
                  />
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-4" data-testid="wizard-step-2">
                <div>
                  <Label>Vazifa ustunlari</Label>
                  <p className="text-xs text-muted-foreground mb-2">Har dars uchun qanday vazifalar bo'lishini belgilang</p>
                  <div className="flex gap-2 flex-wrap mb-3">
                    {taskColumnNames.map((col) => (
                      <Badge key={col} variant="secondary" data-testid={`badge-task-col-${col}`}>
                        {col}
                        <button
                          className="ml-1 inline-flex"
                          onClick={() => removeTaskColumn(col)}
                          data-testid={`button-remove-col-${col}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newColumnName}
                      onChange={(e) => setNewColumnName(e.target.value)}
                      placeholder="Yangi ustun nomi..."
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTaskColumn(); } }}
                      data-testid="input-new-column"
                    />
                    <Button variant="outline" onClick={addTaskColumn} disabled={!newColumnName.trim()} data-testid="button-add-column">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Tayyor shablonlardan qo'shish:</Label>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {DEFAULT_TASK_COLUMNS.filter((c) => !taskColumnNames.includes(c)).map((col) => (
                      <Button
                        key={col}
                        variant="outline"
                        size="sm"
                        onClick={() => addDefaultColumn(col)}
                        data-testid={`button-template-${col}`}
                      >
                        <Plus className="w-3 h-3 mr-1" /> {col}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => setWizardStep((s) => s - 1)}
                disabled={wizardStep === 0}
                data-testid="button-wizard-back"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Orqaga
              </Button>
              {wizardStep < 2 ? (
                <Button
                  className="gradient-purple border-0"
                  onClick={() => setWizardStep((s) => s + 1)}
                  disabled={!canGoNext()}
                  data-testid="button-wizard-next"
                >
                  Keyingi <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  className="gradient-purple border-0"
                  onClick={() => createClassWizard.mutate()}
                  disabled={!name.trim() || createClassWizard.isPending}
                  data-testid="button-create-class"
                >
                  {createClassWizard.isPending ? "Yaratilmoqda..." : "Yaratish"}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>

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
      ) : classes && classes.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {classes.map((c) => (
            <motion.div key={c.id} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
              <Card className="p-5 hover-elevate" data-testid={`card-class-${c.id}`}>
                <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                  <h3 className="font-semibold" data-testid={`text-class-name-${c.id}`}>{c.name}</h3>
                  <div className="flex gap-1 flex-wrap">
                    {c.level && <Badge variant="outline" data-testid={`badge-level-${c.id}`}>{c.level}</Badge>}
                    <Badge variant="secondary">
                      <GraduationCap className="w-3 h-3 mr-1" /> Sinf
                    </Badge>
                  </div>
                </div>
                {c.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2" data-testid={`text-class-desc-${c.id}`}>{c.description}</p>
                )}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-sm text-muted-foreground">Kod:</span>
                  <Badge variant="outline" data-testid={`badge-join-code-${c.id}`}>{c.joinCode}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => handleCopyCode(c.joinCode)} data-testid={`button-copy-code-${c.id}`}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                {c.totalLessons && (
                  <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground flex-wrap">
                    <CalendarDays className="w-3 h-3" />
                    <span data-testid={`text-total-lessons-${c.id}`}>{c.totalLessons} dars</span>
                    {c.scheduleType && (
                      <span>({c.scheduleType === "weekly" ? "Haftalik" : "Kun ora"})</span>
                    )}
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  <Link href={`/teacher/classes/${c.id}/tracker`}>
                    <Button variant="default" size="sm" data-testid={`button-tracker-${c.id}`}>
                      <BarChart3 className="w-3 h-3 mr-1" /> Tracker
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" onClick={() => handleViewMembers(c.id)} data-testid={`button-view-members-${c.id}`}>
                    <Users className="w-3 h-3 mr-1" /> A'zolar
                  </Button>
                  <Link href={`/teacher/classes/${c.id}/tracker?tab=assistants`}>
                    <Button variant="outline" size="sm" data-testid={`button-assistants-${c.id}`}>
                      <UserCog className="w-3 h-3 mr-1" /> Yordamchi
                    </Button>
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => deleteClass.mutate(c.id)} data-testid={`button-delete-class-${c.id}`}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Sinflar yo'q</h3>
          <p className="text-muted-foreground mb-4">Birinchi sinfingizni yarating!</p>
          <Button className="gradient-purple border-0" onClick={() => setCreateOpen(true)} data-testid="button-first-class">
            <Plus className="w-4 h-4 mr-1" /> Yangi Sinf
          </Button>
        </Card>
      )}

      {assistantClasses.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Yordamchilik qilayotgan sinflarim
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assistantClasses.map((ac: any) => (
              <Card key={ac.id} className="p-5 hover-elevate border-dashed" data-testid={`card-assistant-class-${ac.classId}`}>
                <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                  <h3 className="font-semibold">{ac.className || "Sinf"}</h3>
                  <Badge variant="secondary">Yordamchi</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  O'qituvchi: {ac.teacherName || "—"}
                </p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {ac.permissions?.canViewTracker && <Badge variant="outline" className="text-xs">Tracker</Badge>}
                  {ac.permissions?.canMarkTasks && <Badge variant="outline" className="text-xs">Vazifalar</Badge>}
                  {ac.permissions?.canSendTelegram && <Badge variant="outline" className="text-xs">Telegram</Badge>}
                  {ac.permissions?.canEditLessons && <Badge variant="outline" className="text-xs">Darslar</Badge>}
                </div>
                <Link href={`/teacher/classes/${ac.classId}/tracker`}>
                  <Button variant="default" size="sm" data-testid={`button-assistant-tracker-${ac.classId}`}>
                    <BarChart3 className="w-3 h-3 mr-1" /> Tracker
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Dialog open={membersOpen} onOpenChange={(open) => { setMembersOpen(open); if (!open) { setSelectedClassId(null); setBulkText(""); setBulkResults(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sinf a'zolari</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="members">
            <TabsList className="w-full" data-testid="tabs-members">
              <TabsTrigger value="members" className="flex-1" data-testid="tab-members">
                <Users className="w-4 h-4 mr-1" /> A'zolar {members ? `(${members.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="bulk" className="flex-1" data-testid="tab-bulk-add">
                <UserPlus className="w-4 h-4 mr-1" /> Bulk qo'shish
              </TabsTrigger>
            </TabsList>

            <TabsContent value="members">
              {membersLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : members && members.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-auto">
                  {members.map((m) => (
                    <Card key={m.id} className="p-3" data-testid={`card-member-${m.id}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-medium text-sm" data-testid={`text-member-name-${m.id}`}>{(m as any).displayName || m.userName || "Foydalanuvchi"}</p>
                          {m.joinedAt && (
                            <p className="text-xs text-muted-foreground">
                              {new Date(m.joinedAt).toLocaleDateString("uz-UZ")}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => selectedClassId && removeMember.mutate({ classId: selectedClassId, userId: m.userId })}
                          data-testid={`button-remove-member-${m.id}`}
                        >
                          <UserMinus className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-6">Hali a'zolar yo'q</p>
              )}
            </TabsContent>

            <TabsContent value="bulk">
              {!bulkResults ? (
                <div className="space-y-4">
                  <div>
                    <Label data-testid="label-bulk-instructions">O'quvchilar ismlarini kiriting (har qator — bitta o'quvchi)</Label>
                    <p className="text-xs text-muted-foreground mt-1 mb-2">
                      Har bir ismni alohida qatorga yozing. Har biriga avtomatik email va parol yaratiladi.
                    </p>
                    <Textarea
                      placeholder={"Ali Valiyev\nVali Aliyev\nHasan Karimov\nHusayn Saidov"}
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      className="min-h-[180px] font-mono text-sm"
                      data-testid="textarea-bulk-students"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {bulkText.split("\n").filter(s => s.trim()).length} ta o'quvchi
                    </p>
                  </div>
                  <Button
                    className="w-full gradient-purple border-0"
                    onClick={() => bulkAddStudents.mutate()}
                    disabled={!bulkText.trim() || bulkAddStudents.isPending}
                    data-testid="button-bulk-submit"
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    {bulkAddStudents.isPending ? "Qo'shilmoqda..." : "O'quvchilarni qo'shish"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {bulkResults.filter(r => r.status === "created").length} ta o'quvchi yaratildi
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={downloadCredentials} data-testid="button-download-credentials">
                        <Download className="w-4 h-4 mr-1" /> Yuklab olish
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setBulkResults(null); setBulkText(""); }} data-testid="button-bulk-reset">
                        Yana qo'shish
                      </Button>
                    </div>
                  </div>
                  <div className="border rounded-lg overflow-auto max-h-72">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Ism</th>
                          <th className="text-left px-3 py-2 font-medium">Email</th>
                          <th className="text-left px-3 py-2 font-medium">Parol</th>
                          <th className="text-left px-3 py-2 font-medium">Holat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkResults.map((r, i) => (
                          <tr key={i} className="border-t" data-testid={`row-bulk-result-${i}`}>
                            <td className="px-3 py-2">{r.name}</td>
                            <td className="px-3 py-2 font-mono text-xs">{r.email}</td>
                            <td className="px-3 py-2 font-mono text-xs">{r.password || "—"}</td>
                            <td className="px-3 py-2">
                              {r.status === "created" ? (
                                <Badge variant="default" className="bg-green-600 text-xs">Yaratildi</Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">Xatolik</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <FileText className="w-3 h-3 inline mr-1" />
                    Login ma'lumotlarini "Yuklab olish" tugmasi orqali saqlang — parollar faqat bir marta ko'rinadi!
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
