import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Trophy, Send, Users, Megaphone, Loader2, Bot, ChevronDown, ChevronUp, BookOpen, FolderOpen, FileDown, Trash2 } from "lucide-react";

import { queryClient } from "@/lib/queryClient";
import type { Quiz, UserProfile, TelegramChat, QuizResult, QuizFolder } from "@shared/schema";

export default function TeacherResults() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [telegramQuiz, setTelegramQuiz] = useState<Quiz | null>(null);
  const [expandedQuiz, setExpandedQuiz] = useState<string | null>(null);
  const { data: quizzes, isLoading } = useQuery<Quiz[]>({ queryKey: ["/api/quizzes"] });
  const { data: profile } = useQuery<UserProfile>({ queryKey: ["/api/profile"] });
  const { data: folders } = useQuery<QuizFolder[]>({ queryKey: ["/api/quiz-folders"] });

  const telegramChats = ((profile?.telegramChats as TelegramChat[]) || []);
  const hasTelegramBot = !!(profile as any)?.hasTelegramBot;

  const sendResultsMutation = useMutation({
    mutationFn: async (data: { quizId: string; chatId: string }) => {
      const res = await apiRequest("POST", "/api/telegram/send-results", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Yuborildi!", description: "Natijalar Telegramga muvaffaqiyatli yuborildi" });
      setTelegramQuiz(null);
    },
    onError: (error: any) => {
      toast({ title: "Xatolik", description: error.message || "Yuborishda xatolik", variant: "destructive" });
    },
  });

  const quizzesWithPlays = quizzes?.filter(q => (q.totalPlays || 0) > 0) || [];

  const folderQuizzesMap: Record<string, Quiz[]> = {};
  const unfiledQuizzes: Quiz[] = [];

  quizzesWithPlays.forEach(quiz => {
    if (quiz.folderId) {
      if (!folderQuizzesMap[quiz.folderId]) folderQuizzesMap[quiz.folderId] = [];
      folderQuizzesMap[quiz.folderId].push(quiz);
    } else {
      unfiledQuizzes.push(quiz);
    }
  });

  const foldersWithResults = (folders || []).filter(f => (folderQuizzesMap[f.id]?.length || 0) > 0);

  const deleteAllMutation = useMutation({
    mutationFn: async (quizId: string) => {
      await apiRequest("DELETE", `/api/quiz-results/all/${quizId}`);
    },
    onSuccess: (_, quizId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quiz-results", quizId] });
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      toast({ title: "O'chirildi", description: "Barcha natijalar o'chirildi" });
    },
    onError: () => {
      toast({ title: "Xatolik", description: "O'chirishda xatolik", variant: "destructive" });
    },
  });

  const renderQuizCard = (quiz: Quiz) => (
    <div key={quiz.id} className="p-4 hover:bg-muted/30 transition-colors" data-testid={`card-result-${quiz.id}`}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-md gradient-purple flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{quiz.title}</h3>
            <p className="text-sm text-muted-foreground">{quiz.totalQuestions} savol | {quiz.totalPlays} marta o'ynalgan</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.open(`/api/sessions/${quiz.id}/quiz-results/export-pdf`, "_blank");
            }}
            data-testid={`button-export-pdf-${quiz.id}`}
          >
            <FileDown className="w-4 h-4 mr-1" /> PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.open(`/api/sessions/${quiz.id}/quiz-results/export`, "_blank");
            }}
            data-testid={`button-export-results-${quiz.id}`}
          >
            <FileDown className="w-4 h-4 mr-1" /> Word
          </Button>
          {hasTelegramBot && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTelegramQuiz(quiz)}
              data-testid={`button-send-results-tg-${quiz.id}`}
            >
              <Send className="w-4 h-4 mr-1" /> Telegramga
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpandedQuiz(expandedQuiz === quiz.id ? null : quiz.id)}
            data-testid={`button-expand-results-${quiz.id}`}
          >
            {expandedQuiz === quiz.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {expandedQuiz === quiz.id && (
        <QuizResultsDetail quizId={quiz.id} onDeleteAll={() => {
          if (confirm(`"${quiz.title}" quizning barcha natijalarini o'chirmoqchimisiz?`)) {
            deleteAllMutation.mutate(quiz.id);
          }
        }} />
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold" data-testid="text-results-title">Natijalar</h1>
        <p className="text-muted-foreground">Quizlar bo'yicha statistikalar</p>
      </motion.div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : quizzesWithPlays.length > 0 ? (
        <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }} className="space-y-4">
          {foldersWithResults.map((folder) => {
            const folderQuizzes = folderQuizzesMap[folder.id] || [];
            const totalPlays = folderQuizzes.reduce((sum, q) => sum + (q.totalPlays || 0), 0);

            return (
              <motion.div key={folder.id} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
                <div className="flex items-center gap-2 mb-2">
                  <FolderOpen className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold text-base">{folder.name}</h2>
                  <Badge variant="secondary" className="text-xs">{totalPlays} o'yin</Badge>
                  <Badge variant="outline" className="text-xs">{folderQuizzes.length} quiz</Badge>
                </div>
                <div className="space-y-2">
                  {folderQuizzes.map(q => (
                    <Card key={q.id} className="overflow-hidden" data-testid={`folder-results-${folder.id}`}>
                      {renderQuizCard(q)}
                    </Card>
                  ))}
                </div>
              </motion.div>
            );
          })}

          {unfiledQuizzes.length > 0 && (
            <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
              {foldersWithResults.length > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                  <h2 className="font-semibold text-base text-muted-foreground">Darssiz quizlar</h2>
                  <Badge variant="secondary" className="text-xs">{unfiledQuizzes.length}</Badge>
                </div>
              )}
              <div className="space-y-2">
                {unfiledQuizzes.map(q => (
                  <Card key={q.id} className="overflow-hidden">
                    {renderQuizCard(q)}
                  </Card>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      ) : (
        <Card className="p-12 text-center">
          <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Hozircha natijalar yo'q</p>
          <p className="text-sm text-muted-foreground mt-1">Quizlarni o'ynatganingizdan keyin natijalar shu yerda ko'rinadi</p>
        </Card>
      )}

      <Dialog open={!!telegramQuiz} onOpenChange={(open) => !open && setTelegramQuiz(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Natijalarni Telegramga yuborish</DialogTitle>
          </DialogHeader>
          {telegramQuiz && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">"{telegramQuiz.title}"</span> natijalarini qaysi guruh/kanalga yubormoqchisiz?
              </p>
              <p className="text-xs text-muted-foreground">
                Top 3 va top 10 ro'yxati + barcha natijalar PDF fayl sifatida yuboriladi
              </p>
              {telegramChats.length === 0 ? (
                <div className="text-center py-6 space-y-3">
                  <Bot className="w-8 h-8 mx-auto text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground">Hali guruh/kanal ulanmagan</p>
                  <Button variant="outline" onClick={() => { setTelegramQuiz(null); navigate("/teacher/telegram"); }} data-testid="button-go-telegram-settings">
                    Telegram sozlamalariga o'tish
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {telegramChats.map((chat) => (
                    <div
                      key={chat.chatId}
                      className="flex items-center justify-between gap-3 p-3 rounded-md border hover-elevate cursor-pointer"
                      data-testid={`button-send-results-to-chat-${chat.chatId}`}
                      onClick={() => sendResultsMutation.mutate({ quizId: telegramQuiz.id, chatId: chat.chatId })}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${chat.type === "channel" ? "gradient-teal" : "gradient-purple"}`}>
                          {chat.type === "channel" ? <Megaphone className="w-4 h-4 text-white" /> : <Users className="w-4 h-4 text-white" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{chat.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {chat.type === "channel" ? "Kanal" : "Guruh"}
                            {chat.username ? ` | @${chat.username}` : ""}
                          </p>
                        </div>
                      </div>
                      {sendResultsMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      ) : (
                        <Send className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuizResultsDetail({ quizId, onDeleteAll }: { quizId: string; onDeleteAll: () => void }) {
  const { toast } = useToast();
  const { data: results, isLoading } = useQuery<QuizResult[]>({
    queryKey: ["/api/quiz-results", quizId],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${quizId}/quiz-results`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (resultId: string) => {
      await apiRequest("DELETE", `/api/quiz-results/${resultId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quiz-results", quizId] });
      toast({ title: "O'chirildi", description: "Natija muvaffaqiyatli o'chirildi" });
    },
    onError: () => {
      toast({ title: "Xatolik", description: "O'chirishda xatolik yuz berdi", variant: "destructive" });
    },
  });

  if (isLoading) return <div className="mt-4"><Skeleton className="h-32 w-full" /></div>;

  const sorted = [...(results || [])].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));

  if (sorted.length === 0) {
    return (
      <div className="mt-4 p-4 text-center text-sm text-muted-foreground">
        Bu quiz uchun natijalar topilmadi
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between px-2 mb-1">
        <span className="text-xs text-muted-foreground">{sorted.length} ta natija</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs text-destructive hover:text-destructive border-destructive/30"
          onClick={onDeleteAll}
          data-testid="button-delete-all-results"
        >
          <Trash2 className="w-3 h-3 mr-1" /> Barchasini o'chirish
        </Button>
      </div>
      <div className="grid grid-cols-[2rem_1fr_4rem_5rem_2.5rem] gap-2 text-xs font-medium text-muted-foreground px-2">
        <span>#</span>
        <span>Ism</span>
        <span className="text-center">Ball</span>
        <span className="text-center">To'g'ri</span>
        <span></span>
      </div>
      {sorted.map((r, i) => {
        const name = r.guestName || `O'yinchi #${r.participantId.slice(-4)}`;
        const pct = r.totalQuestions > 0 ? Math.round((r.correctAnswers / r.totalQuestions) * 100) : 0;
        return (
          <div
            key={r.id}
            className={`grid grid-cols-[2rem_1fr_4rem_5rem_2.5rem] gap-2 items-center px-2 py-1.5 rounded-md text-sm ${i < 3 ? "font-semibold" : ""}`}
            data-testid={`row-result-${i}`}
          >
            <span className={i < 3 ? "text-foreground font-bold" : "text-muted-foreground"}>
              {i + 1}
            </span>
            <span className="truncate" dir="auto">
              {name}
              {(r as any)._isShared && <span className="ml-1 text-xs text-primary">(mustaqil)</span>}
            </span>
            <span className="text-center font-medium">{r.totalScore}</span>
            <span className="text-center text-muted-foreground">{r.correctAnswers}/{r.totalQuestions} ({pct}%)</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => deleteMutation.mutate(r.id)}
              disabled={deleteMutation.isPending}
              title="O'chirish"
              data-testid={`button-delete-result-${r.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
