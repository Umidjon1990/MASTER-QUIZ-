import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BookCopy, BookOpen, CheckSquare2, Search, Trash2, UserRoundCheck, UsersRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Quiz, QuizFolder } from "@shared/schema";

type TeacherOption = {
  userId: string;
  displayName: string | null;
  role: string;
  isActive?: boolean;
  quizCount?: number;
};

type TeacherOptions = { sources: TeacherOption[]; targets: TeacherOption[] };
type SourceQuizzes = { source: TeacherOption; folders: QuizFolder[]; quizzes: Quiz[] };
type AssignmentAudit = {
  id: string;
  sourceTeacherId: string;
  targetTeacherId: string;
  sourceTitle: string;
  createdAt: string;
};

async function responseError(response: Response) {
  try { return (await response.json()).message || "Amal bajarilmadi"; } catch { return "Amal bajarilmadi"; }
}

function toggleSelection(current: Set<string>, id: string, selected: boolean) {
  const next = new Set(current);
  if (selected) next.add(id); else next.delete(id);
  return next;
}

function teacherName(teacher: TeacherOption | undefined) {
  return teacher?.displayName?.trim() || "O'qituvchi";
}

export default function AdminQuizzes() {
  const { toast } = useToast();
  const [assignOpen, setAssignOpen] = useState(false);
  const [sourceTeacherId, setSourceTeacherId] = useState("");
  const [sourceSearch, setSourceSearch] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [selectedQuizIds, setSelectedQuizIds] = useState<Set<string>>(new Set());
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set());

  const { data: quizzes, isLoading } = useQuery<Quiz[]>({ queryKey: ["/api/quizzes"] });
  const { data: people } = useQuery<TeacherOptions>({
    queryKey: ["/api/admin/quiz-assignments/teachers"],
    enabled: assignOpen,
  });
  const { data: sourceData, isLoading: sourceLoading } = useQuery<SourceQuizzes>({
    queryKey: ["/api/admin/quiz-assignments/source", sourceTeacherId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/quiz-assignments/source/${sourceTeacherId}`, { credentials: "include" });
      if (!response.ok) throw new Error(await responseError(response));
      return response.json();
    },
    enabled: assignOpen && !!sourceTeacherId,
  });
  const { data: audit = [] } = useQuery<AssignmentAudit[]>({
    queryKey: ["/api/admin/quiz-assignments/audit"],
    enabled: assignOpen,
  });

  const foldersById = useMemo(() => new Map((sourceData?.folders || []).map(folder => [folder.id, folder])), [sourceData]);
  const shownQuizzes = useMemo(() => (sourceData?.quizzes || []).filter(quiz =>
    `${quiz.title} ${quiz.description || ""} ${quiz.category || ""}`.toLowerCase().includes(sourceSearch.trim().toLowerCase()),
  ), [sourceData, sourceSearch]);
  const shownTargets = useMemo(() => (people?.targets || []).filter(teacher =>
    teacher.userId !== sourceTeacherId && teacherName(teacher).toLowerCase().includes(targetSearch.trim().toLowerCase()),
  ), [people, sourceTeacherId, targetSearch]);
  const peopleById = useMemo(() => new Map([...(people?.sources || []), ...(people?.targets || [])].map(person => [person.userId, person])), [people]);

  const deleteQuiz = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/quizzes/${id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error(await responseError(response));
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      toast({ title: "Quiz o'chirildi" });
    },
    onError: (error: Error) => toast({ title: "O'chirishda xatolik", description: error.message, variant: "destructive" }),
  });

  const assignQuizzes = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/quiz-assignments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceTeacherId,
          sourceQuizIds: [...selectedQuizIds],
          targetTeacherIds: [...selectedTargetIds],
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      return response.json() as Promise<{ created: number; skipped: number }>;
    },
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quiz-assignments/audit"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quiz-assignments/teachers"] });
      setAssignOpen(false);
      toast({
        title: result.created > 0 ? `${result.created} ta test muvaffaqiyatli biriktirildi` : "Bu testlar avval biriktirilgan",
        description: result.skipped > 0 ? `${result.skipped} ta mavjud nusxa qayta yaratilmadi.` : "Testlar yangi o'qituvchilarda tayyor holatda ko'rinadi.",
      });
    },
    onError: (error: Error) => toast({ title: "Biriktirib bo'lmadi", description: error.message, variant: "destructive" }),
  });

  const selectAllShownQuizzes = () => {
    const allSelected = shownQuizzes.length > 0 && shownQuizzes.every(quiz => selectedQuizIds.has(quiz.id));
    const next = new Set(selectedQuizIds);
    for (const quiz of shownQuizzes) allSelected ? next.delete(quiz.id) : next.add(quiz.id);
    setSelectedQuizIds(next);
  };

  const selectAllShownTargets = () => {
    const allSelected = shownTargets.length > 0 && shownTargets.every(teacher => selectedTargetIds.has(teacher.userId));
    const next = new Set(selectedTargetIds);
    for (const teacher of shownTargets) allSelected ? next.delete(teacher.userId) : next.add(teacher.userId);
    setSelectedTargetIds(next);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-admin-quizzes-title">Barcha Quizlar</h1>
          <p className="text-muted-foreground">Platformadagi quizlarni boshqarish va o'qituvchilarga tayyor test biriktirish</p>
        </div>
        <Button onClick={() => setAssignOpen(true)} data-testid="button-open-quiz-assignment">
          <BookCopy className="w-4 h-4 mr-2" /> Testlarni biriktirish
        </Button>
      </motion.div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : quizzes && quizzes.length > 0 ? (
        <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }} className="space-y-3">
          {quizzes.map(quiz => (
            <motion.div key={quiz.id} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
              <Card className="p-4" data-testid={`card-admin-quiz-${quiz.id}`}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md gradient-purple flex items-center justify-center"><BookOpen className="w-5 h-5 text-white" /></div>
                    <div><h3 className="font-semibold">{quiz.title}</h3><p className="text-sm text-muted-foreground">{quiz.totalQuestions} savol · {quiz.totalPlays} o'ynalgan</p></div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={quiz.isPublic ? "default" : "secondary"}>{quiz.isPublic ? "Ommaviy" : "Xususiy"}</Badge>
                    <Badge variant={quiz.status === "published" ? "default" : "secondary"}>{quiz.status === "published" ? "Nashr" : "Qoralama"}</Badge>
                    <Button variant="ghost" size="icon" onClick={() => deleteQuiz.mutate(quiz.id)} disabled={deleteQuiz.isPending} data-testid={`button-admin-delete-${quiz.id}`}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <Card className="p-12 text-center"><BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" /><p className="text-muted-foreground">Hozircha quizlar yo'q</p></Card>
      )}

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-6xl max-h-[94vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BookCopy className="w-5 h-5 text-purple-600" /> Tayyor testlarni o'qituvchiga biriktirish</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            Tanlangan testlar savollari va barcha sozlamalari bilan mustaqil nusxalanadi. Rejalashtirilgan efir kodlari ko'chirilmaydi; qabul qiluvchi testni tahrirlashi, nashr qilishi, jonli o'tkazishi va qayta rejalashtirishi mumkin.
          </div>

          <div className="space-y-2">
            <Label>1. Test egasini tanlang</Label>
            <Select value={sourceTeacherId} onValueChange={value => {
              setSourceTeacherId(value);
              setSelectedQuizIds(new Set());
              setSelectedTargetIds(current => { const next = new Set(current); next.delete(value); return next; });
            }}>
              <SelectTrigger data-testid="select-source-teacher"><SelectValue placeholder="Testlari olinadigan o'qituvchi" /></SelectTrigger>
              <SelectContent>{(people?.sources || []).map(teacher => (
                <SelectItem key={teacher.userId} value={teacher.userId}>{teacherName(teacher)} · {teacher.quizCount} ta test{teacher.role === "admin" ? " · Admin" : ""}</SelectItem>
              ))}</SelectContent>
            </Select>
          </div>

          {sourceTeacherId && (
            <div className="grid lg:grid-cols-2 gap-5">
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div><h3 className="font-semibold flex items-center gap-2"><CheckSquare2 className="w-4 h-4" /> 2. Testlarni tanlang</h3><p className="text-xs text-muted-foreground">{selectedQuizIds.size} ta tanlandi</p></div>
                  <Button variant="outline" size="sm" onClick={selectAllShownQuizzes} disabled={shownQuizzes.length === 0}>Barchasini tanlash</Button>
                </div>
                <div className="relative"><Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" /><Input value={sourceSearch} onChange={event => setSourceSearch(event.target.value)} placeholder="Test qidirish" className="pl-9" /></div>
                <div className="max-h-[42vh] overflow-y-auto space-y-2 pr-1">
                  {sourceLoading ? [1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />) : shownQuizzes.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Test topilmadi</p> : shownQuizzes.map(quiz => (
                    <label key={quiz.id} className={`flex gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${selectedQuizIds.has(quiz.id) ? "border-purple-500 bg-purple-50/50 dark:bg-purple-950/20" : "hover:bg-muted/40"}`}>
                      <Checkbox checked={selectedQuizIds.has(quiz.id)} onCheckedChange={checked => setSelectedQuizIds(current => toggleSelection(current, quiz.id, checked === true))} data-testid={`checkbox-source-quiz-${quiz.id}`} />
                      <span className="min-w-0"><span className="block font-medium truncate">{quiz.title}</span><span className="block text-xs text-muted-foreground truncate">{foldersById.get(quiz.folderId || "")?.name || "Papkasiz"} · {quiz.totalQuestions} savol · {quiz.status === "published" ? "Nashr" : "Qoralama"}</span></span>
                    </label>
                  ))}
                </div>
              </Card>

              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div><h3 className="font-semibold flex items-center gap-2"><UsersRound className="w-4 h-4" /> 3. Qabul qiluvchilar</h3><p className="text-xs text-muted-foreground">{selectedTargetIds.size} ta o'qituvchi tanlandi</p></div>
                  <Button variant="outline" size="sm" onClick={selectAllShownTargets} disabled={shownTargets.length === 0}>Barchasini tanlash</Button>
                </div>
                <div className="relative"><Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" /><Input value={targetSearch} onChange={event => setTargetSearch(event.target.value)} placeholder="O'qituvchi qidirish" className="pl-9" /></div>
                <div className="max-h-[42vh] overflow-y-auto space-y-2 pr-1">
                  {shownTargets.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Faol o'qituvchi topilmadi</p> : shownTargets.map(teacher => (
                    <label key={teacher.userId} className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${selectedTargetIds.has(teacher.userId) ? "border-purple-500 bg-purple-50/50 dark:bg-purple-950/20" : "hover:bg-muted/40"}`}>
                      <Checkbox checked={selectedTargetIds.has(teacher.userId)} onCheckedChange={checked => setSelectedTargetIds(current => toggleSelection(current, teacher.userId, checked === true))} data-testid={`checkbox-target-teacher-${teacher.userId}`} />
                      <span className="flex-1 font-medium truncate">{teacherName(teacher)}</span><UserRoundCheck className="w-4 h-4 text-muted-foreground" />
                    </label>
                  ))}
                </div>
              </Card>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">{selectedQuizIds.size > 0 && selectedTargetIds.size > 0 ? <><strong className="text-foreground">{selectedQuizIds.size * selectedTargetIds.size}</strong> ta mustaqil nusxa yaratiladi.</> : <>Davom etish uchun test va o'qituvchini tanlang.</>}</p>
            <div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setAssignOpen(false)}>Bekor qilish</Button><Button onClick={() => assignQuizzes.mutate()} disabled={!sourceTeacherId || selectedQuizIds.size === 0 || selectedTargetIds.size === 0 || selectedQuizIds.size * selectedTargetIds.size > 250 || assignQuizzes.isPending} data-testid="button-assign-quizzes">{assignQuizzes.isPending ? "Biriktirilmoqda..." : "Testlarni biriktirish"}</Button></div>
          </div>

          {audit.length > 0 && <div className="border-t pt-4"><p className="text-xs font-medium text-muted-foreground mb-2">SO'NGGI BIRIKTIRISHLAR</p><div className="grid md:grid-cols-2 gap-2">{audit.slice(0, 4).map(row => <div key={row.id} className="rounded-md bg-muted/40 px-3 py-2 text-xs"><p className="font-medium truncate">{row.sourceTitle}</p><p className="text-muted-foreground truncate">{teacherName(peopleById.get(row.sourceTeacherId))} → {teacherName(peopleById.get(row.targetTeacherId))} · {new Date(row.createdAt).toLocaleDateString("uz-UZ")}</p></div>)}</div></div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
