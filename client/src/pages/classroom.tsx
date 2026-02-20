import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { io as socketIO, Socket } from "socket.io-client";
import {
  Copy,
  Check,
  Play,
  Users,
  Trophy,
  Home,
  Crown,
  Medal,
  Star,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Loader2,
  Share2,
  Link2,
} from "lucide-react";

const SEAT_POSITIONS = [
  { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 },
  { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 }, { row: 1, col: 4 },
  { row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 },
  { row: 3, col: 0 }, { row: 3, col: 1 }, { row: 3, col: 2 }, { row: 3, col: 3 }, { row: 3, col: 4 },
  { row: 4, col: 0 }, { row: 4, col: 1 }, { row: 4, col: 2 }, { row: 4, col: 3 }, { row: 4, col: 4 },
  { row: 5, col: 0 }, { row: 5, col: 1 }, { row: 5, col: 2 }, { row: 5, col: 3 }, { row: 5, col: 4 },
];

const AVATAR_COLORS = [
  "#4F46E5", "#7C3AED", "#2563EB", "#0891B2", "#059669",
  "#D97706", "#DC2626", "#DB2777", "#7C3AED", "#4338CA",
  "#0D9488", "#65A30D", "#EA580C", "#9333EA", "#2563EB",
  "#C026D3", "#0284C7", "#16A34A", "#E11D48", "#8B5CF6",
  "#F59E0B", "#10B981", "#6366F1", "#EC4899", "#14B8A6",
  "#EF4444", "#8B5CF6", "#06B6D4", "#84CC16", "#F97316",
];

function StudentAvatar({ name, color, size = 48, status }: { name: string; color: string; size?: number; status?: "correct" | "wrong" | "answered" | "idle" }) {
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const borderColor = status === "correct" ? "#22c55e" : status === "wrong" ? "#ef4444" : status === "answered" ? "#f59e0b" : "transparent";
  const glowShadow = status === "correct" ? "0 0 12px #22c55e" : status === "wrong" ? "0 0 12px #ef4444" : status === "answered" ? "0 0 8px #f59e0b" : "none";

  return (
    <div className="flex flex-col items-center gap-1" data-testid={`avatar-${name}`}>
      <motion.div
        animate={status === "correct" ? { scale: [1, 1.15, 1] } : status === "wrong" ? { x: [0, -4, 4, -4, 0] } : {}}
        transition={{ duration: 0.5 }}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: color,
          border: `3px solid ${borderColor}`,
          boxShadow: glowShadow,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "border-color 0.3s, box-shadow 0.3s",
        }}
      >
        <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="14" r="8" fill="white" opacity="0.9" />
          <path d="M6 36c0-7.732 6.268-14 14-14s14 6.268 14 14" fill="white" opacity="0.9" />
        </svg>
      </motion.div>
      <span className="text-[10px] sm:text-xs font-medium text-white truncate max-w-[60px] sm:max-w-[80px] text-center leading-tight drop-shadow-md">
        {name}
      </span>
    </div>
  );
}

function TeacherAvatar({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center gap-1" data-testid="avatar-teacher">
      <div className="relative">
        <div
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #1e40af, #3b82f6)" }}
        >
          <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="14" r="8" fill="white" opacity="0.95" />
            <path d="M6 36c0-7.732 6.268-14 14-14s14 6.268 14 14" fill="white" opacity="0.95" />
          </svg>
        </div>
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center shadow-md">
          <Crown className="w-3.5 h-3.5 text-amber-900" />
        </div>
      </div>
      <span className="text-xs sm:text-sm font-bold text-white drop-shadow-md">{name}</span>
      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-blue-600 text-white border-0">
        O'qituvchi
      </Badge>
    </div>
  );
}

function Desk({ children, occupied }: { children?: React.ReactNode; occupied: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center"
    >
      {children && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="mb-1"
        >
          {children}
        </motion.div>
      )}
      <div
        className={`w-14 h-6 sm:w-16 sm:h-7 rounded-md shadow-inner ${
          occupied
            ? "bg-amber-800/80 border border-amber-700/60"
            : "bg-amber-900/30 border border-amber-800/20"
        }`}
        style={{
          background: occupied
            ? "linear-gradient(180deg, #92400e 0%, #78350f 100%)"
            : "linear-gradient(180deg, rgba(120,53,15,0.2) 0%, rgba(69,26,3,0.15) 100%)",
        }}
      />
    </motion.div>
  );
}

function Blackboard({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="relative mx-auto w-full max-w-2xl" data-testid="blackboard">
      <div
        className="rounded-lg p-1 sm:p-1.5"
        style={{ background: "linear-gradient(135deg, #78350f 0%, #92400e 50%, #78350f 100%)" }}
      >
        <div
          className="rounded-md px-4 py-5 sm:px-6 sm:py-6 min-h-[160px] sm:min-h-[200px] relative overflow-hidden"
          style={{
            background: "linear-gradient(145deg, #064e3b 0%, #065f46 30%, #047857 60%, #064e3b 100%)",
          }}
        >
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)`,
              backgroundSize: "20px 20px",
            }}
          />
          {title && (
            <div className="text-center mb-3">
              <span className="text-white/50 text-xs font-mono tracking-wider uppercase">{title}</span>
            </div>
          )}
          <div className="relative z-10">{children}</div>
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-2">
            <div className="w-8 h-1 rounded-full bg-white/10" />
            <div className="w-12 h-1 rounded-full bg-yellow-300/20" />
            <div className="w-6 h-1 rounded-full bg-white/10" />
          </div>
        </div>
      </div>
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-20 h-3 rounded-b-lg"
        style={{ background: "linear-gradient(180deg, #78350f 0%, #451a03 100%)" }}
      />
    </div>
  );
}

function ClassroomTimer({ timeLeft, totalTime }: { timeLeft: number; totalTime: number }) {
  const isUrgent = timeLeft <= 5;
  const progress = totalTime > 0 ? (timeLeft / totalTime) * 100 : 0;

  return (
    <div className="flex items-center gap-2" data-testid="timer">
      <Clock className={`w-4 h-4 ${isUrgent ? "text-red-400 animate-pulse" : "text-white/70"}`} />
      <div className="w-24 sm:w-32 h-2 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${isUrgent ? "bg-red-500" : timeLeft <= 10 ? "bg-amber-400" : "bg-emerald-400"}`}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.8, ease: "linear" }}
        />
      </div>
      <span className={`text-sm font-bold font-mono min-w-[28px] text-right ${isUrgent ? "text-red-400" : "text-white/90"}`}>
        {timeLeft}
      </span>
    </div>
  );
}

const OPTION_COLORS = [
  { bg: "from-red-500 to-rose-600" },
  { bg: "from-blue-500 to-indigo-600" },
  { bg: "from-amber-400 to-yellow-500" },
  { bg: "from-emerald-500 to-green-600" },
  { bg: "from-purple-500 to-violet-600" },
  { bg: "from-pink-500 to-fuchsia-600" },
  { bg: "from-cyan-500 to-teal-600" },
  { bg: "from-orange-500 to-red-500" },
];

interface QuizQuestion {
  id: string;
  questionText: string;
  type: string;
  options: string[] | null;
  points: number;
  timeLimit: number;
  mediaUrl: string | null;
  mediaType?: string | null;
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

interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  correctAnswers: number;
  playerId: string;
}

type GameStage = "name" | "lobby" | "playing" | "leaderboard" | "result";

export default function ClassroomQuizPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const socketRef = useRef<Socket | null>(null);

  const autoParams = new URLSearchParams(window.location.search);
  const autoJoinCode = autoParams.get("joinCode") || "";
  const autoName = autoParams.get("autoName") || "";

  const [stage, setStage] = useState<GameStage>(autoJoinCode && autoName ? "lobby" : "name");
  const [playerName, setPlayerName] = useState(autoName);
  const [roomCode, setRoomCode] = useState(autoJoinCode);
  const [roomId, setRoomId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState<{ playerId: string; name: string }[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion | null>(null);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTime, setTotalTime] = useState(30);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [multiSelectAnswers, setMultiSelectAnswers] = useState<string[]>([]);
  const [lastAnswerResult, setLastAnswerResult] = useState<{ isCorrect: boolean; points: number; correctAnswer?: string } | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myScore, setMyScore] = useState(0);
  const [isLastQuestion, setIsLastQuestion] = useState(false);
  const [multiResult, setMultiResult] = useState<{ leaderboard: LeaderboardEntry[]; totalQuestions: number; maxScore: number; quizTitle: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [autoJoined, setAutoJoined] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinMode, setJoinMode] = useState<"create" | "join" | null>(null);
  const [playerStatuses, setPlayerStatuses] = useState<Record<string, "correct" | "wrong" | "answered" | "idle">>({});
  const reconnectInfoRef = useRef<{ code: string; playerName: string; playerId: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const disconnectedSinceRef = useRef<number | null>(null);
  const [showConnectionWarning, setShowConnectionWarning] = useState(false);
  const connectionWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, isLoading } = useQuery<QuizData>({
    queryKey: ["/api/quizzes", id, "play"],
    queryFn: async () => {
      const res = await fetch(`/api/quizzes/${id}/play`);
      if (!res.ok) throw new Error("Quiz topilmadi");
      return res.json();
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (timeLeft > 0 && stage === "playing" && !hasAnswered) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeft > 0, stage, hasAnswered]);

  const connectSocket = useCallback(() => {
    if (socketRef.current?.connected) return socketRef.current;

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
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
      keepAliveRef.current = setInterval(() => {
        if (s.connected) s.emit("ping-keepalive");
      }, 25000);
    });

    s.on("disconnect", (reason) => {
      if (keepAliveRef.current) {
        clearInterval(keepAliveRef.current);
        keepAliveRef.current = null;
      }
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
            setTimeout(() => {
              s.emit("public:request-state", {}, (stateRes: any) => {
                if (!stateRes?.success) return;
                if (stateRes.gameStatus === "finished") {
                  setMultiResult({
                    leaderboard: stateRes.leaderboard,
                    totalQuestions: stateRes.totalQuestions,
                    maxScore: stateRes.maxScore,
                    quizTitle: stateRes.quizTitle,
                  });
                  setMyScore(stateRes.myScore || 0);
                  setStage("result");
                } else if (stateRes.gameStatus === "playing" && stateRes.question) {
                  setCurrentQuestion(stateRes.question);
                  setQuestionIndex(stateRes.questionIndex);
                  setTotalQuestions(stateRes.totalQuestions);
                  setTimeLeft(stateRes.question.timeLimit || 0);
                  setTotalTime(stateRes.question.timeLimit || 30);
                  setHasAnswered(stateRes.hasAnswered || false);
                  setMyScore(stateRes.myScore || 0);
                  setLastAnswerResult(null);
                  setStage("playing");
                } else if (stateRes.gameStatus === "waiting") {
                  if (stateRes.players) setPlayers(stateRes.players);
                  setStage("lobby");
                }
              });
            }, 300);
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
      setPlayerStatuses({});
    });

    s.on("public:question", (data) => {
      setCurrentQuestion(data.question);
      setQuestionIndex(data.index);
      setTotalQuestions(data.total);
      const tl = data.question.timeLimit || 30;
      setTimeLeft(tl);
      setTotalTime(tl);
      setHasAnswered(false);
      setSelectedAnswer(null);
      setMultiSelectAnswers([]);
      setLastAnswerResult(null);
      setAnsweredCount(0);
      setStage("playing");
      setPlayerStatuses({});
    });

    s.on("public:answer-result", (data) => {
      setLastAnswerResult({ isCorrect: data.isCorrect, points: data.points, correctAnswer: data.correctAnswer });
      setMyScore(data.totalScore);
    });

    s.on("public:answer-received", (data) => {
      setAnsweredCount(data.answeredCount);
      setTotalPlayers(data.totalPlayers);
      if (data.playerId) {
        setPlayerStatuses(prev => ({ ...prev, [data.playerId]: "answered" }));
      }
    });

    s.on("public:leaderboard", (data) => {
      setLeaderboard(data.leaderboard);
      setIsLastQuestion(data.isLast);
      setStage("leaderboard");
    });

    s.on("public:game-finished", (data) => {
      setMultiResult(data);
      setStage("result");
    });

    s.on("public:host-changed", (data) => {
      setPlayerId((currentPid) => {
        if (data.newHostId === currentPid) setIsHost(true);
        return currentPid;
      });
    });

    return s;
  }, []);

  useEffect(() => {
    return () => {
      if (connectionWarningTimerRef.current) {
        clearTimeout(connectionWarningTimerRef.current);
      }
      socketRef.current?.disconnect();
    };
  }, []);

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
        setIsHost(res.isHost || false);
        setPlayers(res.players);
        setTotalQuestions(res.totalQuestions);
        reconnectInfoRef.current = { code: joinCode.trim(), playerName: playerName.trim(), playerId: res.playerId };
        if (res.rejoinToken) {
          localStorage.setItem(`rejoin_${joinCode.trim()}_${playerName.trim().toLowerCase()}`, res.rejoinToken);
        }
        if (res.isRejoin) setMyScore(res.currentScore || 0);
        if (res.alreadyAnsweredCurrent) setHasAnswered(true);
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
            setIsHost(res.isHost || false);
            setPlayers(res.players);
            setTotalQuestions(res.totalQuestions);
            reconnectInfoRef.current = { code: autoJoinCode, playerName: autoName, playerId: res.playerId };
            if (res.rejoinToken) localStorage.setItem(`rejoin_${autoJoinCode}_${autoName.trim().toLowerCase()}`, res.rejoinToken);
            if (res.isRejoin) setMyScore(res.currentScore || 0);
            if (res.isLateJoin) setStage("playing");
            else setStage("lobby");
          } else {
            toast({ title: res.error || "Qo'shilishda xatolik", variant: "destructive" });
            setStage("name");
          }
        });
      };
      if (s.connected) doJoin();
      else s.once("connect", doJoin);
    }
  }, [autoJoinCode, autoName, autoJoined, data]);

  const handleStartGame = () => {
    socketRef.current?.emit("public:start-game", {}, (res: any) => {
      if (!res.success) {
        toast({ title: res.error || "O'yinni boshlashda xatolik", variant: "destructive" });
      }
    });
  };

  const handleAnswer = (questionId: string, answer: string) => {
    if (hasAnswered || !currentQuestion) return;

    if (currentQuestion.type === "multiple_select") {
      setMultiSelectAnswers(prev =>
        prev.includes(answer) ? prev.filter(a => a !== answer) : [...prev, answer]
      );
    } else {
      setSelectedAnswer(answer);
      setHasAnswered(true);
      socketRef.current?.emit("public:answer", { questionId, answer });
    }
  };

  const handleSubmitMultiSelect = () => {
    if (!currentQuestion || hasAnswered || multiSelectAnswers.length === 0) return;
    setHasAnswered(true);
    socketRef.current?.emit("public:answer", {
      questionId: currentQuestion.id,
      answer: multiSelectAnswers.join(","),
    });
  };

  const handleNextQuestion = () => {
    if (!isHost) return;
    socketRef.current?.emit("public:next-question", {});
  };

  const copyLink = () => {
    const url = `${window.location.origin}/classroom/${id}?joinCode=${roomCode}&autoName=`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    toast({ title: "Kod nusxalandi!" });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)" }}>
        <Loader2 className="w-8 h-8 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #334155 0%, #1e293b 40%, #44403c 70%, #292524 100%)",
      }}
      data-testid="classroom-page"
    >
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 80px, rgba(255,255,255,0.03) 80px, rgba(255,255,255,0.03) 81px), repeating-linear-gradient(0deg, transparent, transparent 80px, rgba(255,255,255,0.03) 80px, rgba(255,255,255,0.03) 81px)",
        }}
      />

      {showConnectionWarning && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-500/90 text-white text-center py-1 px-3 text-xs font-medium" data-testid="banner-connection-warning">
          Internet aloqasini tekshiring
        </div>
      )}

      <AnimatePresence mode="wait">
        {stage === "name" && (
          <motion.div
            key="name"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative z-10 min-h-screen flex items-center justify-center p-4"
          >
            <div className="w-full max-w-md space-y-6">
              <Blackboard title={data?.quiz.title || "Quiz"}>
                <div className="text-center space-y-4">
                  <h2 className="text-xl sm:text-2xl font-bold text-white" style={{ fontFamily: "'Segoe UI', sans-serif" }}>
                    Sinf Xonaga Xush Kelibsiz!
                  </h2>
                  <p className="text-white/60 text-sm">
                    {data?.quiz.description || "Interaktiv sinf xona quizi"}
                  </p>
                </div>
              </Blackboard>

              <div className="space-y-3 mt-8">
                <Input
                  placeholder="Ismingizni kiriting..."
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="h-12 text-center text-lg bg-white/10 border-white/20 text-white placeholder:text-white/40"
                  data-testid="input-player-name"
                  onKeyDown={(e) => e.key === "Enter" && playerName.trim() && !joinMode && setJoinMode("create")}
                />

                {!joinMode && (
                  <div className="flex gap-3">
                    <Button
                      onClick={() => setJoinMode("create")}
                      disabled={!playerName.trim()}
                      className="flex-1 h-12 bg-gradient-to-r from-emerald-500 to-green-600 text-white border-0"
                      data-testid="button-create-room"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Xona Yaratish
                    </Button>
                    <Button
                      onClick={() => setJoinMode("join")}
                      disabled={!playerName.trim()}
                      variant="outline"
                      className="flex-1 h-12 border-white/30 text-white bg-white/5"
                      data-testid="button-join-room"
                    >
                      <Users className="w-4 h-4 mr-2" />
                      Qo'shilish
                    </Button>
                  </div>
                )}

                {joinMode === "create" && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                    <Button
                      onClick={handleCreateRoom}
                      disabled={connecting || !playerName.trim()}
                      className="w-full h-12 bg-gradient-to-r from-emerald-500 to-green-600 text-white border-0"
                      data-testid="button-confirm-create"
                    >
                      {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                      Sinfni Ochish
                    </Button>
                    <Button variant="ghost" onClick={() => setJoinMode(null)} className="w-full mt-2 text-white/50">
                      <ArrowLeft className="w-4 h-4 mr-1" /> Orqaga
                    </Button>
                  </motion.div>
                )}

                {joinMode === "join" && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-3">
                    <Input
                      placeholder="Xona kodini kiriting..."
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      className="h-12 text-center text-lg tracking-widest bg-white/10 border-white/20 text-white placeholder:text-white/40 font-mono"
                      maxLength={6}
                      data-testid="input-join-code"
                    />
                    <Button
                      onClick={handleJoinRoom}
                      disabled={connecting || !playerName.trim() || joinCode.length < 6}
                      className="w-full h-12 bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0"
                      data-testid="button-confirm-join"
                    >
                      {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
                      Sinfga Kirish
                    </Button>
                    <Button variant="ghost" onClick={() => setJoinMode(null)} className="w-full text-white/50">
                      <ArrowLeft className="w-4 h-4 mr-1" /> Orqaga
                    </Button>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {stage === "lobby" && (
          <motion.div
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 min-h-screen flex flex-col p-3 sm:p-4"
          >
            <div className="mb-4 sm:mb-6">
              <Blackboard title={data?.quiz.title}>
                <div className="text-center space-y-3">
                  <h2 className="text-lg sm:text-xl font-bold text-white">
                    O'quvchilarni kutmoqda...
                  </h2>
                  <div className="flex items-center justify-center gap-3">
                    <div
                      className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center gap-2 cursor-pointer"
                      onClick={copyCode}
                      data-testid="lobby-room-code"
                    >
                      <span className="text-2xl sm:text-3xl font-mono font-bold text-white tracking-[0.2em]">
                        {roomCode}
                      </span>
                      {linkCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white/50" />}
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-white/60 text-sm">
                    <Users className="w-4 h-4" />
                    <span>{players.length} o'quvchi</span>
                  </div>
                </div>
              </Blackboard>
            </div>

            <div className="flex-1 flex flex-col items-center">
              {isHost && (
                <div className="mb-4">
                  <TeacherAvatar name={playerName} />
                </div>
              )}

              <div className="grid grid-cols-5 gap-x-3 gap-y-4 sm:gap-x-5 sm:gap-y-5 max-w-xl mx-auto">
                {SEAT_POSITIONS.slice(0, Math.max(players.length + 5, 15)).map((pos, idx) => {
                  const playerAtSeat = isHost
                    ? players.filter(p => p.playerId !== playerId)[idx]
                    : (idx === 0 ? players.find(p => p.playerId === playerId) : players.filter(p => p.playerId !== playerId)[idx - 1]);
                  const occupied = !!playerAtSeat;

                  return (
                    <Desk key={`seat-${idx}`} occupied={occupied}>
                      {occupied && (
                        <StudentAvatar
                          name={playerAtSeat!.name}
                          color={AVATAR_COLORS[idx % AVATAR_COLORS.length]}
                          size={40}
                          status="idle"
                        />
                      )}
                    </Desk>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex flex-col items-center gap-2">
              {isHost && (
                <Button
                  onClick={handleStartGame}
                  disabled={players.length < 1}
                  className="h-12 px-8 bg-gradient-to-r from-emerald-500 to-green-600 text-white text-lg border-0"
                  data-testid="button-start-game"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Darsni Boshlash
                </Button>
              )}
              <Button variant="ghost" onClick={copyLink} className="text-white/50 text-sm" data-testid="button-share-link">
                {linkCopied ? <Check className="w-4 h-4 mr-1" /> : <Share2 className="w-4 h-4 mr-1" />}
                Havolani Ulashish
              </Button>
            </div>
          </motion.div>
        )}

        {stage === "playing" && currentQuestion && (
          <motion.div
            key="playing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 min-h-screen flex flex-col p-3 sm:p-4"
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <Badge variant="secondary" className="bg-white/10 text-white border-0">
                {questionIndex + 1}/{totalQuestions}
              </Badge>
              <ClassroomTimer timeLeft={timeLeft} totalTime={totalTime} />
              <Badge variant="secondary" className="bg-white/10 text-white border-0">
                <Trophy className="w-3 h-3 mr-1" />
                {myScore}
              </Badge>
            </div>

            <Blackboard>
              <div className="text-center space-y-3">
                <p className="text-white text-base sm:text-lg md:text-xl font-medium leading-relaxed" data-testid="question-text">
                  {currentQuestion.questionText}
                </p>
                {currentQuestion.mediaUrl && (
                  <div className="flex justify-center">
                    {currentQuestion.mediaType === "video" ? (
                      <video src={currentQuestion.mediaUrl} controls className="max-h-32 rounded-md" />
                    ) : (
                      <img src={currentQuestion.mediaUrl} alt="" className="max-h-32 rounded-md object-contain" />
                    )}
                  </div>
                )}

                {lastAnswerResult && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${
                      lastAnswerResult.isCorrect ? "bg-emerald-500/30" : "bg-red-500/30"
                    }`}
                    data-testid="answer-feedback"
                  >
                    {lastAnswerResult.isCorrect ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-400" />
                    )}
                    <span className="text-white font-medium">
                      {lastAnswerResult.isCorrect ? `To'g'ri! +${lastAnswerResult.points}` : "Noto'g'ri!"}
                    </span>
                  </motion.div>
                )}

                {hasAnswered && !lastAnswerResult && (
                  <div className="flex items-center justify-center gap-2 text-white/60">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Javobingiz qabul qilindi</span>
                  </div>
                )}
              </div>
            </Blackboard>

            {!hasAnswered && currentQuestion.options && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 max-w-2xl mx-auto w-full" data-testid="answer-options">
                {currentQuestion.options.map((opt, idx) => {
                  const color = OPTION_COLORS[idx % OPTION_COLORS.length];
                  const isSelected = currentQuestion.type === "multiple_select"
                    ? multiSelectAnswers.includes(opt)
                    : selectedAnswer === opt;

                  return (
                    <motion.button
                      key={opt}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleAnswer(currentQuestion.id, opt)}
                      className={`relative p-4 rounded-lg text-white font-medium text-left bg-gradient-to-r ${color.bg} transition-all active-elevate-2 ${
                        isSelected ? "ring-2 ring-white ring-offset-2 ring-offset-transparent" : ""
                      }`}
                      data-testid={`answer-option-${idx}`}
                    >
                      <span className="text-sm sm:text-base">{opt}</span>
                      {isSelected && currentQuestion.type === "multiple_select" && (
                        <CheckCircle2 className="absolute top-2 right-2 w-5 h-5" />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            )}

            {!hasAnswered && currentQuestion.type === "multiple_select" && multiSelectAnswers.length > 0 && (
              <div className="flex justify-center mt-3">
                <Button
                  onClick={handleSubmitMultiSelect}
                  className="bg-gradient-to-r from-emerald-500 to-green-600 text-white border-0"
                  data-testid="button-submit-multi-select"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Tasdiqlash ({multiSelectAnswers.length})
                </Button>
              </div>
            )}

            {hasAnswered && currentQuestion.options && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 max-w-2xl mx-auto w-full opacity-60" data-testid="answer-options-disabled">
                {currentQuestion.options.map((opt, idx) => {
                  const color = OPTION_COLORS[idx % OPTION_COLORS.length];
                  const isCorrect = lastAnswerResult?.correctAnswer === opt;
                  const wasSelected = selectedAnswer === opt || multiSelectAnswers.includes(opt);

                  return (
                    <div
                      key={opt}
                      className={`relative p-4 rounded-lg text-white font-medium text-left bg-gradient-to-r ${color.bg} ${
                        isCorrect ? "ring-2 ring-emerald-400" : wasSelected && !lastAnswerResult?.isCorrect ? "ring-2 ring-red-400" : ""
                      }`}
                    >
                      <span className="text-sm sm:text-base">{opt}</span>
                      {isCorrect && <CheckCircle2 className="absolute top-2 right-2 w-5 h-5 text-emerald-300" />}
                      {wasSelected && !isCorrect && lastAnswerResult && <XCircle className="absolute top-2 right-2 w-5 h-5 text-red-300" />}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex flex-col items-center">
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2 max-w-xl">
                {players.filter(p => !isHost || p.playerId !== playerId).map((p, idx) => (
                  <StudentAvatar
                    key={p.playerId}
                    name={p.name}
                    color={AVATAR_COLORS[idx % AVATAR_COLORS.length]}
                    size={32}
                    status={playerStatuses[p.playerId] || "idle"}
                  />
                ))}
              </div>
              <div className="mt-2 text-white/40 text-xs">
                {answeredCount}/{totalPlayers || players.length} javob berdi
              </div>
            </div>
          </motion.div>
        )}

        {stage === "leaderboard" && (
          <motion.div
            key="leaderboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 min-h-screen flex flex-col p-3 sm:p-4"
          >
            <Blackboard title={`${questionIndex + 1}-savol natijalari`}>
              <div className="text-center mb-4">
                <h2 className="text-xl font-bold text-white">Reytinglar</h2>
              </div>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {leaderboard.slice(0, 10).map((entry, idx) => {
                  const isMe = entry.playerId === playerId;
                  return (
                    <motion.div
                      key={entry.playerId}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: idx * 0.08 }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md ${isMe ? "bg-white/15" : "bg-white/5"}`}
                    >
                      <span className="w-6 text-center font-bold text-white/80 text-sm">
                        {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`}
                      </span>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold"
                          style={{ backgroundColor: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
                        >
                          {entry.name[0]}
                        </div>
                        <span className={`text-sm truncate ${isMe ? "text-yellow-300 font-bold" : "text-white/90"}`}>
                          {entry.name}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-white/80">{entry.score}</span>
                    </motion.div>
                  );
                })}
              </div>
            </Blackboard>

            <div className="mt-6 flex flex-col items-center">
              <div className="grid grid-cols-5 gap-x-3 gap-y-4 sm:gap-x-5 sm:gap-y-5 max-w-xl mx-auto">
                {players.filter(p => !isHost || p.playerId !== playerId).slice(0, 20).map((p, idx) => {
                  const entry = leaderboard.find(l => l.playerId === p.playerId);
                  const rank = entry?.rank || 999;
                  const status: "correct" | "wrong" | "idle" = rank <= 3 ? "correct" : "idle";
                  return (
                    <Desk key={p.playerId} occupied>
                      <StudentAvatar
                        name={p.name}
                        color={AVATAR_COLORS[idx % AVATAR_COLORS.length]}
                        size={36}
                        status={status}
                      />
                    </Desk>
                  );
                })}
              </div>
            </div>

            {isHost && !isLastQuestion && (
              <div className="mt-6 flex justify-center">
                <Button
                  onClick={handleNextQuestion}
                  className="h-12 px-8 bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0"
                  data-testid="button-next-question"
                >
                  Keyingi Savol
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {stage === "result" && multiResult && (
          <motion.div
            key="result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4"
          >
            <Blackboard title={multiResult.quizTitle}>
              <div className="text-center space-y-4">
                <h2 className="text-2xl font-bold text-white">Yakuniy Natijalar</h2>

                <div className="flex justify-center items-end gap-4 sm:gap-8 mt-4 mb-6 min-h-[140px]">
                  {multiResult.leaderboard.length >= 2 && (
                    <motion.div
                      initial={{ y: 40, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="flex flex-col items-center"
                    >
                      <StudentAvatar
                        name={multiResult.leaderboard[1].name}
                        color={AVATAR_COLORS[1]}
                        size={44}
                        status="correct"
                      />
                      <div className="mt-1 bg-gray-400/30 rounded-t-md w-16 h-16 flex items-center justify-center">
                        <div className="text-center">
                          <Medal className="w-5 h-5 text-gray-300 mx-auto" />
                          <span className="text-xs text-white/80 font-bold">{multiResult.leaderboard[1].score}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {multiResult.leaderboard.length >= 1 && (
                    <motion.div
                      initial={{ y: 40, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.1 }}
                      className="flex flex-col items-center"
                    >
                      <StudentAvatar
                        name={multiResult.leaderboard[0].name}
                        color={AVATAR_COLORS[0]}
                        size={52}
                        status="correct"
                      />
                      <div className="mt-1 bg-amber-500/30 rounded-t-md w-20 h-24 flex items-center justify-center">
                        <div className="text-center">
                          <Crown className="w-6 h-6 text-amber-400 mx-auto" />
                          <span className="text-sm text-white font-bold">{multiResult.leaderboard[0].score}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {multiResult.leaderboard.length >= 3 && (
                    <motion.div
                      initial={{ y: 40, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="flex flex-col items-center"
                    >
                      <StudentAvatar
                        name={multiResult.leaderboard[2].name}
                        color={AVATAR_COLORS[2]}
                        size={40}
                        status="correct"
                      />
                      <div className="mt-1 bg-orange-600/30 rounded-t-md w-14 h-12 flex items-center justify-center">
                        <div className="text-center">
                          <Star className="w-4 h-4 text-orange-400 mx-auto" />
                          <span className="text-xs text-white/80 font-bold">{multiResult.leaderboard[2].score}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </Blackboard>

            <div className="mt-6 w-full max-w-md space-y-2">
              {multiResult.leaderboard.slice(0, 10).map((entry, idx) => {
                const isMe = entry.playerId === playerId;
                return (
                  <motion.div
                    key={entry.playerId}
                    initial={{ x: -30, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.6 + idx * 0.08 }}
                    className={`flex items-center gap-3 px-4 py-2 rounded-lg ${
                      isMe ? "bg-amber-500/20 border border-amber-500/30" : "bg-white/5"
                    }`}
                  >
                    <span className="w-6 text-center font-bold text-white/70">{idx + 1}</span>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
                    >
                      <svg width="18" height="18" viewBox="0 0 40 40" fill="none">
                        <circle cx="20" cy="14" r="8" fill="white" opacity="0.9" />
                        <path d="M6 36c0-7.732 6.268-14 14-14s14 6.268 14 14" fill="white" opacity="0.9" />
                      </svg>
                    </div>
                    <span className={`flex-1 text-sm ${isMe ? "text-amber-300 font-bold" : "text-white/80"}`}>
                      {entry.name}
                    </span>
                    <span className="text-sm font-bold text-white/70">{entry.score} ball</span>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-6 flex gap-3">
              <Button
                onClick={() => navigate("/")}
                variant="outline"
                className="border-white/30 text-white bg-white/5"
                data-testid="button-go-home"
              >
                <Home className="w-4 h-4 mr-2" />
                Bosh sahifa
              </Button>
              {isHost && (
                <Button
                  onClick={() => {
                    setStage("name");
                    setPlayers([]);
                    setMultiResult(null);
                    setMyScore(0);
                    setLeaderboard([]);
                    socketRef.current?.disconnect();
                    socketRef.current = null;
                  }}
                  className="bg-gradient-to-r from-emerald-500 to-green-600 text-white border-0"
                  data-testid="button-play-again"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Qayta O'ynash
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}