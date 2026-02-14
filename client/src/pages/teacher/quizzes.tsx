import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Edit, Play, Eye, Upload, Send, Users, Megaphone, Loader2, Bot } from "lucide-react";
import type { Quiz, UserProfile, TelegramChat } from "@shared/schema";

export default function TeacherQuizzes() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [telegramQuiz, setTelegramQuiz] = useState<Quiz | null>(null);

  const { data: quizzes, isLoading } = useQuery<Quiz[]>({
    queryKey: ["/api/quizzes"],
  });

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
  });

  const telegramChats = ((profile?.telegramChats as TelegramChat[]) || []);
  const hasTelegramBot = !!(profile as any)?.hasTelegramBot;

  const sendToTelegramMutation = useMutation({
    mutationFn: async ({ quizId, chatId }: { quizId: string; chatId: string }) => {
      const res = await apiRequest("POST", "/api/telegram/send-quiz", {
        quizId,
        chatId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `${data.sent} ta savol Telegramga yuborildi!` });
      setTelegramQuiz(null);
    },
    onError: (error: any) => {
      toast({ title: error.message || "Telegramga yuborishda xatolik", variant: "destructive" });
    },
  });

  const deleteQuiz = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/quizzes/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      toast({ title: "Quiz o'chirildi" });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-quizzes-title">Quizlarim</h1>
          <p className="text-muted-foreground">Barcha quizlarni boshqarish</p>
        </div>
        <Button className="gradient-purple border-0" onClick={() => navigate("/teacher/quizzes/new")} data-testid="button-new-quiz">
          <Plus className="w-4 h-4 mr-1" /> Yangi Quiz
        </Button>
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
      ) : quizzes && quizzes.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {quizzes.map((quiz) => (
            <motion.div key={quiz.id} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
              <Card className="p-5 hover-elevate" data-testid={`card-quiz-${quiz.id}`}>
                <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                  <h3 className="font-semibold">{quiz.title}</h3>
                  <Badge variant={quiz.status === "published" ? "default" : "secondary"}>
                    {quiz.status === "published" ? "Nashr" : "Qoralama"}
                  </Badge>
                </div>
                {quiz.description && (
                  <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{quiz.description}</p>
                )}
                <div className="text-sm text-muted-foreground mb-4">
                  {quiz.totalQuestions} savol | {quiz.totalPlays} marta o'ynalgan
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/quizzes/${quiz.id}`)} data-testid={`button-edit-${quiz.id}`}>
                    <Edit className="w-3 h-3 mr-1" /> Tahrirlash
                  </Button>
                  {quiz.status === "published" && (
                    <Button size="sm" className="gradient-purple border-0" onClick={() => navigate(`/teacher/live?quizId=${quiz.id}`)} data-testid={`button-start-live-${quiz.id}`}>
                      <Play className="w-3 h-3 mr-1" /> Jonli
                    </Button>
                  )}
                  {hasTelegramBot && quiz.totalQuestions > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setTelegramQuiz(quiz)} data-testid={`button-telegram-${quiz.id}`}>
                      <Send className="w-3 h-3 mr-1" /> Telegram
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => deleteQuiz.mutate(quiz.id)} data-testid={`button-delete-${quiz.id}`}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 rounded-full gradient-purple/10 flex items-center justify-center mx-auto mb-4">
            <Plus className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Quizlaringiz yo'q</h3>
          <p className="text-muted-foreground mb-4">Birinchi quizingizni yarating!</p>
          <Button className="gradient-purple border-0" onClick={() => navigate("/teacher/quizzes/new")} data-testid="button-first-quiz">
            <Plus className="w-4 h-4 mr-1" /> Yangi Quiz
          </Button>
        </Card>
      )}

      <Dialog open={!!telegramQuiz} onOpenChange={(open) => !open && setTelegramQuiz(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Telegramga ulashish</DialogTitle>
          </DialogHeader>
          {telegramQuiz && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">"{telegramQuiz.title}"</span> quizini qaysi guruh/kanalga yubormoqchisiz?
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
                      data-testid={`button-send-to-chat-${chat.chatId}`}
                      onClick={() => sendToTelegramMutation.mutate({ quizId: telegramQuiz.id, chatId: chat.chatId })}
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
                      {sendToTelegramMutation.isPending ? (
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
