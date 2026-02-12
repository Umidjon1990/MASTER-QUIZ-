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
import { queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Library, Copy, Search, Tag } from "lucide-react";
import type { Quiz, QuestionBankItem } from "@shared/schema";

const typeLabels: Record<string, string> = {
  multiple_choice: "Test",
  true_false: "To'g'ri/Noto'g'ri",
  open_ended: "Ochiq javob",
  poll: "So'rovnoma",
  multiple_select: "Ko'p tanlash",
};

export default function TeacherQuestionBank() {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [copyFromQuizOpen, setCopyFromQuizOpen] = useState(false);
  const [copyToQuizOpen, setCopyToQuizOpen] = useState(false);
  const [selectedQuizId, setSelectedQuizId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterCategory, setFilterCategory] = useState("");
  const [searchText, setSearchText] = useState("");

  const [newQ, setNewQ] = useState({
    questionText: "",
    options: ["", "", "", ""],
    correctIndex: -1,
    points: 100,
    timeLimit: 30,
    type: "multiple_choice" as string,
    openAnswer: "",
    category: "",
    tags: "",
  });

  const { data: bankQuestions, isLoading } = useQuery<QuestionBankItem[]>({
    queryKey: ["/api/question-bank"],
  });

  const { data: quizzes } = useQuery<Quiz[]>({
    queryKey: ["/api/quizzes"],
  });

  const addQuestion = useMutation({
    mutationFn: async () => {
      let correctAnswer = "";
      let options: string[] | null = null;

      if (newQ.type === "multiple_choice") {
        const filled = newQ.options.filter((o) => o.trim());
        if (filled.length < 2) throw new Error("Kamida 2 variant");
        if (newQ.correctIndex < 0 || !newQ.options[newQ.correctIndex]?.trim()) throw new Error("To'g'ri javobni tanlang");
        options = filled;
        correctAnswer = newQ.options[newQ.correctIndex].trim();
      } else if (newQ.type === "true_false") {
        if (newQ.correctIndex < 0) throw new Error("To'g'ri/Noto'g'ri tanlang");
        correctAnswer = newQ.correctIndex === 0 ? "true" : "false";
        options = ["To'g'ri", "Noto'g'ri"];
      } else if (newQ.type === "open_ended") {
        if (!newQ.openAnswer.trim()) throw new Error("Javobni kiriting");
        correctAnswer = newQ.openAnswer.trim();
      }

      const res = await fetch("/api/question-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newQ.type,
          questionText: newQ.questionText,
          options,
          correctAnswer,
          points: newQ.points,
          timeLimit: newQ.timeLimit,
          category: newQ.category || null,
          tags: newQ.tags || null,
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/question-bank"] });
      toast({ title: "Savol qo'shildi!" });
      setAddOpen(false);
      setNewQ({ questionText: "", options: ["", "", "", ""], correctIndex: -1, points: 100, timeLimit: 30, type: "multiple_choice", openAnswer: "", category: "", tags: "" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Savol qo'shishda xatolik", variant: "destructive" });
    },
  });

  const deleteQuestion = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/question-bank/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/question-bank"] });
      toast({ title: "Savol o'chirildi" });
    },
  });

  const copyFromQuiz = useMutation({
    mutationFn: async (quizId: string) => {
      const res = await fetch(`/api/question-bank/from-quiz/${quizId}`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/question-bank"] });
      toast({ title: `${data.copied || 0} ta savol nusxalandi!` });
      setCopyFromQuizOpen(false);
      setSelectedQuizId("");
    },
    onError: () => {
      toast({ title: "Nusxalashda xatolik", variant: "destructive" });
    },
  });

  const copyToQuiz = useMutation({
    mutationFn: async (quizId: string) => {
      const res = await fetch(`/api/question-bank/to-quiz/${quizId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIds: selectedIds }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      toast({ title: `${data.copied || 0} ta savol quizga nusxalandi!` });
      setCopyToQuizOpen(false);
      setSelectedIds([]);
      setSelectedQuizId("");
    },
    onError: () => {
      toast({ title: "Nusxalashda xatolik", variant: "destructive" });
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const categories = Array.from(new Set(bankQuestions?.map((q) => q.category).filter(Boolean) || []));

  const filtered = bankQuestions?.filter((q) => {
    if (filterCategory && filterCategory !== "all" && q.category !== filterCategory) return false;
    if (searchText && !q.questionText.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-question-bank-title">Savol Banki</h1>
          <p className="text-muted-foreground">Barcha savollarni saqlang va boshqaring</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={copyFromQuizOpen} onOpenChange={setCopyFromQuizOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-copy-from-quiz">
                <Copy className="w-4 h-4 mr-1" /> Quizdan nusxalash
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Quizdan savollarni bankka nusxalash</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Quiz tanlang</Label>
                  <Select value={selectedQuizId} onValueChange={setSelectedQuizId}>
                    <SelectTrigger data-testid="select-quiz-from">
                      <SelectValue placeholder="Quiz tanlang" />
                    </SelectTrigger>
                    <SelectContent>
                      {quizzes?.map((q) => (
                        <SelectItem key={q.id} value={q.id}>{q.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="gradient-purple border-0 w-full"
                  onClick={() => selectedQuizId && copyFromQuiz.mutate(selectedQuizId)}
                  disabled={!selectedQuizId || copyFromQuiz.isPending}
                  data-testid="button-confirm-copy-from"
                >
                  Nusxalash
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {selectedIds.length > 0 && (
            <Dialog open={copyToQuizOpen} onOpenChange={setCopyToQuizOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-teal border-0" data-testid="button-copy-to-quiz">
                  <Copy className="w-4 h-4 mr-1" /> Quizga nusxalash ({selectedIds.length})
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Tanlangan savollarni quizga nusxalash</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Quiz tanlang</Label>
                    <Select value={selectedQuizId} onValueChange={setSelectedQuizId}>
                      <SelectTrigger data-testid="select-quiz-to">
                        <SelectValue placeholder="Quiz tanlang" />
                      </SelectTrigger>
                      <SelectContent>
                        {quizzes?.map((q) => (
                          <SelectItem key={q.id} value={q.id}>{q.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="gradient-teal border-0 w-full"
                    onClick={() => selectedQuizId && copyToQuiz.mutate(selectedQuizId)}
                    disabled={!selectedQuizId || copyToQuiz.isPending}
                    data-testid="button-confirm-copy-to"
                  >
                    Nusxalash
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-purple border-0" data-testid="button-add-question">
                <Plus className="w-4 h-4 mr-1" /> Yangi Savol
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>Yangi savol qo'shish</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Savol turi</Label>
                  <Select value={newQ.type} onValueChange={(v) => setNewQ((p) => ({ ...p, type: v, correctIndex: -1, openAnswer: "" }))}>
                    <SelectTrigger data-testid="select-question-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="multiple_choice">Test</SelectItem>
                      <SelectItem value="true_false">To'g'ri/Noto'g'ri</SelectItem>
                      <SelectItem value="open_ended">Ochiq javob</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Savol matni</Label>
                  <Textarea value={newQ.questionText} onChange={(e) => setNewQ((p) => ({ ...p, questionText: e.target.value }))} placeholder="Savol matnini kiriting..." data-testid="input-question-text" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Kategoriya</Label>
                    <Input value={newQ.category} onChange={(e) => setNewQ((p) => ({ ...p, category: e.target.value }))} placeholder="Kategoriya" data-testid="input-question-category" />
                  </div>
                  <div>
                    <Label>Teglar</Label>
                    <Input value={newQ.tags} onChange={(e) => setNewQ((p) => ({ ...p, tags: e.target.value }))} placeholder="teg1, teg2" data-testid="input-question-tags" />
                  </div>
                </div>
                {newQ.type === "multiple_choice" && (
                  <div className="space-y-2">
                    <Label>Variantlar</Label>
                    {newQ.options.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Button
                          variant={newQ.correctIndex === idx ? "default" : "outline"}
                          size="icon"
                          className={newQ.correctIndex === idx ? "gradient-teal border-0" : ""}
                          onClick={() => setNewQ((p) => ({ ...p, correctIndex: idx }))}
                          data-testid={`button-correct-${idx}`}
                        >
                          {String.fromCharCode(65 + idx)}
                        </Button>
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const opts = [...newQ.options];
                            opts[idx] = e.target.value;
                            setNewQ((p) => ({ ...p, options: opts }));
                          }}
                          placeholder={`Variant ${String.fromCharCode(65 + idx)}`}
                          data-testid={`input-option-${idx}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {newQ.type === "true_false" && (
                  <div className="flex gap-2">
                    <Button
                      variant={newQ.correctIndex === 0 ? "default" : "outline"}
                      className={newQ.correctIndex === 0 ? "gradient-teal border-0 flex-1" : "flex-1"}
                      onClick={() => setNewQ((p) => ({ ...p, correctIndex: 0 }))}
                      data-testid="button-true"
                    >
                      To'g'ri
                    </Button>
                    <Button
                      variant={newQ.correctIndex === 1 ? "default" : "outline"}
                      className={newQ.correctIndex === 1 ? "gradient-teal border-0 flex-1" : "flex-1"}
                      onClick={() => setNewQ((p) => ({ ...p, correctIndex: 1 }))}
                      data-testid="button-false"
                    >
                      Noto'g'ri
                    </Button>
                  </div>
                )}
                {newQ.type === "open_ended" && (
                  <div>
                    <Label>To'g'ri javob</Label>
                    <Input value={newQ.openAnswer} onChange={(e) => setNewQ((p) => ({ ...p, openAnswer: e.target.value }))} placeholder="To'g'ri javobni kiriting" data-testid="input-open-answer" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Ball</Label>
                    <Input type="number" value={newQ.points} onChange={(e) => setNewQ((p) => ({ ...p, points: Number(e.target.value) }))} data-testid="input-points" />
                  </div>
                  <div>
                    <Label>Vaqt (soniya)</Label>
                    <Input type="number" value={newQ.timeLimit} onChange={(e) => setNewQ((p) => ({ ...p, timeLimit: Number(e.target.value) }))} data-testid="input-time-limit" />
                  </div>
                </div>
                <Button
                  className="gradient-purple border-0 w-full"
                  onClick={() => addQuestion.mutate()}
                  disabled={!newQ.questionText.trim() || addQuestion.isPending}
                  data-testid="button-save-question"
                >
                  Saqlash
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Savollarni qidirish..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            data-testid="input-search-bank"
          />
        </div>
        {categories.length > 0 && (
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-48" data-testid="select-filter-category">
              <SelectValue placeholder="Barcha kategoriyalar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barchasi</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat!}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filtered && filtered.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.03 } } }}
          className="space-y-3"
        >
          {filtered.map((q) => (
            <motion.div key={q.id} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
              <Card className="p-4 hover-elevate" data-testid={`card-bank-question-${q.id}`}>
                <div className="flex items-start gap-3">
                  <div className="pt-1">
                    <Checkbox
                      checked={selectedIds.includes(q.id)}
                      onCheckedChange={() => toggleSelect(q.id)}
                      data-testid={`checkbox-question-${q.id}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="secondary" data-testid={`badge-type-${q.id}`}>{typeLabels[q.type] || q.type}</Badge>
                      {q.category && (
                        <Badge variant="outline" data-testid={`badge-category-${q.id}`}>
                          <Tag className="w-3 h-3 mr-1" />{q.category}
                        </Badge>
                      )}
                      {q.tags && q.tags.split(",").map((tag, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{tag.trim()}</Badge>
                      ))}
                    </div>
                    <p className="font-medium text-sm" data-testid={`text-question-${q.id}`}>{q.questionText}</p>
                    {q.options && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {(q.options as string[]).join(" | ")}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Javob: {q.correctAnswer} | {q.points} ball
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteQuestion.mutate(q.id)}
                    data-testid={`button-delete-bank-${q.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Library className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Savol banki bo'sh</h3>
          <p className="text-muted-foreground mb-4">Savollar qo'shing yoki quizdan nusxalang!</p>
          <Button className="gradient-purple border-0" onClick={() => setAddOpen(true)} data-testid="button-first-bank-question">
            <Plus className="w-4 h-4 mr-1" /> Yangi Savol
          </Button>
        </Card>
      )}
    </div>
  );
}
