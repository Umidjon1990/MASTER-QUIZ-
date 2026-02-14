import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Bot, Plus, Trash2, Loader2, CheckCircle, Users, Megaphone, Link2, AlertCircle, ExternalLink } from "lucide-react";
import type { UserProfile, TelegramChat } from "@shared/schema";

export default function TelegramSettings() {
  const { toast } = useToast();
  const [botToken, setBotToken] = useState("");
  const [chatInput, setChatInput] = useState("");

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
  });

  const hasTelegramBot = !!(profile as any)?.hasTelegramBot;
  const maskedToken = profile?.telegramBotToken;
  const chats = ((profile?.telegramChats as TelegramChat[]) || []);

  const saveTokenMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await apiRequest("POST", "/api/telegram/save-token", { botToken: token });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Bot ulandi: @${data.botName}` });
      setBotToken("");
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Bot tokenni saqlashda xatolik", variant: "destructive" });
    },
  });

  const deleteTokenMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/telegram/token");
    },
    onSuccess: () => {
      toast({ title: "Bot token o'chirildi" });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
    },
    onError: () => {
      toast({ title: "Xatolik yuz berdi", variant: "destructive" });
    },
  });

  const addChatMutation = useMutation({
    mutationFn: async (chatId: string) => {
      const res = await apiRequest("POST", "/api/telegram/add-chat", { chatId });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `"${data.chat.title}" qo'shildi` });
      setChatInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Chatni qo'shishda xatolik", variant: "destructive" });
    },
  });

  const removeChatMutation = useMutation({
    mutationFn: async (chatId: string) => {
      await apiRequest("DELETE", `/api/telegram/chats/${encodeURIComponent(chatId)}`);
    },
    onSuccess: () => {
      toast({ title: "Chat o'chirildi" });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
    },
    onError: () => {
      toast({ title: "Xatolik yuz berdi", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold" data-testid="text-telegram-title">Telegram Bot Sozlamalari</h1>
        <p className="text-muted-foreground">Quizlarni Telegram guruh va kanallarga yuborish uchun botingizni ulang</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Bot className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold">Bot Token</h2>
            {hasTelegramBot && (
              <Badge variant="secondary" className="text-xs" data-testid="badge-bot-connected">
                <CheckCircle className="w-3 h-3 mr-1" /> Ulangan
              </Badge>
            )}
          </div>

          {!hasTelegramBot ? (
            <div className="space-y-3">
              <Card className="p-3 text-sm text-muted-foreground space-y-1.5">
                <p className="flex items-start gap-2"><span className="font-medium text-foreground shrink-0">1.</span> Telegram'da @BotFather ga yozing va /newbot buyrug'ini yuboring</p>
                <p className="flex items-start gap-2"><span className="font-medium text-foreground shrink-0">2.</span> Bot nomini kiriting va token oling</p>
                <p className="flex items-start gap-2"><span className="font-medium text-foreground shrink-0">3.</span> Botni guruh yoki kanalingizga admin qilib qo'shing</p>
                <p className="flex items-start gap-2"><span className="font-medium text-foreground shrink-0">4.</span> Tokenni quyidagi maydonga kiriting</p>
              </Card>
              <div>
                <Label>Bot Token</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="123456789:ABCdefGHI..."
                    type="password"
                    data-testid="input-bot-token"
                  />
                  <Button
                    onClick={() => saveTokenMutation.mutate(botToken)}
                    disabled={!botToken.trim() || saveTokenMutation.isPending}
                    className="gradient-purple border-0 shrink-0"
                    data-testid="button-save-token"
                  >
                    {saveTokenMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Saqlash"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Bot token saqlangan</span>
                {maskedToken && <span className="text-muted-foreground">({maskedToken})</span>}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => deleteTokenMutation.mutate()}
                disabled={deleteTokenMutation.isPending}
                data-testid="button-delete-token"
              >
                {deleteTokenMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                O'chirish
              </Button>
            </div>
          )}
        </Card>
      </motion.div>

      {hasTelegramBot && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Link2 className="w-5 h-5 text-muted-foreground" />
              <h2 className="font-semibold">Ulangan guruh va kanallar</h2>
              <Badge variant="secondary" className="text-xs">{chats.length}</Badge>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Guruh Chat ID yoki Kanal username</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="@kanalusername yoki -1001234567890"
                    data-testid="input-chat-id"
                  />
                  <Button
                    onClick={() => addChatMutation.mutate(chatInput)}
                    disabled={!chatInput.trim() || addChatMutation.isPending}
                    className="gradient-purple border-0 shrink-0"
                    data-testid="button-add-chat"
                  >
                    {addChatMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                    Qo'shish
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Guruh uchun: Chat ID (-100... raqam). Kanal uchun: @username
                </p>
              </div>

              {chats.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Hali hech qanday guruh yoki kanal ulanmagan</p>
                  <p className="text-xs mt-1">Yuqoridagi maydondan guruh yoki kanal qo'shing</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {chats.map((chat) => (
                    <div
                      key={chat.chatId}
                      className="flex items-center justify-between gap-3 p-3 rounded-md border"
                      data-testid={`card-telegram-chat-${chat.chatId}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${chat.type === "channel" ? "gradient-teal" : "gradient-purple"}`}>
                          {chat.type === "channel" ? <Megaphone className="w-4 h-4 text-white" /> : <Users className="w-4 h-4 text-white" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{chat.title}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              {chat.type === "channel" ? "Kanal" : "Guruh"}
                            </Badge>
                            {chat.username && (
                              <span className="text-xs text-muted-foreground">@{chat.username}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeChatMutation.mutate(chat.chatId)}
                        disabled={removeChatMutation.isPending}
                        data-testid={`button-remove-chat-${chat.chatId}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="p-4 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">Qanday ishlaydi?</p>
          <p>1. Bot tokenni saqlang va guruh/kanallarni qo'shing</p>
          <p>2. Quizlarim sahifasida har bir quizda "Telegramga ulashish" tugmasi paydo bo'ladi</p>
          <p>3. Tugmani bosganingizda qaysi guruh/kanalga yuborishni tanlaysiz</p>
          <p>4. Savollar anonim quiz (poll) shaklida yuboriladi</p>
        </Card>
      </motion.div>
    </div>
  );
}
