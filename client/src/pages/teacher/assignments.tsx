import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Download, ClipboardList, Calendar, Users, Eye } from "lucide-react";
import type { Quiz, Assignment, Class, AssignmentAttempt } from "@shared/schema";

export default function TeacherAssignments() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [attemptsOpen, setAttemptsOpen] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [quizId, setQuizId] = useState("");
  const [classId, setClassId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [attemptsLimit, setAttemptsLimit] = useState(1);

  const { data: assignments, isLoading } = useQuery<(Assignment & { quizTitle?: string; className?: string })[]>({
    queryKey: ["/api/assignments"],
  });

  const { data: quizzes } = useQuery<Quiz[]>({
    queryKey: ["/api/quizzes"],
  });

  const { data: classes } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  const { data: attempts, isLoading: attemptsLoading } = useQuery<(AssignmentAttempt & { userName?: string })[]>({
    queryKey: ["/api/assignments", selectedAssignmentId, "attempts"],
    queryFn: async () => {
      const res = await fetch(`/api/assignments/${selectedAssignmentId}/attempts`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedAssignmentId && attemptsOpen,
  });

  const createAssignment = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId,
          title,
          deadline: deadline ? new Date(deadline).toISOString() : null,
          attemptsLimit,
          classId: classId && classId !== "none" ? classId : null,
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Vazifa yaratildi!" });
      setCreateOpen(false);
      setTitle("");
      setQuizId("");
      setClassId("");
      setDeadline("");
      setAttemptsLimit(1);
    },
    onError: () => {
      toast({ title: "Vazifa yaratishda xatolik", variant: "destructive" });
    },
  });

  const deleteAssignment = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/assignments/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Vazifa o'chirildi" });
    },
  });

  const handleExportCsv = (id: string) => {
    window.open(`/api/assignments/${id}/export-csv`, "_blank");
  };

  const handleViewAttempts = (id: string) => {
    setSelectedAssignmentId(id);
    setAttemptsOpen(true);
  };

  const formatDeadline = (d: string | Date | null) => {
    if (!d) return "Muddatsiz";
    const date = new Date(d);
    return date.toLocaleDateString("uz-UZ", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const isExpired = (d: string | Date | null) => {
    if (!d) return false;
    return new Date(d) < new Date();
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-assignments-title">Vazifalar</h1>
          <p className="text-muted-foreground">Uy vazifalarni boshqarish</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-purple border-0" data-testid="button-new-assignment">
              <Plus className="w-4 h-4 mr-1" /> Yangi Vazifa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yangi Vazifa Yaratish</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Vazifa nomi</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Masalan: 1-uy vazifa" data-testid="input-assignment-title" />
              </div>
              <div>
                <Label>Quiz tanlang</Label>
                <Select value={quizId} onValueChange={setQuizId}>
                  <SelectTrigger data-testid="select-quiz">
                    <SelectValue placeholder="Quiz tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    {quizzes?.map((q) => (
                      <SelectItem key={q.id} value={q.id}>{q.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sinf (ixtiyoriy)</Label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger data-testid="select-class">
                    <SelectValue placeholder="Barcha o'quvchilar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Barcha o'quvchilar</SelectItem>
                    {classes?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Muddat (ixtiyoriy)</Label>
                <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} data-testid="input-deadline" />
              </div>
              <div>
                <Label>Urinishlar soni</Label>
                <Input type="number" min={1} value={attemptsLimit} onChange={(e) => setAttemptsLimit(Number(e.target.value))} data-testid="input-attempts-limit" />
              </div>
              <Button
                className="gradient-purple border-0 w-full"
                onClick={() => createAssignment.mutate()}
                disabled={!title.trim() || !quizId || createAssignment.isPending}
                data-testid="button-create-assignment"
              >
                Yaratish
              </Button>
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
      ) : assignments && assignments.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {assignments.map((a) => (
            <motion.div key={a.id} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
              <Card className="p-5 hover-elevate" data-testid={`card-assignment-${a.id}`}>
                <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                  <h3 className="font-semibold" data-testid={`text-assignment-title-${a.id}`}>{a.title}</h3>
                  <div className="flex gap-1 flex-wrap">
                    {isExpired(a.deadline) ? (
                      <Badge variant="destructive">Muddat tugagan</Badge>
                    ) : (
                      <Badge variant={a.status === "active" ? "default" : "secondary"}>
                        {a.status === "active" ? "Faol" : a.status}
                      </Badge>
                    )}
                  </div>
                </div>
                {a.quizTitle && (
                  <p className="text-sm text-muted-foreground mb-1" data-testid={`text-quiz-name-${a.id}`}>
                    <ClipboardList className="w-3 h-3 inline mr-1" />{a.quizTitle}
                  </p>
                )}
                <p className="text-sm text-muted-foreground mb-1" data-testid={`text-deadline-${a.id}`}>
                  <Calendar className="w-3 h-3 inline mr-1" />{formatDeadline(a.deadline)}
                </p>
                {a.className && (
                  <p className="text-sm text-muted-foreground mb-1" data-testid={`text-class-${a.id}`}>
                    <Users className="w-3 h-3 inline mr-1" />{a.className}
                  </p>
                )}
                <p className="text-sm text-muted-foreground mb-3">
                  Urinishlar: {a.attemptsLimit}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => handleViewAttempts(a.id)} data-testid={`button-view-attempts-${a.id}`}>
                    <Eye className="w-3 h-3 mr-1" /> Natijalar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleExportCsv(a.id)} data-testid={`button-export-csv-${a.id}`}>
                    <Download className="w-3 h-3 mr-1" /> CSV
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteAssignment.mutate(a.id)} data-testid={`button-delete-assignment-${a.id}`}>
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
            <ClipboardList className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Vazifalar yo'q</h3>
          <p className="text-muted-foreground mb-4">Birinchi vazifangizni yarating!</p>
          <Button className="gradient-purple border-0" onClick={() => setCreateOpen(true)} data-testid="button-first-assignment">
            <Plus className="w-4 h-4 mr-1" /> Yangi Vazifa
          </Button>
        </Card>
      )}

      <Dialog open={attemptsOpen} onOpenChange={(open) => { setAttemptsOpen(open); if (!open) setSelectedAssignmentId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Natijalar</DialogTitle>
          </DialogHeader>
          {attemptsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : attempts && attempts.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-auto">
              {attempts.map((at) => (
                <Card key={at.id} className="p-3" data-testid={`card-attempt-${at.id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-medium text-sm" data-testid={`text-attempt-user-${at.id}`}>{at.userName || "Foydalanuvchi"}</p>
                      <p className="text-xs text-muted-foreground">
                        {at.correctAnswers}/{at.totalQuestions} to'g'ri | {at.score} ball
                      </p>
                    </div>
                    <Badge variant="secondary" data-testid={`badge-attempt-score-${at.id}`}>{at.score} ball</Badge>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-6">Hali natijalar yo'q</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
