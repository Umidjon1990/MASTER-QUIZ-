import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, BrainCircuit, Users, ListChecks, X, ChevronDown, ChevronRight, Copy, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface TaskDraft {
  lessonNumber: number;
  title: string;
  prompt: string;
  referenceText: string;
  type: string;
}

interface StudentDraft {
  name: string;
  phone: string;
}

export default function AiClasses() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [botToken, setBotToken] = useState("");
  const [instructions, setInstructions] = useState("");
  const [lessonsCount, setLessonsCount] = useState<number>(0);
  const [tasksPerLesson, setTasksPerLesson] = useState<number>(3);
  const [tasks, setTasks] = useState<TaskDraft[]>([]);
  const [students, setStudents] = useState<StudentDraft[]>([{ name: "", phone: "" }]);
  const [expandedLessons, setExpandedLessons] = useState<Set<number>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  const { data: aiClasses = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/ai-classes"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai-classes", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-classes"] });
      toast({ title: "AI sinf yaratildi!" });
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Xatolik", description: err.message, variant: "destructive" });
    },
  });

  async function importTasksFromClass(sourceId: string, sourceName: string) {
    setImportLoading(true);
    try {
      const res = await apiRequest("GET", `/api/ai-classes/${sourceId}`);
      const data = await res.json();
      const sourceTasks: any[] = data.tasks || [];
      if (sourceTasks.length === 0) {
        toast({ title: "Bu sinfda vazifalar yo'q" });
        setImportLoading(false);
        return;
      }
      const drafted: TaskDraft[] = sourceTasks.map((t: any) => ({
        lessonNumber: t.lessonNumber || 1,
        title: t.title,
        prompt: t.prompt || "",
        referenceText: t.referenceText || "",
        type: t.type || "audio",
      }));
      setTasks(drafted);
      const uniqueLessons = [...new Set(drafted.map(t => t.lessonNumber))];
      setLessonsCount(uniqueLessons.length);
      setImportOpen(false);
      toast({ title: `${sourceTasks.length} ta vazifa "${sourceName}" guruhidan yuklandi` });
    } catch {
      toast({ title: "Yuklab bo'lmadi", variant: "destructive" });
    }
    setImportLoading(false);
  }

  function resetForm() {
    setCreateOpen(false);
    setStep(0);
    setName("");
    setBotToken("");
    setInstructions("");
    setLessonsCount(0);
    setTasksPerLesson(3);
    setTasks([]);
    setStudents([{ name: "", phone: "" }]);
    setExpandedLessons(new Set());
  }

  function generateLessons(count: number, perLesson: number) {
    const newTasks: TaskDraft[] = [];
    const defaultTaskNames = ["Xat", "Grammatika", "Insho", "Lug'at", "Tarjima"];
    for (let lesson = 1; lesson <= count; lesson++) {
      for (let t = 0; t < perLesson; t++) {
        newTasks.push({
          lessonNumber: lesson,
          title: defaultTaskNames[t % defaultTaskNames.length] || `Vazifa ${t + 1}`,
          prompt: "",
          referenceText: "",
          type: "audio",
        });
      }
    }
    setTasks(newTasks);
    setLessonsCount(count);
    setTasksPerLesson(perLesson);
  }

  function toggleLesson(lessonNum: number) {
    const next = new Set(expandedLessons);
    if (next.has(lessonNum)) next.delete(lessonNum);
    else next.add(lessonNum);
    setExpandedLessons(next);
  }

  function handleCreate() {
    createMutation.mutate({
      name,
      telegramBotToken: botToken || null,
      instructions: instructions || null,
      tasks: tasks.filter(t => t.title),
      students: students.filter(s => s.name && s.phone),
    });
  }

  const lessonNumbers = [...new Set(tasks.map(t => t.lessonNumber))].sort((a, b) => a - b);

  const stepTitles = ["Asosiy ma'lumotlar", "Darslar va vazifalar", "O'quvchilar"];

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-ai-classes-title">AI Nazorat</h1>
          <p className="text-muted-foreground text-sm">Telegram bot + AI orqali vazifalarni avtomatik tekshirish</p>
        </div>
        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gradient-purple border-0" data-testid="button-new-ai-class">
              <Plus className="w-4 h-4 mr-1" /> Yangi AI Sinf
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Yangi AI Sinf Yaratish</DialogTitle>
            </DialogHeader>

            <div className="flex items-center gap-2 mb-4">
              {stepTitles.map((title, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold ${
                    i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {i + 1}
                  </div>
                  <span className="text-xs hidden sm:inline">{title}</span>
                  {i < stepTitles.length - 1 && <span className="text-muted-foreground mx-1">&gt;</span>}
                </div>
              ))}
            </div>

            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <Label>Sinf nomi *</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Arab tili 1-guruh" data-testid="input-ai-class-name" />
                </div>
                <div>
                  <Label>Telegram Bot Token</Label>
                  <Input value={botToken} onChange={e => setBotToken(e.target.value)} placeholder="123456:ABC-DEF..." data-testid="input-ai-bot-token" />
                  <p className="text-xs text-muted-foreground mt-1">@BotFather dan olingan token</p>
                </div>
                <div>
                  <Label>AI uchun umumiy ko'rsatma</Label>
                  <Textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Masalan: Arab tilidan o'zbek tiliga tarjimani tekshir, grammatik xatolarni belgilab ber..." rows={3} data-testid="input-ai-instructions" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Darslar soni</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={lessonsCount || ""}
                      onChange={e => {
                        const val = parseInt(e.target.value) || 0;
                        if (val >= 0 && val <= 100) {
                          generateLessons(val, tasksPerLesson);
                        }
                      }}
                      placeholder="12"
                      data-testid="input-lessons-count"
                    />
                  </div>
                  <div>
                    <Label>Har bir darsda vazifalar</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={tasksPerLesson || ""}
                      onChange={e => {
                        const val = parseInt(e.target.value) || 1;
                        if (val >= 1 && val <= 10) {
                          generateLessons(lessonsCount, val);
                        }
                      }}
                      placeholder="3"
                      data-testid="input-tasks-per-lesson"
                    />
                  </div>
                </div>
                {lessonsCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {lessonsCount} ta dars, har birida {tasksPerLesson} ta vazifa = jami {lessonsCount * tasksPerLesson} ta vazifa yaratiladi
                  </p>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Har bir darsni kengaytirib, vazifalarni tahrirlang</p>
                  {aiClasses.length > 0 && (
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => setImportOpen(true)} data-testid="button-wizard-import-tasks">
                      <Copy className="w-3.5 h-3.5 mr-1" /> Boshqa guruhdan import
                    </Button>
                  )}
                </div>
                <div className="space-y-1 max-h-[400px] overflow-y-auto">
                  {lessonNumbers.map(lessonNum => {
                    const lessonTasks = tasks.filter(t => t.lessonNumber === lessonNum);
                    const isExpanded = expandedLessons.has(lessonNum);
                    return (
                      <div key={lessonNum}>
                        <div
                          className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                          onClick={() => toggleLesson(lessonNum)}
                          data-testid={`toggle-lesson-${lessonNum}`}
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <span className="font-medium text-sm">{lessonNum}-dars</span>
                          <span className="text-xs text-muted-foreground">({lessonTasks.length} vazifa)</span>
                        </div>
                        {isExpanded && (
                          <div className="ml-6 space-y-2 mb-2">
                            {lessonTasks.map((task, localIdx) => {
                              const globalIdx = tasks.findIndex(t => t === task);
                              return (
                                <Card key={globalIdx} className="p-2 space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground w-4">{localIdx + 1}.</span>
                                    <Input
                                      value={task.title}
                                      onChange={e => { const t = [...tasks]; t[globalIdx].title = e.target.value; setTasks(t); }}
                                      placeholder="Vazifa nomi"
                                      className="flex-1 h-8 text-sm"
                                      data-testid={`input-task-title-${globalIdx}`}
                                    />
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTasks(tasks.filter((_, i) => i !== globalIdx))}>
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                  <Textarea
                                    value={task.referenceText}
                                    onChange={e => { const t = [...tasks]; t[globalIdx].referenceText = e.target.value; setTasks(t); }}
                                    placeholder="Mavzu matni (faqat AI uchun — o'quvchi ko'rmaydi)"
                                    rows={2}
                                    className="text-xs"
                                    data-testid={`input-task-ref-${globalIdx}`}
                                  />
                                  <Input
                                    value={task.prompt}
                                    onChange={e => { const t = [...tasks]; t[globalIdx].prompt = e.target.value; setTasks(t); }}
                                    placeholder="AI ga ko'rsatma"
                                    className="h-8 text-xs"
                                    data-testid={`input-task-prompt-${globalIdx}`}
                                  />
                                </Card>
                              );
                            })}
                            <Button variant="outline" size="sm" className="text-xs" onClick={() => {
                              const newTask: TaskDraft = { lessonNumber: lessonNum, title: "", prompt: "", referenceText: "", type: "audio" };
                              const insertIdx = tasks.findIndex(t => t.lessonNumber > lessonNum);
                              if (insertIdx === -1) setTasks([...tasks, newTask]);
                              else { const t = [...tasks]; t.splice(insertIdx, 0, newTask); setTasks(t); }
                            }}>
                              <Plus className="w-3 h-3 mr-1" /> Vazifa qo'shish
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <Button variant="outline" size="sm" onClick={() => {
                  const nextLesson = lessonNumbers.length > 0 ? Math.max(...lessonNumbers) + 1 : 1;
                  const defaultNames = ["Xat", "Grammatika", "Insho"];
                  const newTasks = defaultNames.slice(0, tasksPerLesson).map((name, i) => ({
                    lessonNumber: nextLesson,
                    title: name,
                    prompt: "",
                    referenceText: "",
                    type: "audio",
                  }));
                  setTasks([...tasks, ...newTasks]);
                  setLessonsCount(prev => prev + 1);
                  setExpandedLessons(prev => new Set([...prev, nextLesson]));
                }} data-testid="button-add-lesson">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Dars qo'shish
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">O'quvchilarni ism va telefon raqam bilan qo'shing. Bot telefon raqam orqali taniydi.</p>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {students.map((s, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <Input value={s.name} onChange={e => { const st = [...students]; st[idx].name = e.target.value; setStudents(st); }} placeholder="Ism" className="flex-1" data-testid={`input-student-name-${idx}`} />
                      <Input value={s.phone} onChange={e => { const st = [...students]; st[idx].phone = e.target.value; setStudents(st); }} placeholder="998901234567" className="w-[140px]" data-testid={`input-student-phone-${idx}`} />
                      {students.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setStudents(students.filter((_, i) => i !== idx))}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={() => setStudents([...students, { name: "", phone: "" }])} data-testid="button-add-student">
                  <Plus className="w-3.5 h-3.5 mr-1" /> O'quvchi qo'shish
                </Button>
              </div>
            )}

            <div className="flex justify-between pt-4">
              {step > 0 ? (
                <Button variant="outline" onClick={() => setStep(step - 1)}>Orqaga</Button>
              ) : <div />}
              {step < 2 ? (
                <Button onClick={() => setStep(step + 1)} disabled={step === 0 && !name}>Keyingi</Button>
              ) : (
                <Button onClick={handleCreate} disabled={createMutation.isPending || !name} className="gradient-purple border-0" data-testid="button-create-ai-class">
                  {createMutation.isPending ? "Yaratilmoqda..." : "Yaratish"}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-sm max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Boshqa guruhdan import</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">Guruh tanlang — uning barcha vazifalari yuklanadi (mavjud vazifalar o'rniga)</p>
          <div className="space-y-2">
            {aiClasses.map((cls: any) => (
              <button
                key={cls.id}
                disabled={importLoading}
                onClick={() => importTasksFromClass(cls.id, cls.name)}
                className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors flex items-center justify-between"
                data-testid={`button-import-from-${cls.id}`}
              >
                <div>
                  <p className="font-medium text-sm">{cls.name}</p>
                  <p className="text-xs text-muted-foreground">{cls.taskCount} ta vazifa</p>
                </div>
                {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      </motion.div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Card key={i} className="h-[140px] animate-pulse bg-muted" />)}
        </div>
      ) : aiClasses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {aiClasses.map((cls: any) => (
            <motion.div key={cls.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Link href={`/teacher/ai-classes/${cls.id}`}>
                <Card className="p-4 hover:shadow-md transition-all cursor-pointer" data-testid={`card-ai-class-${cls.id}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                        <BrainCircuit className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{cls.name}</h3>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${cls.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600"}`}>
                          {cls.status === "active" ? "Faol" : "To'xtatilgan"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {cls.studentCount} o'quvchi</span>
                    <span className="flex items-center gap-1"><ListChecks className="w-3.5 h-3.5" /> {cls.taskCount} vazifa</span>
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-center justify-center mx-auto mb-4">
            <BrainCircuit className="w-8 h-8 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="font-semibold text-lg mb-2">AI sinflar yo'q</h3>
          <p className="text-muted-foreground mb-4">Birinchi AI sinfingizni yarating — Telegram bot + AI orqali vazifalarni avtomatik tekshiring</p>
          <Button className="gradient-purple border-0" onClick={() => setCreateOpen(true)} data-testid="button-first-ai-class">
            <Plus className="w-4 h-4 mr-1" /> Yangi AI Sinf
          </Button>
        </Card>
      )}
    </div>
  );
}
