import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { io, Socket } from "socket.io-client";
import { Clock, Users, BookOpen, Play, Loader2, CheckCircle, Zap } from "lucide-react";

let socket: Socket | null = null;

interface ScheduledQuizInfo {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  coverImage: string | null;
  totalQuestions: number;
  scheduledAt: string;
  scheduledStatus: string;
  scheduledCode: string;
  scheduledRequireCode?: boolean;
  creatorId: string;
}

export default function ScheduledQuizLobby({ mode = "code" }: { mode?: "code" | "open" }) {
  const params = useParams<{ code: string; quizId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const code = mode === "code" ? (params.code || "") : "";
  const quizId = mode === "open" ? (params.quizId || "") : "";

  const [quizInfo, setQuizInfo] = useState<ScheduledQuizInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [joinedPlayers, setJoinedPlayers] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isStarted, setIsStarted] = useState(false);
  const [roomCode, setRoomCode] = useState("");

  useEffect(() => {
    const fetchUrl = mode === "code" && code
      ? `/api/scheduled-quiz/${code}`
      : mode === "open" && quizId
        ? `/api/scheduled-quiz-by-id/${quizId}`
        : null;
    if (!fetchUrl) return;
    fetch(fetchUrl)
      .then(r => {
        if (!r.ok) throw new Error("Quiz topilmadi");
        return r.json();
      })
      .then(data => {
        setQuizInfo(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [code, quizId, mode]);

  useEffect(() => {
    if (!quizInfo?.scheduledAt) return;
    const target = new Date(quizInfo.scheduledAt).getTime();

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        clearInterval(interval);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds });
    }, 1000);

    return () => clearInterval(interval);
  }, [quizInfo?.scheduledAt]);

  const lobbyCode = quizInfo?.scheduledCode || code;

  useEffect(() => {
    if (!isJoined || !lobbyCode) return;

    const s = io({
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 10000,
    });

    s.on("connect", () => {
      s.emit("scheduled:join-lobby", { code: lobbyCode, playerName });
    });

    s.on("reconnect", () => {
      s.emit("scheduled:join-lobby", { code: lobbyCode, playerName });
    });

    s.on("scheduled:lobby-update", (data: { players: string[] }) => {
      setJoinedPlayers(data.players);
    });

    s.on("scheduled:game-starting", (data: { roomCode: string }) => {
      setRoomCode(data.roomCode);
      setIsStarted(true);
      if (quizInfo) {
        navigate(`/quiz/play/${quizInfo.id}?joinCode=${data.roomCode}&autoName=${encodeURIComponent(playerName)}`);
      }
    });

    socket = s;

    return () => {
      s.disconnect();
      socket = null;
    };
  }, [isJoined, lobbyCode, playerName, navigate]);

  const handleJoin = useCallback(() => {
    if (!playerName.trim()) {
      toast({ title: "Ism kiriting", variant: "destructive" });
      return;
    }
    setIsJoined(true);
  }, [playerName, toast]);

  const totalDiff = quizInfo?.scheduledAt ? new Date(quizInfo.scheduledAt).getTime() - Date.now() : 0;
  const isTimeUp = totalDiff <= 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !quizInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="p-8 text-center max-w-md w-full">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold mb-2">Quiz topilmadi</h2>
          <p className="text-muted-foreground mb-4">Bu link noto'g'ri yoki quiz bekor qilingan</p>
          <Button onClick={() => navigate("/")} data-testid="button-go-home">Bosh sahifaga</Button>
        </Card>
      </div>
    );
  }

  if (isStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-4"
        >
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
          >
            <Zap className="w-16 h-16 text-yellow-500 mx-auto" />
          </motion.div>
          <h1 className="text-3xl font-bold">Quiz boshlanmoqda!</h1>
          <p className="text-muted-foreground">Sizni o'yinga yo'naltiramiz...</p>
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg space-y-6"
      >
        <div className="text-center space-y-2">
          <Badge variant="outline" className="mb-2">
            <Clock className="w-3 h-3 mr-1" />
            Rejalashtirilgan quiz
          </Badge>
          <h1 className="text-2xl font-bold" data-testid="text-scheduled-quiz-title">{quizInfo.title}</h1>
          {quizInfo.description && (
            <p className="text-muted-foreground text-sm">{quizInfo.description}</p>
          )}
          <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <BookOpen className="w-4 h-4" />
              {quizInfo.totalQuestions} savol
            </span>
            {quizInfo.category && (
              <span>
                <Badge variant="secondary" className="text-xs">{quizInfo.category}</Badge>
              </span>
            )}
          </div>
        </div>

        <Card className="p-6">
          <div className="text-center space-y-4">
            <p className="text-sm font-medium text-muted-foreground">
              {isTimeUp ? "Vaqt keldi! Quiz tez orada boshlanadi..." : "Boshlanishiga qolgan vaqt:"}
            </p>

            {!isTimeUp ? (
              <div className="flex items-center justify-center gap-3" data-testid="countdown-timer">
                {timeLeft.days > 0 && (
                  <div className="text-center">
                    <div className="text-3xl font-bold tabular-nums bg-muted rounded-md px-3 py-2 min-w-[60px]">
                      {String(timeLeft.days).padStart(2, "0")}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">kun</p>
                  </div>
                )}
                <div className="text-center">
                  <div className="text-3xl font-bold tabular-nums bg-muted rounded-md px-3 py-2 min-w-[60px]">
                    {String(timeLeft.hours).padStart(2, "0")}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">soat</p>
                </div>
                <div className="text-2xl font-bold text-muted-foreground">:</div>
                <div className="text-center">
                  <div className="text-3xl font-bold tabular-nums bg-muted rounded-md px-3 py-2 min-w-[60px]">
                    {String(timeLeft.minutes).padStart(2, "0")}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">daqiqa</p>
                </div>
                <div className="text-2xl font-bold text-muted-foreground">:</div>
                <div className="text-center">
                  <div className="text-3xl font-bold tabular-nums bg-muted rounded-md px-3 py-2 min-w-[60px]">
                    {String(timeLeft.seconds).padStart(2, "0")}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">soniya</p>
                </div>
              </div>
            ) : (
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="flex items-center justify-center gap-2 text-primary"
              >
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="font-medium">Boshlanmoqda...</span>
              </motion.div>
            )}

            <p className="text-xs text-muted-foreground">
              {new Date(quizInfo.scheduledAt).toLocaleDateString("uz-UZ", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Tashkent",
              })}
              {" "}(O'zbekiston vaqti)
            </p>
          </div>
        </Card>

        {!isJoined ? (
          <Card className="p-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Ismingizni kiriting</label>
                <Input
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Ism..."
                  maxLength={20}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  data-testid="input-player-name"
                />
              </div>
              <Button
                className="w-full gradient-purple border-0"
                onClick={handleJoin}
                data-testid="button-join-scheduled"
              >
                <Play className="w-4 h-4 mr-2" />
                Kutish zaliga qo'shilish
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="font-medium text-sm">Siz kutish zalida: <span className="text-primary">{playerName}</span></span>
                </div>
                <Badge variant="secondary">
                  <Users className="w-3 h-3 mr-1" />
                  {joinedPlayers.length}
                </Badge>
              </div>

              {joinedPlayers.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Kutayotgan o'yinchilar:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {joinedPlayers.map((name, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-center text-muted-foreground">
                Quiz boshlanganida avtomatik yo'naltirilasiz
              </p>
            </div>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
