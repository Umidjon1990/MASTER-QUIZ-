import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { io, Socket } from "socket.io-client";
import PDFViewer from "@/components/pdf-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { motion } from "framer-motion";
import {
  Presentation, ArrowRight, Users, Volume2, VolumeX,
  GripVertical, Circle, RectangleHorizontal, Monitor,
} from "lucide-react";

interface LessonInfo {
  id: string;
  title: string;
  pdfUrl: string;
  status: string;
  currentPage: number;
  totalPages: number;
  requireCode: boolean;
  joinCode: string;
}

export default function LessonJoin() {
  const [, params] = useRoute("/lesson/join/:code");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [code, setCode] = useState(params?.code || "");
  const [name, setName] = useState("");
  const [lessonInfo, setLessonInfo] = useState<LessonInfo | null>(null);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pointer, setPointer] = useState<{ x: number; y: number; visible: boolean } | null>(null);
  const [ended, setEnded] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [externalZoom, setExternalZoom] = useState(0);

  const [videoShape, setVideoShape] = useState<"circle" | "rectangle">("circle");
  const [videoPos, setVideoPos] = useState({ x: 20, y: 20 });
  const [videoSize, setVideoSize] = useState(typeof window !== "undefined" && window.innerWidth < 640 ? 80 : 120);
  const [videoDragging, setVideoDragging] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);

  const [lessonMode, setLessonMode] = useState<"pdf" | "screen">("pdf");
  const [hasScreenStream, setHasScreenStream] = useState(false);
  const screenPeerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  const socketRef = useRef<Socket | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const dragStart = useRef({ x: 0, y: 0, startX: 0, startY: 0 });

  useEffect(() => {
    if (params?.code && !joined) {
      handleLookup(params.code);
    }
  }, [params?.code]);

  const handleLookup = async (joinCode?: string) => {
    const c = joinCode || code.trim();
    if (!c) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/live-lessons/join/${c}`);
      if (!res.ok) {
        const err = await res.json();
        toast({ title: err.message || "Dars topilmadi", variant: "destructive" });
        setLoading(false);
        return;
      }
      const data: LessonInfo = await res.json();
      setLessonInfo(data);
      setCurrentPage(data.currentPage);

      if (!data.requireCode) {
        joinLesson(data);
      }
    } catch {
      toast({ title: "Xatolik yuz berdi", variant: "destructive" });
    }
    setLoading(false);
  };

  const joinLesson = (info?: LessonInfo) => {
    const lesson = info || lessonInfo;
    if (!lesson) return;

    const displayName = name.trim() || user?.firstName || user?.email || "O'quvchi";
    const socket = io({ path: "/socket.io" });
    socketRef.current = socket;

    socket.emit("lesson:student-join", {
      lessonId: lesson.id,
      name: displayName,
    }, (res: any) => {
      if (res.success) {
        setJoined(true);
        socket.emit("lesson:request-stream", { lessonId: lesson.id });
        if (res.mode === "screen") {
          setLessonMode("screen");
          socket.emit("lesson:request-screen-stream", { lessonId: lesson.id });
        }
      }
    });

    socket.on("lesson:page-changed", ({ page }) => {
      setCurrentPage(page);
    });

    socket.on("lesson:pointer-update", ({ x, y, visible }) => {
      setPointer({ x, y, visible });
    });

    socket.on("lesson:zoom-changed", ({ zoomLevel }) => {
      setExternalZoom(zoomLevel);
    });

    socket.on("lesson:mode-changed", ({ mode }) => {
      setLessonMode(mode);
      if (mode === "screen") {
        socket.emit("lesson:request-screen-stream", { lessonId: lesson.id });
      }
      if (mode === "pdf") {
        screenPeerConnectionRef.current?.close();
        screenStreamRef.current?.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
        setHasScreenStream(false);
      }
    });

    socket.on("lesson:screen-offer", async ({ offer, senderSocketId }) => {
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        screenPeerConnectionRef.current = pc;

        pc.ontrack = (e) => {
          if (!screenStreamRef.current) {
            screenStreamRef.current = new MediaStream();
          }
          screenStreamRef.current.addTrack(e.track);
          if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = screenStreamRef.current;
          }
          if (e.track.kind === "video") setHasScreenStream(true);
        };

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit("lesson:screen-ice-candidate", {
              candidate: e.candidate,
              targetSocketId: senderSocketId,
              lessonId: lesson.id,
            });
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("lesson:screen-answer", {
          answer,
          targetSocketId: senderSocketId,
        });
      } catch (err) {
        console.error("Screen WebRTC answer error:", err);
      }
    });

    socket.on("lesson:screen-ice-candidate", async ({ candidate }) => {
      const pc = screenPeerConnectionRef.current;
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {}
      }
    });

    socket.on("lesson:participant-count", ({ count }) => {
      setParticipantCount(count);
    });

    socket.on("lesson:started", () => {
      toast({ title: "Dars boshlandi!" });
    });

    socket.on("lesson:ended", () => {
      setEnded(true);
      toast({ title: "Dars tugadi" });
    });

    socket.on("lesson:webrtc-offer", async ({ offer, senderSocketId }) => {
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        peerConnectionRef.current = pc;

        pc.ontrack = (e) => {
          if (!remoteStreamRef.current) {
            remoteStreamRef.current = new MediaStream();
          }
          remoteStreamRef.current.addTrack(e.track);
          if (videoRef.current) {
            videoRef.current.srcObject = remoteStreamRef.current;
          }
          if (e.track.kind === "video") setHasRemoteVideo(true);
        };

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit("lesson:webrtc-ice-candidate", {
              candidate: e.candidate,
              targetSocketId: senderSocketId,
              lessonId: lesson.id,
            });
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("lesson:webrtc-answer", {
          answer,
          targetSocketId: senderSocketId,
        });
      } catch (err) {
        console.error("WebRTC answer error:", err);
      }
    });

    socket.on("lesson:webrtc-ice-candidate", async ({ candidate }) => {
      const pc = peerConnectionRef.current;
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {}
      }
    });
  };

  const handleVideoDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setVideoDragging(true);
    dragStart.current = { x: clientX, y: clientY, startX: videoPos.x, startY: videoPos.y };
  };

  useEffect(() => {
    if (!videoDragging) return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const dx = clientX - dragStart.current.x;
      const dy = clientY - dragStart.current.y;
      setVideoPos({
        x: Math.max(0, dragStart.current.startX + dx),
        y: Math.max(0, dragStart.current.startY + dy),
      });
    };
    const handleUp = () => setVideoDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
  }, [videoDragging]);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      peerConnectionRef.current?.close();
      screenPeerConnectionRef.current?.close();
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    if (hasRemoteVideo && videoRef.current && remoteStreamRef.current) {
      videoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [hasRemoteVideo]);

  useEffect(() => {
    if (hasScreenStream && screenVideoRef.current && screenStreamRef.current) {
      screenVideoRef.current.srcObject = screenStreamRef.current;
    }
  }, [hasScreenStream]);

  const toggleAudioMute = () => {
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getAudioTracks().forEach(t => { t.enabled = audioMuted; });
    }
    setAudioMuted(!audioMuted);
  };

  if (ended) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-6">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Card className="p-8 text-center space-y-4 max-w-md">
            <Presentation className="w-16 h-16 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-bold">Dars tugadi</h2>
            <p className="text-muted-foreground">O'qituvchi darsni yakunladi</p>
            <Button onClick={() => navigate("/")} data-testid="button-go-home">
              Bosh sahifaga
            </Button>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (joined && lessonInfo) {
    return (
      <div className="flex flex-col h-screen relative">
        <div className="flex items-center justify-between gap-1.5 p-1.5 sm:p-2 border-b bg-background/80 backdrop-blur-sm z-20 flex-wrap">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <Presentation className="w-4 h-4 text-primary shrink-0" />
            <span className="font-semibold text-xs sm:text-sm truncate max-w-[120px] sm:max-w-[200px]" data-testid="text-lesson-title">
              {lessonInfo.title}
            </span>
            <Badge variant="outline" className="gap-1">
              <Users className="w-3 h-3" /> {participantCount}
            </Badge>
            {lessonMode === "screen" && (
              <Badge variant="secondary" className="gap-1" data-testid="badge-screen-mode">
                <Monitor className="w-3 h-3" /> <span className="hidden sm:inline">Ekran</span>
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1">
            <Button size="icon" variant="ghost" onClick={toggleAudioMute} data-testid="button-toggle-audio-mute">
              {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
            {hasRemoteVideo && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setVideoShape(s => s === "circle" ? "rectangle" : "circle")}
                data-testid="button-video-shape"
              >
                {videoShape === "circle" ? <Circle className="w-4 h-4" /> : <RectangleHorizontal className="w-4 h-4" />}
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden min-h-0">
          {lessonMode === "pdf" ? (
            <PDFViewer
              url={lessonInfo.pdfUrl}
              currentPage={currentPage}
              pointerPosition={pointer}
              externalZoom={externalZoom}
              isHost={false}
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full bg-black relative" data-testid="screen-share-student-view">
              {hasScreenStream ? (
                <>
                  <video
                    ref={screenVideoRef}
                    autoPlay
                    playsInline
                    className="max-w-full max-h-full object-contain"
                    data-testid="screen-share-student-video"
                  />
                  {pointer && pointer.visible && screenVideoRef.current && (() => {
                    const rect = screenVideoRef.current!.getBoundingClientRect();
                    const parentRect = screenVideoRef.current!.parentElement?.getBoundingClientRect();
                    if (!parentRect || rect.width === 0 || rect.height === 0) return null;
                    const offsetLeft = rect.left - parentRect.left;
                    const offsetTop = rect.top - parentRect.top;
                    return (
                      <div
                        className="absolute pointer-events-none z-50"
                        style={{
                          left: `${offsetLeft + (pointer.x / 100) * rect.width}px`,
                          top: `${offsetTop + (pointer.y / 100) * rect.height}px`,
                          transform: "translate(-50%, -50%)",
                        }}
                        data-testid="screen-laser-pointer"
                      >
                        <div className="w-5 h-5 rounded-full bg-red-500 opacity-80 animate-pulse shadow-[0_0_12px_4px_rgba(239,68,68,0.6)]" />
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 text-white/70">
                  <Monitor className="w-12 h-12" />
                  <p>O'qituvchi ekranini ulashmoqda...</p>
                  <div className="w-6 h-6 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>

        {hasRemoteVideo && (
          <div
            className="fixed z-50"
            style={{
              right: `${videoPos.x}px`,
              bottom: `${videoPos.y}px`,
              width: `${videoSize}px`,
              height: videoShape === "circle" ? `${videoSize}px` : `${videoSize * 0.75}px`,
            }}
            data-testid="teacher-pip-video-student"
          >
            <div
              className={`relative w-full h-full overflow-hidden border-2 border-primary/50 shadow-lg ${
                videoShape === "circle" ? "rounded-full" : "rounded-lg"
              }`}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div
                className="absolute top-0 left-0 w-full h-8 sm:h-6 cursor-move flex items-center justify-center opacity-60 sm:opacity-0 hover:opacity-100 transition-opacity bg-black/30"
                onMouseDown={handleVideoDragStart}
                onTouchStart={handleVideoDragStart}
              >
                <GripVertical className="w-3 h-3 text-white" />
              </div>
            </div>
          </div>
        )}

        <audio ref={el => {
          if (el && remoteStreamRef.current && !el.srcObject) {
            el.srcObject = remoteStreamRef.current;
          }
        }} autoPlay hidden />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="p-8 max-w-md w-full space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-lg gradient-purple flex items-center justify-center mx-auto">
              <Presentation className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-xl font-bold" data-testid="text-join-title">Jonli darsga qo'shilish</h1>
            <p className="text-sm text-muted-foreground">O'qituvchi bergan kodni kiriting</p>
          </div>

          {!lessonInfo ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Dars kodi</Label>
                <Input
                  placeholder="6 raqamli kod"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                  data-testid="input-lesson-code"
                />
              </div>
              <Button
                onClick={() => handleLookup()}
                disabled={code.length < 6 || loading}
                className="w-full"
                data-testid="button-lookup-lesson"
              >
                {loading ? "Qidirilmoqda..." : "Kirish"}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Card className="p-4 space-y-2">
                <h3 className="font-semibold" data-testid="text-found-lesson-title">{lessonInfo.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {lessonInfo.status === "active" ? "Dars davom etmoqda" : "Dars boshlanishini kutmoqda"}
                </p>
              </Card>
              <div className="space-y-2">
                <Label>Ismingiz</Label>
                <Input
                  placeholder={user?.firstName || "Ismingizni kiriting"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="input-student-name"
                />
              </div>
              <Button onClick={() => joinLesson()} className="w-full" data-testid="button-join-lesson">
                Darsga kirish <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
