import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { io as socketIO, Socket } from "socket.io-client";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  ChevronLeft,
  Send,
  Trophy,
  RotateCcw,
  Share2,
  Home,
  ArrowLeft,
  Copy,
  Check,
  Users,
  Crown,
  Medal,
  Loader2,
  Gamepad2,
  UserPlus,
  Play,
  Link2,
  Zap,
  Star,
  Target,
} from "lucide-react";

const KAHOOT_COLORS = [
  { bg: "from-red-500 to-rose-600", border: "border-red-400", text: "text-white", icon: Target },
  { bg: "from-blue-500 to-indigo-600", border: "border-blue-400", text: "text-white", icon: Star },
  { bg: "from-amber-400 to-yellow-500", border: "border-amber-300", text: "text-white", icon: Zap },
  { bg: "from-emerald-500 to-green-600", border: "border-emerald-400", text: "text-white", icon: CheckCircle2 },
  { bg: "from-purple-500 to-violet-600", border: "border-purple-400", text: "text-white", icon: Crown },
  { bg: "from-pink-500 to-fuchsia-600", border: "border-pink-400", text: "text-white", icon: Medal },
  { bg: "from-cyan-500 to-teal-600", border: "border-cyan-400", text: "text-white", icon: Star },
  { bg: "from-orange-500 to-red-500", border: "border-orange-400", text: "text-white", icon: Zap },
];

function CircularTimer({ timeLeft, totalTime }: { timeLeft: number; totalTime: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = totalTime > 0 ? timeLeft / totalTime : 0;
  const strokeDashoffset = circumference * (1 - progress);
  const isUrgent = timeLeft <= 5;
  const colorClass = isUrgent ? "text-red-500" : timeLeft <= 10 ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="relative w-16 h-16 flex items-center justify-center">
      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-white/15" />
        <circle
          cx="32" cy="32" r={radius} fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          className={colorClass}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 0.8s linear, color 0.3s" }}
        />
      </svg>
      <span className={`absolute text-lg font-bold font-mono ${colorClass}`}>
        {timeLeft}
      </span>
    </div>
  );
}

interface QuizQuestion {
  id: string;
  questionText: string;
  type: string;
  options: string[] | null;
  points: number;
  timeLimit: number;
  mediaUrl: string | null;
  mediaType: string | null;
}

interface QuizData {
  quiz: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    totalQuestions: number;
  };
  questions: QuizQuestion[];
}

interface SubmitResult {
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  playerName: string;
  results: Record<string, { answer: string | string[]; isCorrect: boolean; correctAnswer: string; points: number }>;
  showCorrectAnswers?: boolean;
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  correctAnswers: number;
  playerId: string;
  totalAnswered?: number;
}

type GameStage = "mode-select" | "name" | "create-or-join" | "lobby" | "playing" | "leaderboard" | "result" | "multi-result";

export default function QuizPlayPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const socketRef = useRef<Socket | null>(null);

  const autoParams = new URLSearchParams(window.location.search);
  const autoJoinCode = autoParams.get("joinCode") || "";
  const autoName = autoParams.get("autoName") || "";

  const [stage, setStage] = useState<GameStage>(autoJoinCode && autoName ? "lobby" : "mode-select");
  const [gameMode, setGameMode] = useState<"solo" | "multi">(autoJoinCode && autoName ? "multi" : "solo");
  const [playerName, setPlayerName] = useState(autoName);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState(autoJoinCode);
  const [roomId, setRoomId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState<{ playerId: string; name: string }[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion | null>(null);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myScore, setMyScore] = useState(0);
  const [lastAnswerResult, setLastAnswerResult] = useState<{ isCorrect: boolean; points: number; correctAnswer?: string; answerOrder?: number; showCorrectAnswers?: boolean } | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [multiResult, setMultiResult] = useState<{ leaderboard: LeaderboardEntry[]; totalQuestions: number; maxScore: number; quizTitle: string } | null>(null);
  const [isLastQuestion, setIsLastQuestion] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [autoJoined, setAutoJoined] = useState(false);
  const reconnectInfoRef = useRef<{ code: string; playerName: string; playerId: string } | null>(null);
  const stateRecoveryRef = useRef(false);
  const disconnectedSinceRef = useRef<number | null>(null);
  const [showConnectionWarning, setShowConnectionWarning] = useState(false);
  const connectionWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, error } = useQuery<QuizData>({
    queryKey: ["/api/quizzes", id, "play"],
    queryFn: async () => {
      const res = await fetch(`/api/quizzes/${id}/play`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Quiz topilmadi");
      }
      return res.json();
    },
    enabled: !!id,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/quizzes/${id}/submit-public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, playerName }),
      });
      if (!res.ok) throw new Error("Yuborishda xatolik");
      return res.json() as Promise<SubmitResult>;
    },
    onSuccess: (result) => {
      setSubmitResult(result);
      setStage("result");
    },
    onError: () => {
      toast({ title: "Yuborishda xatolik yuz berdi", variant: "destructive" });
    },
  });

  useEffect(() => {
    return () => {
      if (connectionWarningTimerRef.current) {
        clearTimeout(connectionWarningTimerRef.current);
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  const recoverGameState = useCallback((s: Socket) => {
    if (stateRecoveryRef.current) return;
    stateRecoveryRef.current = true;
    s.emit("public:request-state", {}, (res: any) => {
      stateRecoveryRef.current = false;
      if (!res?.success) return;

      if (res.gameStatus === "finished") {
        setMultiResult({
          leaderboard: res.leaderboard,
          totalQuestions: res.totalQuestions,
          maxScore: res.maxScore,
          quizTitle: res.quizTitle,
        });
        setMyScore(res.myScore || 0);
        setStage("multi-result");
      } else if (res.gameStatus === "playing" && res.question) {
        setCurrentQuestion(res.question);
        setQuestionIndex(res.questionIndex);
        setTotalQuestions(res.totalQuestions);
        setTimeLeft(res.question.timeLimit || 0);
        setHasAnswered(res.hasAnswered || false);
        setMyScore(res.myScore || 0);
        setLastAnswerResult(null);
        setStage("playing");
      } else if (res.gameStatus === "waiting") {
        if (res.players) setPlayers(res.players);
        setStage("lobby");
      }
    });
  }, []);

  const connectSocket = useCallback(() => {
    if (socketRef.current?.connected) return socketRef.current;

    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }

    const s = socketIO({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 15000,
      forceNew: true,
    });
    socketRef.current = s;

    s.on("connect", () => {
      disconnectedSinceRef.current = null;
      setShowConnectionWarning(false);
      if (connectionWarningTimerRef.current) {
        clearTimeout(connectionWarningTimerRef.current);
        connectionWarningTimerRef.current = null;
      }
    });

    s.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") {
        disconnectedSinceRef.current = Date.now();
        connectionWarningTimerRef.current = setTimeout(() => {
          if (disconnectedSinceRef.current) {
            setShowConnectionWarning(true);
          }
        }, 60000);
      }
    });

    s.on("reconnect_attempt", () => {});

    s.on("reconnect", () => {
      disconnectedSinceRef.current = null;
      setShowConnectionWarning(false);
      if (connectionWarningTimerRef.current) {
        clearTimeout(connectionWarningTimerRef.current);
        connectionWarningTimerRef.current = null;
      }
      const info = reconnectInfoRef.current;
      if (info) {
        const storedToken = localStorage.getItem(`rejoin_${info.code}_${info.playerName.trim().toLowerCase()}`);
        s.emit("public:join-room", {
          code: info.code,
          playerName: info.playerName,
          rejoinToken: storedToken || undefined,
        }, (res: any) => {
          if (res?.success) {
            setRoomId(res.roomId);
            setPlayerId(res.playerId);
            setPlayers(res.players);
            if (res.isHost) setIsHost(true);
            if (res.rejoinToken) {
              localStorage.setItem(`rejoin_${info.code}_${info.playerName.trim().toLowerCase()}`, res.rejoinToken);
            }
            setMyScore(res.currentScore || 0);
            setTimeout(() => recoverGameState(s), 300);
          }
        });
      }
    });

    s.on("public:player-joined", (data) => {
      setPlayers(data.players);
    });

    s.on("public:player-left", (data) => {
      setPlayers(data.players);
    });

    s.on("public:game-started", (data) => {
      setTotalQuestions(data.totalQuestions);
      setStage("playing");
    });

    s.on("public:question", (data) => {
      setCurrentQuestion(data.question);
      setQuestionIndex(data.index);
      setTotalQuestions(data.total);
      setTimeLeft(data.question.timeLimit || 30);
      setHasAnswered(false);
      setLastAnswerResult(null);
      setAnsweredCount(0);
      setStage("playing");
    });

    s.on("public:answer-result", (data) => {
      setLastAnswerResult({ isCorrect: data.isCorrect, points: data.points, correctAnswer: data.correctAnswer, answerOrder: data.answerOrder, showCorrectAnswers: data.showCorrectAnswers });
      setMyScore(data.totalScore);
    });

    s.on("public:answer-received", (data) => {
      setAnsweredCount(data.answeredCount);
      setTotalPlayers(data.totalPlayers);
    });

    s.on("public:leaderboard", (data) => {
      setLeaderboard(data.leaderboard);
      setIsLastQuestion(data.isLast);
      setStage("leaderboard");
    });

    s.on("public:game-finished", (data) => {
      setMultiResult(data);
      setStage("multi-result");
    });

    s.on("public:host-changed", (data) => {
      setPlayerId((currentPid) => {
        if (data.newHostId === currentPid) {
          setIsHost(true);
        }
        return currentPid;
      });
    });

    return s;
  }, [recoverGameState]);

  const handleCreateRoom = () => {
    if (!playerName.trim()) return;
    setConnecting(true);
    const s = connectSocket();
    s.emit("public:create-room", { quizId: id, playerName: playerName.trim() }, (res: any) => {
      setConnecting(false);
      if (res.success) {
        setRoomCode(res.code);
        setRoomId(res.roomId);
        setPlayerId(res.playerId);
        setIsHost(true);
        setPlayers([{ playerId: res.playerId, name: playerName.trim() }]);
        setTotalQuestions(res.totalQuestions);
        reconnectInfoRef.current = { code: res.code, playerName: playerName.trim(), playerId: res.playerId };
        setStage("lobby");
      } else {
        toast({ title: res.error || "Xona yaratishda xatolik", variant: "destructive" });
      }
    });
  };

  const handleJoinRoom = () => {
    if (!playerName.trim() || !joinCode.trim()) return;
    setConnecting(true);
    const s = connectSocket();
    const storedToken = localStorage.getItem(`rejoin_${joinCode.trim()}_${playerName.trim().toLowerCase()}`);
    s.emit("public:join-room", { code: joinCode.trim(), playerName: playerName.trim(), rejoinToken: storedToken || undefined }, (res: any) => {
      setConnecting(false);
      if (res.success) {
        setRoomCode(joinCode.trim());
        setRoomId(res.roomId);
        setPlayerId(res.playerId);
        setIsHost(false);
        setPlayers(res.players);
        setTotalQuestions(res.totalQuestions);
        reconnectInfoRef.current = { code: joinCode.trim(), playerName: playerName.trim(), playerId: res.playerId };
        if (res.rejoinToken) {
          localStorage.setItem(`rejoin_${joinCode.trim()}_${playerName.trim().toLowerCase()}`, res.rejoinToken);
        }
        if (res.isRejoin) {
          setMyScore(res.currentScore || 0);
        }
        if (res.alreadyAnsweredCurrent) {
          setHasAnswered(true);
        }
        if (res.isLateJoin) {
          setStage("playing");
        } else {
          setStage("lobby");
        }
      } else {
        toast({ title: res.error || "Qo'shilishda xatolik", variant: "destructive" });
      }
    });
  };

  useEffect(() => {
    if (autoJoinCode && autoName && !autoJoined && data) {
      setAutoJoined(true);
      setGameMode("multi");
      setConnecting(true);
      reconnectInfoRef.current = { code: autoJoinCode, playerName: autoName, playerId: "" };
      const s = connectSocket();

      const doJoin = () => {
        const storedToken = localStorage.getItem(`rejoin_${autoJoinCode}_${autoName.trim().toLowerCase()}`);
        s.emit("public:join-room", { code: autoJoinCode, playerName: autoName, rejoinToken: storedToken || undefined }, (res: any) => {
          setConnecting(false);
          if (res.success) {
            setRoomCode(autoJoinCode);
            setRoomId(res.roomId);
            setPlayerId(res.playerId);
            setIsHost(false);
            setPlayers(res.players);
            setTotalQuestions(res.totalQuestions);
            reconnectInfoRef.current = { code: autoJoinCode, playerName: autoName, playerId: res.playerId };
            if (res.rejoinToken) {
              localStorage.setItem(`rejoin_${autoJoinCode}_${autoName.trim().toLowerCase()}`, res.rejoinToken);
            }
            if (res.isRejoin) {
              setMyScore(res.currentScore || 0);
            }
            if (res.alreadyAnsweredCurrent) {
              setHasAnswered(true);
            }
            if (res.isLateJoin) {
              setStage("playing");
            } else {
              setStage("lobby");
            }
          } else {
            toast({ title: res.error || "Qo'shilishda xatolik", variant: "destructive" });
            setStage("mode-select");
          }
        });
      };

      if (s.connected) {
        doJoin();
      } else {
        s.once("connect", doJoin);
      }
    }
  }, [autoJoinCode, autoName, autoJoined, data]);

  const handleStartGame = () => {
    socketRef.current?.emit("public:start-game", {}, (res: any) => {
      if (!res.success) {
        toast({ title: res.error || "O'yinni boshlashda xatolik", variant: "destructive" });
      }
    });
  };

  const handleMultiAnswer = (questionId: string, answer: string) => {
    if (hasAnswered || !currentQuestion) return;
    if (currentQuestion.type === "multiple_select") {
      setAnswers((prev) => {
        const current = Array.isArray(prev[questionId]) ? (prev[questionId] as string[]) : [];
        const updated = current.includes(answer) ? current.filter(a => a !== answer) : [...current, answer];
        return { ...prev, [questionId]: updated };
      });
    } else {
      setAnswers((prev) => ({ ...prev, [questionId]: answer }));
      setHasAnswered(true);
      socketRef.current?.emit("public:answer", { questionId, answer });
    }
  };

  const handleSubmitMultiSelect = () => {
    if (!currentQuestion || hasAnswered) return;
    const ans = answers[currentQuestion.id];
    if (!ans) return;
    setHasAnswered(true);
    socketRef.current?.emit("public:answer", {
      questionId: currentQuestion.id,
      answer: Array.isArray(ans) ? ans.join(",") : ans,
    });
  };

  const handleNextQuestion = () => {
    socketRef.current?.emit("public:next-question", {});
  };

  useEffect(() => {
    if (stage !== "playing" || !currentQuestion || gameMode !== "multi") return;
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [stage, timeLeft > 0, currentQuestion, gameMode]);

  const roomLostCountRef = useRef(0);

  useEffect(() => {
    if (gameMode !== "multi" || !socketRef.current || !reconnectInfoRef.current) return;
    if (stage !== "playing" && stage !== "leaderboard") return;

    roomLostCountRef.current = 0;

    const syncInterval = setInterval(() => {
      const s = socketRef.current;
      if (!s?.connected) return;
      s.emit("public:request-state", {}, (res: any) => {
        if (!res?.success) {
          roomLostCountRef.current++;
          if (roomLostCountRef.current >= 3) {
            console.warn("Room lost after 3 failed state syncs");
            toast({
              title: "Sessiya tugadi",
              description: "Server bilan aloqa uzildi. Natijalaringiz saqlanmoqda...",
              variant: "destructive",
            });
            const info = reconnectInfoRef.current;
            if (info && id) {
              const savedAnswers = { ...answers };
              fetch(`/api/quizzes/${id}/submit-public`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  playerName: info.playerName,
                  answers: savedAnswers,
                }),
              }).then(r => r.json()).then(result => {
                setMultiResult({
                  leaderboard: [],
                  totalQuestions: result.totalQuestions || totalQuestions,
                  maxScore: 0,
                  quizTitle: data?.quiz?.title || "",
                });
                setMyScore(result.score || myScore);
                setStage("multi-result");
              }).catch(() => {
                setStage("multi-result");
                setMultiResult({
                  leaderboard: [],
                  totalQuestions: totalQuestions,
                  maxScore: 0,
                  quizTitle: data?.quiz?.title || "",
                });
              });
            } else {
              setStage("multi-result");
              setMultiResult({
                leaderboard: [],
                totalQuestions: totalQuestions,
                maxScore: 0,
                quizTitle: data?.quiz?.title || "",
              });
            }
          }
          return;
        }
        roomLostCountRef.current = 0;
        if (res.gameStatus === "finished") {
          setMultiResult({
            leaderboard: res.leaderboard,
            totalQuestions: res.totalQuestions,
            maxScore: res.maxScore,
            quizTitle: res.quizTitle,
          });
          setMyScore(res.myScore || 0);
          setStage("multi-result");
        } else if (res.gameStatus === "playing" && res.question) {
          if (res.questionIndex !== questionIndex || (stage === "leaderboard" && res.questionIndex >= 0)) {
            setCurrentQuestion(res.question);
            setQuestionIndex(res.questionIndex);
            setTotalQuestions(res.totalQuestions);
            setTimeLeft(res.question.timeLimit || 0);
            setHasAnswered(res.hasAnswered || false);
            setMyScore(res.myScore || 0);
            setLastAnswerResult(null);
            setStage("playing");
          }
        }
      });
    }, 3000);

    return () => clearInterval(syncInterval);
  }, [gameMode, stage, questionIndex, id, totalQuestions, myScore, answers, data]);

  const soloCurrentQuestion = data?.questions?.[currentIndex];

  useEffect(() => {
    if (stage !== "playing" || !soloCurrentQuestion || gameMode !== "solo") return;
    setTimeLeft(soloCurrentQuestion.timeLimit || 30);
  }, [currentIndex, stage, soloCurrentQuestion, gameMode]);

  useEffect(() => {
    if (stage !== "playing" || gameMode !== "solo" || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [stage, timeLeft > 0, gameMode]);

  const handleSoloAnswer = useCallback(
    (questionId: string, answer: string) => {
      if (!soloCurrentQuestion) return;
      if (soloCurrentQuestion.type === "multiple_select") {
        setAnswers((prev) => {
          const current = Array.isArray(prev[questionId]) ? (prev[questionId] as string[]) : [];
          const updated = current.includes(answer) ? current.filter(a => a !== answer) : [...current, answer];
          return { ...prev, [questionId]: updated };
        });
      } else {
        setAnswers((prev) => ({ ...prev, [questionId]: answer }));
      }
    },
    [soloCurrentQuestion]
  );

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      toast({ title: "Link nusxalandi!" });
    });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      toast({ title: "Kod nusxalandi!" });
    });
  };

  const handlePlayAgain = () => {
    setStage("mode-select");
    setGameMode("solo");
    setCurrentIndex(0);
    setAnswers({});
    setSubmitResult(null);
    setMultiResult(null);
    setLeaderboard([]);
    setMyScore(0);
    setPlayers([]);
    setRoomCode("");
    setJoinCode("");
    setHasAnswered(false);
    setCurrentQuestion(null);
    setShowConnectionWarning(false);
    disconnectedSinceRef.current = null;
    reconnectInfoRef.current = null;
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-8 w-full max-w-md space-y-4">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-10 w-full" />
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-8 w-full max-w-md text-center space-y-4">
          <XCircle className="w-12 h-12 mx-auto text-destructive" />
          <h2 className="text-lg font-semibold">Quiz topilmadi</h2>
          <p className="text-sm text-muted-foreground">Bu quiz mavjud emas yoki ommaviy emas</p>
          <Button onClick={() => navigate("/discover")} data-testid="button-go-discover">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Discoverga qaytish
          </Button>
        </Card>
      </div>
    );
  }

  if (stage === "mode-select") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted/30">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
          <Card className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold" data-testid="text-quiz-title">{data.quiz.title}</h1>
              {data.quiz.description && <p className="text-sm text-muted-foreground">{data.quiz.description}</p>}
              <div className="flex gap-2 justify-center flex-wrap">
                {data.quiz.category && <Badge variant="secondary">{data.quiz.category}</Badge>}
                <Badge variant="outline">{data.quiz.totalQuestions} savol</Badge>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                className="w-full h-auto py-4"
                variant="outline"
                onClick={() => { setGameMode("solo"); setStage("name"); }}
                data-testid="button-solo-mode"
              >
                <div className="flex items-center gap-3 w-full">
                  <div className="w-10 h-10 rounded-md gradient-purple flex items-center justify-center shrink-0">
                    <Play className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold">Yakka o'ynash</p>
                    <p className="text-xs text-muted-foreground">O'zingiz mustaqil o'ynang</p>
                  </div>
                </div>
              </Button>

              <Button
                className="w-full h-auto py-4"
                variant="outline"
                onClick={() => { setGameMode("multi"); setStage("name"); }}
                data-testid="button-multi-mode"
              >
                <div className="flex items-center gap-3 w-full">
                  <div className="w-10 h-10 rounded-md gradient-teal flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold">Ko'p kishilik</p>
                    <p className="text-xs text-muted-foreground">Do'stlaringiz bilan birga o'ynang</p>
                  </div>
                </div>
              </Button>

              <Button
                className="w-full h-auto py-4"
                variant="outline"
                onClick={() => navigate(`/classroom/${id}`)}
                data-testid="button-classroom-mode"
              >
                <div className="flex items-center gap-3 w-full">
                  <div className="w-10 h-10 rounded-md bg-gradient-to-br from-emerald-600 to-green-700 flex items-center justify-center shrink-0">
                    <Gamepad2 className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold">Sinf Xona</p>
                    <p className="text-xs text-muted-foreground">Sinf xona uslubida interaktiv quiz</p>
                  </div>
                </div>
              </Button>
            </div>

            <Button variant="ghost" onClick={() => navigate("/discover")} className="w-full" data-testid="button-back-discover">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Orqaga
            </Button>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (stage === "name") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted/30">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="p-8 w-full max-w-md space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold">{data.quiz.title}</h1>
              <Badge variant={gameMode === "multi" ? "default" : "secondary"}>
                {gameMode === "multi" ? "Ko'p kishilik" : "Yakka o'yin"}
              </Badge>
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium">Ismingiz</label>
              <Input
                placeholder="Ismingizni kiriting"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                data-testid="input-player-name"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && playerName.trim()) {
                    if (gameMode === "solo") setStage("playing");
                    else setStage("create-or-join");
                  }
                }}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStage("mode-select")} data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Orqaga
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (gameMode === "solo") setStage("playing");
                  else setStage("create-or-join");
                }}
                disabled={!playerName.trim()}
                data-testid="button-continue"
              >
                Davom etish
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (stage === "create-or-join") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted/30">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
          <Card className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-xl font-bold">{data.quiz.title}</h1>
              <p className="text-sm text-muted-foreground">Salom, {playerName}!</p>
            </div>

            <div className="space-y-4">
              <Button
                className="w-full h-auto py-4"
                onClick={handleCreateRoom}
                disabled={connecting}
                data-testid="button-create-room"
              >
                <div className="flex items-center gap-3 w-full">
                  <div className="w-10 h-10 rounded-md gradient-purple flex items-center justify-center shrink-0">
                    {connecting ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Gamepad2 className="w-5 h-5 text-white" />}
                  </div>
                  <div className="text-left">
                    <p className="font-semibold">Xona yaratish</p>
                    <p className="text-xs opacity-80">Yangi o'yin boshlang va do'stlarni taklif qiling</p>
                  </div>
                </div>
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">yoki</span></div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Mavjud xonaga qo'shilish</p>
                <Input
                  placeholder="6-raqamli kod"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  data-testid="input-join-code"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && joinCode.length === 6) handleJoinRoom();
                  }}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleJoinRoom}
                  disabled={joinCode.length !== 6 || connecting}
                  data-testid="button-join-room"
                >
                  {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                  Qo'shilish
                </Button>
              </div>
            </div>

            <Button variant="ghost" onClick={() => setStage("name")} className="w-full" data-testid="button-back-name">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Orqaga
            </Button>
          </Card>
        </motion.div>
      </div>
    );
  }

  const connectionWarningBanner = showConnectionWarning ? (
    <div className="sticky top-0 z-[60] bg-amber-500/90 text-white text-center py-1 px-3 text-xs font-medium flex items-center justify-center gap-2" data-testid="banner-connection-warning">
      Internet aloqasini tekshiring
    </div>
  ) : null;

  if (stage === "lobby") {
    const isScheduledAutoJoin = !!(autoJoinCode && autoName);

    if (isScheduledAutoJoin) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-indigo-950 via-violet-950 to-slate-950">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="text-center space-y-5"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 mx-auto rounded-full border-4 border-violet-500/30 border-t-violet-400 flex items-center justify-center"
            />
            <h1 className="text-2xl font-bold text-white" data-testid="text-lobby-starting">{data.quiz.title}</h1>
            <p className="text-violet-300 text-sm">Test boshlanmoqda...</p>
            <div className="flex items-center justify-center gap-2">
              <Badge variant="secondary" className="text-xs">
                <Users className="w-3 h-3 mr-1" />
                {players.length} ishtirokchi
              </Badge>
            </div>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted/30">
        {connectionWarningBanner}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
          <Card className="p-8 space-y-6">
            <div className="text-center space-y-3">
              <h1 className="text-xl font-bold">{data.quiz.title}</h1>
              <div className="flex items-center justify-center gap-2">
                <Badge variant="secondary" className="text-lg px-4 py-1 font-mono tracking-widest" data-testid="text-room-code">
                  {roomCode}
                </Badge>
                <Button size="icon" variant="ghost" onClick={handleCopyCode} data-testid="button-copy-code">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Kodni do'stlaringizga yuboring</p>

              <div className="flex items-center gap-1.5 bg-muted/50 rounded-md px-3 py-2 mt-2">
                <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground truncate flex-1" data-testid="text-quiz-share-link">
                  {window.location.href}
                </span>
                <Button size="icon" variant="ghost" className="shrink-0" onClick={handleCopyLink} data-testid="button-copy-link-lobby">
                  {linkCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                O'yinchilar ({players.length})
              </p>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {players.map((p, i) => (
                  <div key={p.playerId} className="flex items-center gap-2 p-2 rounded-md bg-muted/50" data-testid={`player-${p.playerId}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${i === 0 ? "gradient-purple" : "gradient-teal"}`}>
                      {p.name[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-medium flex-1">{p.name}</span>
                    {p.playerId === playerId && isHost && (
                      <Badge variant="secondary" className="text-xs">
                        <Crown className="w-3 h-3 mr-1" />
                        Host
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {isHost ? (
              <Button className="w-full" onClick={handleStartGame} disabled={players.length < 1} data-testid="button-start-game">
                <Play className="w-4 h-4 mr-2" />
                O'yinni boshlash
              </Button>
            ) : (
              <div className="text-center space-y-2">
                <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Host o'yinni boshlashini kutilmoqda...</p>
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    );
  }

  if (stage === "leaderboard") {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-indigo-950 via-violet-950 to-slate-950">
        {connectionWarningBanner}
        <div className="flex-1 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
          <div className="text-center mb-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              <Trophy className="w-10 h-10 mx-auto text-yellow-400 drop-shadow-lg" />
            </motion.div>
            <h2 className="text-xl font-bold text-white mt-2">Reyting jadvali</h2>
            <p className="text-sm text-violet-200/60">{questionIndex + 1}/{totalQuestions} savoldan keyin</p>
          </div>

          <div className="space-y-2">
            {leaderboard.map((entry) => {
              const isMe = entry.playerId === playerId;
              const rankColor = entry.rank === 1 ? "from-yellow-400 to-amber-500" : entry.rank === 2 ? "from-gray-300 to-gray-400" : entry.rank === 3 ? "from-amber-600 to-amber-700" : "";
              return (
                <motion.div
                  key={entry.playerId}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: entry.rank * 0.04, type: "spring", stiffness: 250 }}
                  className={`flex items-center gap-3 p-3 rounded-xl ${
                    isMe ? "bg-primary/20 border border-primary/40 shadow-lg shadow-primary/10" : "bg-white/5 border border-white/10"
                  }`}
                  data-testid={`leaderboard-entry-${entry.playerId}`}
                >
                  <div className="w-9 h-9 shrink-0 flex items-center justify-center">
                    {entry.rank <= 3 ? (
                      <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${rankColor} flex items-center justify-center shadow`}>
                        <span className="text-white font-bold text-sm">{entry.rank}</span>
                      </div>
                    ) : (
                      <span className="text-sm font-bold text-white/50">{entry.rank}</span>
                    )}
                  </div>
                  <span className="text-sm font-medium flex-1 truncate text-white">{entry.name} {isMe && "(Siz)"}</span>
                  <motion.span
                    className="text-sm font-bold text-amber-300"
                    key={entry.score}
                    initial={{ scale: 1.3 }}
                    animate={{ scale: 1 }}
                  >
                    {entry.score}
                  </motion.span>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-6">
            {isHost && (
              <Button className="w-full gradient-purple border-0 text-white" onClick={isLastQuestion ? () => socketRef.current?.emit("public:next-question", {}) : handleNextQuestion} data-testid="button-next-question">
                {isLastQuestion ? "Natijalarni ko'rsatish" : "Keyingi savol"}
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
            {!isHost && (
              <div className="text-center">
                <Loader2 className="w-5 h-5 mx-auto animate-spin text-violet-300/50" />
                <p className="text-xs text-violet-200/40 mt-1">Keyingi savol kutilmoqda...</p>
              </div>
            )}
          </div>
        </motion.div>
        </div>
      </div>
    );
  }

  if (stage === "multi-result" && multiResult) {
    const myEntry = multiResult.leaderboard.find(e => e.playerId === playerId);
    const myRank = myEntry?.rank || 0;
    const top3 = multiResult.leaderboard.slice(0, 3);
    const rest = multiResult.leaderboard.slice(3);
    const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
    const podiumHeights = top3.length >= 3 ? ["h-24", "h-32", "h-20"] : top3.map((_, i) => i === 0 ? "h-32" : "h-24");
    const podiumColors = top3.length >= 3
      ? ["from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700", "from-yellow-400 to-amber-500", "from-amber-600 to-amber-700 dark:from-amber-700 dark:to-amber-800"]
      : ["from-yellow-400 to-amber-500", "from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700"];

    return (
      <div className="min-h-screen flex flex-col items-center justify-start p-4 bg-gradient-to-b from-violet-950 via-indigo-950 to-background overflow-y-auto">
        {connectionWarningBanner}
        {myRank <= 3 && myRank > 0 && (
          <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
            {Array.from({ length: 50 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 rounded-full"
                style={{
                  left: `${Math.random() * 100}%`,
                  backgroundColor: ["#FFD700", "#C0C0C0", "#CD7F32", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7"][i % 8],
                }}
                initial={{ y: -20, opacity: 1, rotate: 0 }}
                animate={{
                  y: window.innerHeight + 20,
                  opacity: [1, 1, 0],
                  rotate: Math.random() * 720 - 360,
                  x: Math.random() * 200 - 100,
                }}
                transition={{
                  duration: 2 + Math.random() * 3,
                  delay: Math.random() * 2,
                  repeat: 2,
                  ease: "easeOut",
                }}
              />
            ))}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mt-6 mb-8"
        >
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
          >
            <Trophy className="w-16 h-16 mx-auto text-yellow-400 drop-shadow-lg" />
          </motion.div>
          <h1 className="text-3xl font-bold text-white mt-3" data-testid="text-final-title">Yakuniy natijalar</h1>
          <p className="text-violet-200/70 mt-1">{multiResult.quizTitle}</p>
        </motion.div>

        {top3.length > 0 && (
          <div className="flex items-end justify-center gap-3 mb-8 w-full max-w-md">
            {podiumOrder.map((entry, i) => {
              if (!entry) return null;
              const isMe = entry.playerId === playerId;
              const percentage = multiResult.totalQuestions > 0 ? Math.round((entry.correctAnswers / multiResult.totalQuestions) * 100) : 0;
              return (
                <motion.div
                  key={entry.playerId}
                  initial={{ opacity: 0, y: 60 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.1, type: "spring", stiffness: 150 }}
                  className={`flex-1 flex flex-col items-center ${i === 1 ? "order-first sm:order-none" : ""}`}
                  data-testid={`podium-entry-${entry.playerId}`}
                >
                  <div className={`relative mb-2 ${isMe ? "ring-2 ring-primary ring-offset-2 ring-offset-violet-950 rounded-full" : ""}`}>
                    <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br ${podiumColors[i]} flex items-center justify-center shadow-lg`}>
                      <span className="text-white font-bold text-lg">{entry.name.charAt(0).toUpperCase()}</span>
                    </div>
                    {entry.rank === 1 && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.5, type: "spring" }}
                        className="absolute -top-3 -right-1"
                      >
                        <Crown className="w-6 h-6 text-yellow-400 drop-shadow" />
                      </motion.div>
                    )}
                  </div>
                  <p className="text-white text-xs sm:text-sm font-semibold truncate max-w-[90px] text-center">{entry.name}</p>
                  <p className="text-yellow-300 font-bold text-sm">{entry.score}</p>
                  <p className="text-violet-300/60 text-xs">{percentage}%</p>
                  <div className={`w-full ${podiumHeights[i]} bg-gradient-to-t ${podiumColors[i]} rounded-t-lg mt-2 flex items-center justify-center shadow-inner`}>
                    <span className="text-white font-bold text-2xl">{entry.rank}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {myEntry && myRank > 3 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1 }}
            className="w-full max-w-md mb-4"
          >
            <Card className="p-4 border-primary/30 bg-primary/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="font-bold text-primary">{myRank}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{myEntry.name} (Siz)</p>
                  <p className="text-xs text-muted-foreground">{myEntry.correctAnswers}/{multiResult.totalQuestions} to'g'ri</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold">{myEntry.score}</p>
                  <p className="text-xs text-muted-foreground">ball</p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {rest.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="w-full max-w-md mb-6"
          >
            <Card className="overflow-hidden">
              <div className="p-3 border-b bg-muted/30">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Barcha ishtirokchilar
                </p>
              </div>
              <div className="divide-y">
                {rest.map((entry, i) => {
                  const isMe = entry.playerId === playerId;
                  const percentage = multiResult.totalQuestions > 0 ? Math.round((entry.correctAnswers / multiResult.totalQuestions) * 100) : 0;
                  return (
                    <motion.div
                      key={entry.playerId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + i * 0.03 }}
                      className={`flex items-center gap-3 p-3 ${isMe ? "bg-primary/5" : ""}`}
                      data-testid={`result-entry-${entry.playerId}`}
                    >
                      <span className="w-8 text-center text-sm font-medium text-muted-foreground">{entry.rank}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{entry.name} {isMe && "(Siz)"}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground">{percentage}%</span>
                        <span className="text-sm font-bold w-12 text-right">{entry.score}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </Card>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="flex gap-3 flex-wrap justify-center mb-8"
        >
          <Button variant="outline" onClick={handlePlayAgain} data-testid="button-play-again">
            <RotateCcw className="w-4 h-4 mr-2" />
            Qayta o'ynash
          </Button>
          <Button variant="outline" onClick={handleCopyLink} data-testid="button-share-result">
            {linkCopied ? <Check className="w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
            {linkCopied ? "Nusxalandi" : "Ulashish"}
          </Button>
          <Button onClick={() => navigate("/discover")} className="gradient-purple border-0" data-testid="button-discover">
            <Home className="w-4 h-4 mr-2" />
            Bosh sahifa
          </Button>
        </motion.div>
      </div>
    );
  }

  if (stage === "result" && submitResult) {
    const percentage = Math.round((submitResult.correctAnswers / submitResult.totalQuestions) * 100);
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted/30">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg">
          <Card className="p-8 space-y-6">
            <div className="text-center space-y-3">
              <Trophy className="w-16 h-16 mx-auto text-yellow-500" />
              <h1 className="text-2xl font-bold" data-testid="text-result-title">Natijalar</h1>
              <p className="text-muted-foreground">{submitResult.playerName}</p>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-3xl font-bold text-primary" data-testid="text-score">{submitResult.score}</p>
                <p className="text-xs text-muted-foreground">Ball</p>
              </div>
              <div>
                <p className="text-3xl font-bold" data-testid="text-correct">{submitResult.correctAnswers}/{submitResult.totalQuestions}</p>
                <p className="text-xs text-muted-foreground">To'g'ri</p>
              </div>
              <div>
                <p className="text-3xl font-bold" data-testid="text-percentage">{percentage}%</p>
                <p className="text-xs text-muted-foreground">Foiz</p>
              </div>
            </div>
            <Progress value={percentage} className="h-3" />

            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {data.questions.map((q, i) => {
                const r = submitResult.results[q.id];
                if (!r) return null;
                return (
                  <div key={q.id} className={`p-3 rounded-md border ${r.isCorrect ? "border-green-500/30 bg-green-50/50 dark:bg-green-950/20" : "border-red-500/30 bg-red-50/50 dark:bg-red-950/20"}`}>
                    <div className="flex items-start gap-2">
                      {r.isCorrect ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium" dir="auto">{i + 1}. {q.questionText}</p>
                        {!r.isCorrect && r.correctAnswer && submitResult?.showCorrectAnswers !== false && <p className="text-xs text-muted-foreground mt-1" dir="auto">To'g'ri javob: {r.correctAnswer}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 flex-wrap">
              <Button variant="outline" onClick={handlePlayAgain} data-testid="button-play-again">
                <RotateCcw className="w-4 h-4 mr-2" />
                Qayta o'ynash
              </Button>
              <Button variant="outline" onClick={handleCopyLink} data-testid="button-share-result">
                {linkCopied ? <Check className="w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
                {linkCopied ? "Nusxalandi" : "Ulashish"}
              </Button>
              <Button onClick={() => navigate("/discover")} data-testid="button-discover">
                <Home className="w-4 h-4 mr-2" />
                Discover
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (gameMode === "multi" && stage === "playing" && currentQuestion) {
    const multiCurrentAnswer = answers[currentQuestion.id];
    const progressPercent = ((questionIndex + 1) / totalQuestions) * 100;

    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-indigo-950 via-violet-950 to-slate-950 overflow-hidden">
        {connectionWarningBanner}
        <div className="sticky top-0 z-50 bg-black/30 backdrop-blur-xl border-b border-white/10 p-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Badge variant="secondary" className="shrink-0 bg-primary/20 text-primary-foreground border-primary/30">
                {questionIndex + 1}/{totalQuestions}
              </Badge>
              <span className="text-sm font-medium truncate text-white/80">{data.quiz.title}</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-xs border-white/20 text-white/70">{answeredCount}/{totalPlayers}</Badge>
              <CircularTimer timeLeft={timeLeft} totalTime={currentQuestion.timeLimit || 30} />
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">{myScore} ball</Badge>
            </div>
          </div>
          <div className="max-w-2xl mx-auto mt-2">
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400"
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-start p-4 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestion.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              className="w-full max-w-2xl"
            >
              <div
                className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 p-6 mb-6 shadow-2xl"
              >
                {currentQuestion.mediaUrl && (
                  <div className="rounded-lg overflow-hidden mb-4">
                    {currentQuestion.mediaType === "image" ? (
                      <img src={currentQuestion.mediaUrl} alt="" className="w-full max-h-64 object-contain" />
                    ) : currentQuestion.mediaType === "video" ? (
                      <video src={currentQuestion.mediaUrl} controls className="w-full max-h-64" />
                    ) : null}
                  </div>
                )}

                <p
                  className="text-xl sm:text-2xl font-bold text-white text-center leading-relaxed"
                  dir="auto"
                  data-testid="text-question"
                >
                  {currentQuestion.questionText}
                </p>
                <div className="flex items-center justify-center gap-2 mt-3">
                  <Badge className="bg-white/10 text-white/80 border-white/20">{currentQuestion.points} ball</Badge>
                  {currentQuestion.type === "multiple_select" && <Badge className="bg-violet-500/20 text-violet-200 border-violet-500/30">Bir nechta tanlang</Badge>}
                </div>
              </div>

              {hasAnswered && lastAnswerResult ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="relative"
                >
                  {lastAnswerResult.isCorrect && (
                    <div className="absolute inset-0 pointer-events-none overflow-visible">
                      {Array.from({ length: 30 }).map((_, i) => (
                        <motion.div
                          key={i}
                          className="absolute w-2 h-2 rounded-full"
                          style={{
                            left: "50%",
                            top: "50%",
                            backgroundColor: ["#10B981", "#34D399", "#6EE7B7", "#A7F3D0", "#FFD700", "#FDE68A"][i % 6],
                          }}
                          initial={{ x: 0, y: 0, opacity: 1 }}
                          animate={{
                            x: (Math.random() - 0.5) * 400,
                            y: (Math.random() - 0.5) * 300,
                            opacity: 0,
                            scale: [1, 1.5, 0],
                          }}
                          transition={{ duration: 1 + Math.random(), delay: Math.random() * 0.3 }}
                        />
                      ))}
                    </div>
                  )}
                  <div className={`rounded-xl p-8 text-center ${
                    lastAnswerResult.isCorrect
                      ? "bg-gradient-to-br from-emerald-500/30 to-green-600/30 border-2 border-emerald-400/50"
                      : "bg-gradient-to-br from-red-500/30 to-rose-600/30 border-2 border-red-400/50"
                  }`}>
                    <div>
                      {lastAnswerResult.isCorrect ? (
                        <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" />
                      ) : (
                        <XCircle className="w-16 h-16 text-red-400 mx-auto" />
                      )}
                    </div>
                    <p className={`text-2xl font-bold mt-3 ${lastAnswerResult.isCorrect ? "text-emerald-300" : "text-red-300"}`}>
                      {lastAnswerResult.isCorrect ? `To'g'ri! +${lastAnswerResult.points}` : "Noto'g'ri"}
                    </p>
                    {lastAnswerResult.answerOrder && (
                      <p className="text-base font-semibold text-amber-300 mt-2" data-testid="text-answer-order">
                        Siz {lastAnswerResult.answerOrder}-bo'lib javob berdingiz
                      </p>
                    )}
                    {!lastAnswerResult.isCorrect && lastAnswerResult.showCorrectAnswers !== false && lastAnswerResult.correctAnswer && (
                      <p className="text-sm text-white/50 mt-2" dir="auto">
                        To'g'ri javob: {lastAnswerResult.correctAnswer}
                      </p>
                    )}
                    <div className="mt-4 pt-3 border-t border-white/10">
                      <p className="text-sm text-violet-300/70 flex items-center justify-center gap-2">
                        <Clock className="w-4 h-4" />
                        Keyingi savolga o'tish uchun vaqt tugashini kuting
                      </p>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div>
                  {currentQuestion.type === "true_false" ? (
                    <div className="grid grid-cols-2 gap-4">
                      {["true", "false"].map((opt, i) => {
                        const color = i === 0 ? KAHOOT_COLORS[3] : KAHOOT_COLORS[0];
                        const isSelected = multiCurrentAnswer === opt;
                        return (
                          <motion.button
                            key={opt}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 + i * 0.05, duration: 0.2, ease: "easeOut" }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleMultiAnswer(currentQuestion.id, opt)}
                            disabled={hasAnswered}
                            className={`relative rounded-xl p-6 bg-gradient-to-br ${color.bg} ${color.text} font-bold text-lg shadow-lg transition-all ${
                              isSelected ? "ring-4 ring-white shadow-2xl scale-[1.02]" : "ring-0"
                            } disabled:opacity-50`}
                            data-testid={`button-answer-${opt}`}
                          >
                            {opt === "true" ? "To'g'ri" : "Noto'g'ri"}
                          </motion.button>
                        );
                      })}
                    </div>
                  ) : currentQuestion.type === "open_ended" ? (
                    <motion.div
                      className="space-y-3"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                    >
                      <Input
                        placeholder="Javobingizni yozing..."
                        value={(multiCurrentAnswer as string) || ""}
                        onChange={(e) => setAnswers(prev => ({ ...prev, [currentQuestion.id]: e.target.value }))}
                        disabled={hasAnswered}
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/40 text-lg"
                        data-testid="input-open-answer"
                      />
                      <Button
                        onClick={() => {
                          if (!multiCurrentAnswer) return;
                          setHasAnswered(true);
                          socketRef.current?.emit("public:answer", { questionId: currentQuestion.id, answer: multiCurrentAnswer });
                        }}
                        disabled={!multiCurrentAnswer || hasAnswered}
                        className="w-full gradient-purple border-0 text-white"
                        data-testid="button-submit-open"
                      >
                        <Send className="w-5 h-5 mr-2" />
                        Yuborish
                      </Button>
                    </motion.div>
                  ) : currentQuestion.options ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {currentQuestion.options.map((opt, optIdx) => {
                        const color = KAHOOT_COLORS[optIdx % KAHOOT_COLORS.length];
                        const IconComp = color.icon;
                        const isSelected = currentQuestion.type === "multiple_select"
                          ? Array.isArray(multiCurrentAnswer) && multiCurrentAnswer.includes(opt)
                          : multiCurrentAnswer === opt;
                        return (
                          <motion.button
                            key={optIdx}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 + optIdx * 0.05, duration: 0.2, ease: "easeOut" }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleMultiAnswer(currentQuestion.id, opt)}
                            disabled={hasAnswered && currentQuestion.type !== "multiple_select"}
                            className={`relative rounded-xl p-4 sm:p-5 bg-gradient-to-br ${color.bg} ${color.text} text-left shadow-lg transition-all ${
                              isSelected ? "ring-4 ring-white shadow-2xl scale-[1.02]" : "ring-0"
                            } disabled:opacity-50`}
                            data-testid={`button-option-${optIdx}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                                <IconComp className="w-4 h-4" />
                              </div>
                              <span className="font-semibold text-sm sm:text-base break-words" dir="auto">{opt}</span>
                            </div>
                            {isSelected && (
                              <div
                                className="absolute top-2 right-2"
                              >
                                <Check className="w-5 h-5 text-white drop-shadow" />
                              </div>
                            )}
                          </motion.button>
                        );
                      })}
                      {currentQuestion.type === "multiple_select" && !hasAnswered && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.25 }}
                          className="sm:col-span-2"
                        >
                          <Button
                            onClick={handleSubmitMultiSelect}
                            disabled={!multiCurrentAnswer || (Array.isArray(multiCurrentAnswer) && multiCurrentAnswer.length === 0)}
                            className="w-full gradient-purple border-0 text-white"
                            data-testid="button-submit-multi"
                          >
                            <Send className="w-5 h-5 mr-2" />
                            Tasdiqlash
                          </Button>
                        </motion.div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    );
  }

  if (gameMode === "solo" && soloCurrentQuestion) {
    const soloAnswer = answers[soloCurrentQuestion.id];
    const soloIsLast = currentIndex === data.questions.length - 1;
    const progressPercent = ((currentIndex + 1) / data.questions.length) * 100;

    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-indigo-950 via-violet-950 to-slate-950 overflow-hidden">
        <div className="sticky top-0 z-50 bg-black/30 backdrop-blur-xl border-b border-white/10 p-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <motion.div
                key={currentIndex}
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <Badge variant="secondary" className="shrink-0 bg-primary/20 text-primary-foreground border-primary/30">
                  {currentIndex + 1}/{data.questions.length}
                </Badge>
              </motion.div>
              <span className="text-sm font-medium truncate text-white/80">{data.quiz.title}</span>
            </div>
            <CircularTimer timeLeft={timeLeft} totalTime={soloCurrentQuestion.timeLimit || 30} />
          </div>
          <div className="max-w-2xl mx-auto mt-2">
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400"
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-start p-4 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              className="w-full max-w-2xl"
            >
              <div
                className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 p-6 mb-6 shadow-2xl"
              >
                {soloCurrentQuestion.mediaUrl && (
                  <div className="rounded-lg overflow-hidden mb-4">
                    {soloCurrentQuestion.mediaType === "image" ? (
                      <img src={soloCurrentQuestion.mediaUrl} alt="" className="w-full max-h-64 object-contain" />
                    ) : soloCurrentQuestion.mediaType === "video" ? (
                      <video src={soloCurrentQuestion.mediaUrl} controls className="w-full max-h-64" />
                    ) : null}
                  </div>
                )}

                <p
                  className="text-xl sm:text-2xl font-bold text-white text-center leading-relaxed"
                  dir="auto"
                  data-testid="text-question"
                >
                  {soloCurrentQuestion.questionText}
                </p>
                <div className="flex items-center justify-center gap-2 mt-3">
                  <Badge className="bg-white/10 text-white/80 border-white/20">{soloCurrentQuestion.points} ball</Badge>
                  {soloCurrentQuestion.type === "multiple_select" && <Badge className="bg-violet-500/20 text-violet-200 border-violet-500/30">Bir nechta tanlang</Badge>}
                </div>
              </div>

              <div>
                {soloCurrentQuestion.type === "true_false" ? (
                  <div className="grid grid-cols-2 gap-4">
                    {["true", "false"].map((opt, i) => {
                      const color = i === 0 ? KAHOOT_COLORS[3] : KAHOOT_COLORS[0];
                      const isSelected = soloAnswer === opt;
                      return (
                        <motion.button
                          key={opt}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 + i * 0.05, duration: 0.2, ease: "easeOut" }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => handleSoloAnswer(soloCurrentQuestion.id, opt)}
                          className={`relative rounded-xl p-6 bg-gradient-to-br ${color.bg} ${color.text} font-bold text-lg shadow-lg transition-all ${
                            isSelected ? "ring-4 ring-white shadow-2xl scale-[1.02]" : "ring-0"
                          }`}
                          data-testid={`button-answer-${opt}`}
                        >
                          {opt === "true" ? "To'g'ri" : "Noto'g'ri"}
                        </motion.button>
                      );
                    })}
                  </div>
                ) : soloCurrentQuestion.type === "open_ended" ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <Input
                      placeholder="Javobingizni yozing..."
                      value={(soloAnswer as string) || ""}
                      onChange={(e) => handleSoloAnswer(soloCurrentQuestion.id, e.target.value)}
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/40 text-lg"
                      data-testid="input-open-answer"
                    />
                  </motion.div>
                ) : soloCurrentQuestion.options ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {soloCurrentQuestion.options.map((opt, optIdx) => {
                      const color = KAHOOT_COLORS[optIdx % KAHOOT_COLORS.length];
                      const IconComp = color.icon;
                      const isSelected = soloCurrentQuestion.type === "multiple_select"
                        ? Array.isArray(soloAnswer) && soloAnswer.includes(opt)
                        : soloAnswer === opt;
                      return (
                        <motion.button
                          key={optIdx}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 + optIdx * 0.05, duration: 0.2, ease: "easeOut" }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => handleSoloAnswer(soloCurrentQuestion.id, opt)}
                          className={`relative rounded-xl p-4 sm:p-5 bg-gradient-to-br ${color.bg} ${color.text} text-left shadow-lg transition-all ${
                            isSelected ? "ring-4 ring-white shadow-2xl scale-[1.02]" : "ring-0"
                          }`}
                          data-testid={`button-option-${optIdx}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                              <IconComp className="w-4 h-4" />
                            </div>
                            <span className="font-semibold text-sm sm:text-base break-words" dir="auto">{opt}</span>
                          </div>
                          {isSelected && (
                            <div className="absolute top-2 right-2">
                              <Check className="w-5 h-5 text-white drop-shadow" />
                            </div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="sticky bottom-0 z-50 bg-black/30 backdrop-blur-xl border-t border-white/10 p-3">
          <div className="max-w-2xl mx-auto flex justify-between gap-3">
            <Button variant="outline" onClick={() => setCurrentIndex(i => i - 1)} disabled={currentIndex === 0} data-testid="button-prev">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Oldingi
            </Button>
            {soloIsLast ? (
              <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="gradient-purple border-0 text-white" data-testid="button-submit">
                <Send className="w-4 h-4 mr-2" />
                {submitMutation.isPending ? "Yuborilmoqda..." : "Yakunlash"}
              </Button>
            ) : (
              <Button onClick={() => setCurrentIndex(i => i + 1)} data-testid="button-next">
                Keyingi
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
