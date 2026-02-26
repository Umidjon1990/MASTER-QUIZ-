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
import { Plus, BrainCircuit, Users, ListChecks, Trash2, X } from "lucide-react";
import { motion } from "framer-motion";

interface TaskDraft {
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
  const [tasks, setTasks] = useState<TaskDraft[]>([]);
  const [students, setStudents] = useState<StudentDraft[]>([{ name: "", phone: "" }]);

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

  function resetForm() {
    setCreateOpen(false);
    setStep(0);
    setName("");
    setBotToken("");
    setInstructions("");
    setLessonsCount(0);
    setTasks([]);
    setStudents([{ name: "", phone: "" }]);
  }

  function generateLessons(count: number) {
    const newTasks: TaskDraft[] = [];
    for (let i = 1; i <= count; i++) {
      newTasks.push({
        title: `${i}-dars`,
        prompt: "",
        referenceText: "",
        type: "audio",
      });
    }
    setTasks(newTasks);
    setLessonsCount(count);
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

  const stepTitles = ["Asosiy ma'lumotlar", "Darslar", "O'quvchilar"];

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
                <div>
                  <Label>Darslar soni</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={lessonsCount || ""}
                      onChange={e => {
                        const val = parseInt(e.target.value) || 0;
                        if (val >= 0 && val <= 100) {
                          generateLessons(val);
                        }
                      }}
                      placeholder="Masalan: 12"
                      className="w-[120px]"
                      data-testid="input-lessons-count"
                    />
                    <span className="text-xs text-muted-foreground">ta dars avtomatik yaratiladi</span>
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Har bir darsni tahrirlang — nomi, mavzu matni va AI ko'rsatmasini kiriting</p>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {tasks.map((task, idx) => (
                    <Card key={idx} className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground w-5">{idx + 1}.</span>
                        <Input value={task.title} onChange={e => { const t = [...tasks]; t[idx].title = e.target.value; setTasks(t); }} placeholder="Dars nomi" className="flex-1" data-testid={`input-task-title-${idx}`} />
                        {tasks.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setTasks(tasks.filter((_, i) => i !== idx)); setLessonsCount(prev => prev - 1); }}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                      <Textarea value={task.referenceText} onChange={e => { const t = [...tasks]; t[idx].referenceText = e.target.value; setTasks(t); }} placeholder="Mavzu matni (o'quvchi tarjima qilishi kerak bo'lgan matn)" rows={2} data-testid={`input-task-ref-${idx}`} />
                      <Input value={task.prompt} onChange={e => { const t = [...tasks]; t[idx].prompt = e.target.value; setTasks(t); }} placeholder="AI ga ko'rsatma (masalan: tarjimani tekshir)" data-testid={`input-task-prompt-${idx}`} />
                    </Card>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={() => {
                  setTasks([...tasks, { title: `${tasks.length + 1}-dars`, prompt: "", referenceText: "", type: "audio" }]);
                  setLessonsCount(prev => prev + 1);
                }} data-testid="button-add-task">
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
                    <span className="flex items-center gap-1"><ListChecks className="w-3.5 h-3.5" /> {cls.taskCount} dars</span>
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
