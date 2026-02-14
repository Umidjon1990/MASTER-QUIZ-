import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute, useLocation } from "wouter";
import { io, Socket } from "socket.io-client";
import PDFViewer from "@/components/pdf-viewer";
import LessonChat from "@/components/lesson-chat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Video, VideoOff, Mic, MicOff, Users, Copy, Link2, Play, Square,
  Circle, RectangleHorizontal, ArrowLeft, Lock, Unlock,
  Presentation, GripVertical, Download, StopCircle, Settings2,
  Monitor, MonitorOff,
} from "lucide-react";
import type { LiveLesson } from "@shared/schema";

export default function TeacherLessonLive() {
  const [, params] = useRoute("/teacher/lesson/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const lessonId = params?.id;

  const socketRef = useRef<Socket | null>(null);
  const [socketState, setSocketState] = useState<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [participantCount, setParticipantCount] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [videoShape, setVideoShape] = useState<"circle" | "rectangle">("circle");
  const [videoDragging, setVideoDragging] = useState(false);
  const [videoPos, setVideoPos] = useState({ x: 20, y: 20 });
  const [videoSize, setVideoSize] = useState(typeof window !== "undefined" && window.innerWidth < 640 ? 100 : 160);
  const dragStart = useRef({ x: 0, y: 0, startX: 0, startY: 0 });

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>("");
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>("");
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);

  const [lessonMode, setLessonMode] = useState<"pdf" | "screen" | "voice">("pdf");
  const [showRecordOptions, setShowRecordOptions] = useState(false);
  const recordOptionsRef = useRef<HTMLDivElement>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenPeerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const { data: lesson, isLoading } = useQuery<LiveLesson>({
    queryKey: ["/api/live-lessons", lessonId],
    enabled: !!lessonId,
  });

  useEffect(() => {
    if (!showRecordOptions) return;
    const handler = (e: MouseEvent) => {
      if (recordOptionsRef.current && !recordOptionsRef.current.contains(e.target as Node)) {
        setShowRecordOptions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showRecordOptions]);

  useEffect(() => {
    const loadDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(s => s.getTracks().forEach(t => t.stop()));
      } catch {}
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioDevices(devices.filter(d => d.kind === "audioinput"));
        setVideoDevices(devices.filter(d => d.kind === "videoinput"));
      } catch {}
    };
    loadDevices();
  }, []);

  useEffect(() => {
    if (!lessonId || !lesson) return;

    const socket = io({ path: "/socket.io" });
    socketRef.current = socket;
    setSocketState(socket);

    socket.emit("lesson:host-join", { lessonId }, (res: any) => {
      if (!res.success) toast({ title: "Xatolik", variant: "destructive" });
    });

    socket.on("lesson:participant-count", ({ count }) => {
      setParticipantCount(count - 1);
    });

    socket.on("lesson:stream-requested", async ({ socketId }) => {
      if (!localStreamRef.current) return;
      await createPeerConnection(socketId);
    });

    socket.on("lesson:screen-stream-requested", async ({ socketId }) => {
      if (!screenStreamRef.current) return;
      await createScreenPeerConnection(socketId);
    });

    socket.on("lesson:screen-answer", async ({ answer, senderSocketId }) => {
      const pc = screenPeerConnectionsRef.current.get(senderSocketId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on("lesson:screen-ice-candidate", async ({ candidate, senderSocketId }) => {
      const pc = screenPeerConnectionsRef.current.get(senderSocketId);
      if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socket.on("lesson:webrtc-answer", async ({ answer, senderSocketId }) => {
      const pc = peerConnectionsRef.current.get(senderSocketId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on("lesson:webrtc-ice-candidate", async ({ candidate, senderSocketId }) => {
      const pc = peerConnectionsRef.current.get(senderSocketId);
      if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    return () => {
      socket.disconnect();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      peerConnectionsRef.current.forEach(pc => pc.close());
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenPeerConnectionsRef.current.forEach(pc => pc.close());
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [lessonId, lesson]);

  useEffect(() => {
    if (lesson) {
      setCurrentPage(lesson.currentPage);
      setIsStarted(lesson.status === "active");
      if (lesson.lessonType === "voice") {
        setLessonMode("voice");
      }
    }
  }, [lesson]);

  const createPeerConnection = async (targetSocketId: string) => {
    const socket = socketRef.current;
    if (!socket || !localStreamRef.current) return;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peerConnectionsRef.current.set(targetSocketId, pc);

    localStreamRef.current.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current!);
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("lesson:webrtc-ice-candidate", {
          candidate: e.candidate,
          targetSocketId,
          lessonId,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        pc.close();
        peerConnectionsRef.current.delete(targetSocketId);
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("lesson:webrtc-offer", { lessonId, offer, targetSocketId });
  };

  const createScreenPeerConnection = async (targetSocketId: string) => {
    const socket = socketRef.current;
    if (!socket || !screenStreamRef.current) return;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    screenPeerConnectionsRef.current.set(targetSocketId, pc);

    screenStreamRef.current.getTracks().forEach(track => {
      pc.addTrack(track, screenStreamRef.current!);
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("lesson:screen-ice-candidate", {
          candidate: e.candidate,
          targetSocketId,
          lessonId,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        pc.close();
        screenPeerConnectionsRef.current.delete(targetSocketId);
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("lesson:screen-offer", { lessonId, offer, targetSocketId });
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      screenPeerConnectionsRef.current.forEach(pc => pc.close());
      screenPeerConnectionsRef.current.clear();
      setIsScreenSharing(false);
      setLessonMode("pdf");
      socketRef.current?.emit("lesson:mode-change", { lessonId, mode: "pdf" });
      socketRef.current?.emit("lesson:screen-sharing-status", { isScreenSharing: false });
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        screenStreamRef.current = stream;
        setIsScreenSharing(true);
        setLessonMode("screen");
        socketRef.current?.emit("lesson:mode-change", { lessonId, mode: "screen" });
        socketRef.current?.emit("lesson:screen-sharing-status", { isScreenSharing: true });

        stream.getVideoTracks()[0].onended = () => {
          screenStreamRef.current = null;
          screenPeerConnectionsRef.current.forEach(pc => pc.close());
          screenPeerConnectionsRef.current.clear();
          setIsScreenSharing(false);
          setLessonMode("pdf");
          socketRef.current?.emit("lesson:mode-change", { lessonId, mode: "pdf" });
          socketRef.current?.emit("lesson:screen-sharing-status", { isScreenSharing: false });
        };

        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
        }
      } catch (err: any) {
        if (err?.name !== "NotAllowedError") {
          toast({ title: "Ekranni ulashib bo'lmadi", variant: "destructive" });
        }
      }
    }
  };

  useEffect(() => {
    if (isScreenSharing && screenVideoRef.current && screenStreamRef.current) {
      screenVideoRef.current.srcObject = screenStreamRef.current;
    }
  }, [isScreenSharing]);

  const getMediaStream = async (audio: boolean, video: boolean) => {
    const constraints: MediaStreamConstraints = {};
    if (audio) {
      constraints.audio = selectedAudioDevice ? { deviceId: { exact: selectedAudioDevice } } : true;
    }
    if (video) {
      constraints.video = selectedVideoDevice ? { deviceId: { exact: selectedVideoDevice } } : true;
    }
    return navigator.mediaDevices.getUserMedia(constraints);
  };

  const toggleAudio = async () => {
    if (audioEnabled) {
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; });
      setAudioEnabled(false);
    } else {
      if (!localStreamRef.current) {
        try {
          const stream = await getMediaStream(true, videoEnabled);
          localStreamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
        } catch {
          toast({ title: "Mikrofondan foydalanib bo'lmaydi", variant: "destructive" });
          return;
        }
      } else {
        const audioTracks = localStreamRef.current.getAudioTracks();
        if (audioTracks.length > 0) {
          audioTracks.forEach(t => { t.enabled = true; });
        } else {
          try {
            const audioStream = await getMediaStream(true, false);
            audioStream.getAudioTracks().forEach(t => localStreamRef.current!.addTrack(t));
          } catch {
            toast({ title: "Mikrofondan foydalanib bo'lmaydi", variant: "destructive" });
            return;
          }
        }
      }
      setAudioEnabled(true);
    }
  };

  const toggleVideo = async () => {
    if (videoEnabled) {
      localStreamRef.current?.getVideoTracks().forEach(t => {
        t.stop();
        localStreamRef.current!.removeTrack(t);
      });
      setVideoEnabled(false);
    } else {
      try {
        if (!localStreamRef.current) {
          const stream = await getMediaStream(audioEnabled, true);
          localStreamRef.current = stream;
        } else {
          const videoStream = await getMediaStream(false, true);
          videoStream.getVideoTracks().forEach(t => localStreamRef.current!.addTrack(t));
        }
        if (videoRef.current) videoRef.current.srcObject = localStreamRef.current;
        setVideoEnabled(true);
      } catch {
        toast({ title: "Kameradan foydalanib bo'lmaydi", variant: "destructive" });
      }
    }
  };

  const switchAudioDevice = async (deviceId: string) => {
    setSelectedAudioDevice(deviceId);
    if (audioEnabled && localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.stop();
        localStreamRef.current!.removeTrack(t);
      });
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
        newStream.getAudioTracks().forEach(t => localStreamRef.current!.addTrack(t));
        peerConnectionsRef.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === "audio");
          const newTrack = newStream.getAudioTracks()[0];
          if (sender && newTrack) sender.replaceTrack(newTrack);
        });
      } catch {
        toast({ title: "Qurilmani almashtirish xatoligi", variant: "destructive" });
      }
    }
  };

  const switchVideoDevice = async (deviceId: string) => {
    setSelectedVideoDevice(deviceId);
    if (videoEnabled && localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => {
        t.stop();
        localStreamRef.current!.removeTrack(t);
      });
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
        newStream.getVideoTracks().forEach(t => localStreamRef.current!.addTrack(t));
        if (videoRef.current) videoRef.current.srcObject = localStreamRef.current;
        peerConnectionsRef.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === "video");
          const newTrack = newStream.getVideoTracks()[0];
          if (sender && newTrack) sender.replaceTrack(newTrack);
        });
      } catch {
        toast({ title: "Qurilmani almashtirish xatoligi", variant: "destructive" });
      }
    }
  };

  const getRecordingMimeType = () => {
    const mp4Types = [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4;codecs=avc1,mp4a.40.2",
      "video/mp4",
    ];
    for (const t of mp4Types) {
      if (MediaRecorder.isTypeSupported(t)) return { mime: t, ext: "mp4" };
    }
    const webmTypes = [
      "video/webm;codecs=h264,opus",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    for (const t of webmTypes) {
      if (MediaRecorder.isTypeSupported(t)) return { mime: t, ext: "webm" };
    }
    return { mime: "video/webm", ext: "webm" };
  };

  const getAudioMimeType = () => {
    const mp4Types = ["audio/mp4", "audio/aac"];
    for (const t of mp4Types) {
      if (MediaRecorder.isTypeSupported(t)) return { mime: t, ext: "m4a" };
    }
    const webmTypes = ["audio/webm;codecs=opus", "audio/webm"];
    for (const t of webmTypes) {
      if (MediaRecorder.isTypeSupported(t)) return { mime: t, ext: "webm" };
    }
    return { mime: "audio/webm", ext: "webm" };
  };

  const startRecording = async (surface?: "monitor" | "window" | "browser") => {
    setShowRecordOptions(false);
    try {
      const isVoiceMode = lesson?.lessonType === "voice" && !isScreenSharing && !surface;

      if (isVoiceMode) {
        const combinedStream = new MediaStream();
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(t => combinedStream.addTrack(t));
        } else {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStream.getAudioTracks().forEach(t => combinedStream.addTrack(t));
        }

        if (combinedStream.getAudioTracks().length === 0) {
          toast({ title: "Avval mikrofonni yoqing", variant: "destructive" });
          return;
        }

        const { mime, ext } = getAudioMimeType();
        const recorder = new MediaRecorder(combinedStream, { mimeType: mime });
        recordedChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: mime });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `dars_${lesson?.title || "recording"}_${new Date().toISOString().slice(0, 10)}.${ext}`;
          a.click();
          URL.revokeObjectURL(url);
          setIsRecording(false);
          setRecordingTime(0);
          if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        };

        recorder.start(1000);
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        setRecordingTime(0);
        recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
        toast({ title: "Ovoz yozib olish boshlandi" });
        return;
      }

      const displayMediaOptions: any = {
        video: surface ? { displaySurface: surface } : true,
        audio: true,
      };

      const screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

      const combinedStream = new MediaStream();
      screenStream.getVideoTracks().forEach(t => combinedStream.addTrack(t));

      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(t => combinedStream.addTrack(t));
      }
      screenStream.getAudioTracks().forEach(t => combinedStream.addTrack(t));

      const { mime, ext } = getRecordingMimeType();
      const recorder = new MediaRecorder(combinedStream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `dars_${lesson?.title || "recording"}_${new Date().toISOString().slice(0, 10)}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        setIsRecording(false);
        setRecordingTime(0);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      };

      screenStream.getVideoTracks()[0].onended = () => {
        stopRecording();
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
      const surfaceLabels: Record<string, string> = {
        monitor: "Butun ekran",
        window: "Oyna",
        browser: "Brauzer tab",
      };
      toast({ title: `${surfaceLabels[surface || "monitor"] || "Ekran"} yozib olish boshlandi` });
    } catch (err: any) {
      if (err?.name !== "NotAllowedError") {
        toast({ title: "Yozib olishni boshlab bo'lmadi", variant: "destructive" });
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  };

  const formatRecTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (videoEnabled && videoRef.current && localStreamRef.current) {
      videoRef.current.srcObject = localStreamRef.current;
    }
  }, [videoEnabled]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    socketRef.current?.emit("lesson:change-page", { lessonId, page });
    apiRequest("PATCH", `/api/live-lessons/${lessonId}`, { currentPage: page });
  };

  const handlePointerMove = (x: number, y: number, visible: boolean) => {
    socketRef.current?.emit("lesson:pointer-move", { lessonId, x, y, visible });
  };

  const handleZoomChange = (zoomLevel: number) => {
    socketRef.current?.emit("lesson:zoom-change", { lessonId, zoomLevel });
  };

  const handleStart = async () => {
    await apiRequest("PATCH", `/api/live-lessons/${lessonId}`, { status: "active", startedAt: new Date().toISOString() });
    socketRef.current?.emit("lesson:start", { lessonId });
    setIsStarted(true);
    queryClient.invalidateQueries({ queryKey: ["/api/live-lessons", lessonId] });
    toast({ title: "Dars boshlandi!" });
  };

  const handleEnd = async () => {
    if (isRecording) stopRecording();
    await apiRequest("PATCH", `/api/live-lessons/${lessonId}`, { status: "ended", endedAt: new Date().toISOString() });
    socketRef.current?.emit("lesson:end", { lessonId });
    setIsStarted(false);
    queryClient.invalidateQueries({ queryKey: ["/api/live-lessons", lessonId] });
    toast({ title: "Dars tugadi" });
  };

  const copyLink = () => {
    if (!lesson) return;
    const baseUrl = window.location.origin;
    const link = lesson.requireCode
      ? `${baseUrl}/lesson/join`
      : `${baseUrl}/lesson/join/${lesson.joinCode}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Havola nusxalandi!" });
  };

  const copyCode = () => {
    if (!lesson) return;
    navigator.clipboard.writeText(lesson.joinCode);
    toast({ title: "Kod nusxalandi!" });
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <Presentation className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">Dars topilmadi</p>
        <Button onClick={() => navigate("/teacher/lessons")} data-testid="button-back-lessons">
          <ArrowLeft className="w-4 h-4 mr-2" /> Orqaga
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden relative">
      <div className="flex items-center justify-between gap-1.5 p-1.5 sm:p-2 border-b bg-background/80 backdrop-blur-sm flex-wrap z-20" data-testid="lesson-controls">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
          <Button size="icon" variant="ghost" onClick={() => navigate("/teacher/lessons")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="font-semibold text-xs sm:text-sm truncate max-w-[100px] sm:max-w-[200px]" data-testid="text-lesson-name">
            {lesson.title}
          </h2>
          <Badge variant="outline" className="gap-1" data-testid="badge-participants">
            <Users className="w-3 h-3" /> {participantCount}
          </Badge>
          {lesson.requireCode && (
            <button onClick={copyCode} className="hidden sm:flex items-center gap-1 text-xs font-mono" data-testid="button-lesson-code">
              <Lock className="w-3 h-3" /> {lesson.joinCode} <Copy className="w-3 h-3" />
            </button>
          )}
          {lesson.requireCode && (
            <button onClick={copyCode} className="flex sm:hidden items-center gap-1 text-xs font-mono" data-testid="button-lesson-code-mobile">
              <Lock className="w-3 h-3" /> <Copy className="w-3 h-3" />
            </button>
          )}
          {!lesson.requireCode && (
            <Badge variant="secondary" className="gap-1 hidden sm:flex">
              <Unlock className="w-3 h-3" /> Kodsiz
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 flex-wrap">
          <Button size="icon" variant={audioEnabled ? "default" : "ghost"} onClick={toggleAudio} data-testid="button-toggle-audio">
            {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </Button>
          <Button size="icon" variant={videoEnabled ? "default" : "ghost"} onClick={toggleVideo} data-testid="button-toggle-video">
            {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </Button>
          {videoEnabled && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setVideoShape(s => s === "circle" ? "rectangle" : "circle")}
              data-testid="button-video-shape"
            >
              {videoShape === "circle" ? <Circle className="w-4 h-4" /> : <RectangleHorizontal className="w-4 h-4" />}
            </Button>
          )}
          <Button
            size="icon"
            variant={isScreenSharing ? "default" : "ghost"}
            onClick={toggleScreenShare}
            data-testid="button-toggle-screen-share"
          >
            {isScreenSharing ? <Monitor className="w-4 h-4" /> : <MonitorOff className="w-4 h-4" />}
          </Button>
          <Button
            size="icon"
            variant={showDeviceSettings ? "default" : "ghost"}
            onClick={() => setShowDeviceSettings(v => !v)}
            data-testid="button-device-settings"
          >
            <Settings2 className="w-4 h-4" />
          </Button>
          <div className="relative" ref={recordOptionsRef}>
            {!isRecording ? (
              <Button
                size="icon"
                variant="ghost"
                className="text-red-500"
                onClick={() => setShowRecordOptions(v => !v)}
                data-testid="button-start-recording"
              >
                <Circle className="w-4 h-4 fill-red-500" />
              </Button>
            ) : (
              <Button size="icon" variant="destructive" onClick={stopRecording} data-testid="button-stop-recording">
                <StopCircle className="w-4 h-4" />
              </Button>
            )}
            {showRecordOptions && (
              <div className="absolute top-full right-0 mt-2 bg-card border rounded-md shadow-lg p-1 z-[9999] min-w-[180px]">
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded hover-elevate text-left"
                  onClick={() => startRecording("browser")}
                  data-testid="button-record-tab"
                >
                  <Presentation className="w-4 h-4 shrink-0" />
                  Brauzer tab
                </button>
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded hover-elevate text-left"
                  onClick={() => startRecording("window")}
                  data-testid="button-record-window"
                >
                  <Square className="w-4 h-4 shrink-0" />
                  Oyna
                </button>
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded hover-elevate text-left"
                  onClick={() => startRecording("monitor")}
                  data-testid="button-record-screen"
                >
                  <Monitor className="w-4 h-4 shrink-0" />
                  Butun ekran
                </button>
                {lesson?.lessonType === "voice" && (
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded hover-elevate text-left"
                    onClick={() => startRecording()}
                    data-testid="button-record-audio"
                  >
                    <Mic className="w-4 h-4 shrink-0" />
                    Faqat ovoz
                  </button>
                )}
              </div>
            )}
          </div>
          {isRecording && (
            <Badge variant="destructive" className="gap-1 animate-pulse" data-testid="badge-recording-time">
              <span className="w-2 h-2 rounded-full bg-white" /> {formatRecTime(recordingTime)}
            </Badge>
          )}
          <Button size="icon" variant="ghost" onClick={copyLink} data-testid="button-copy-link">
            <Link2 className="w-4 h-4" />
          </Button>
          {!isStarted ? (
            <Button size="sm" onClick={handleStart} data-testid="button-start-lesson">
              <Play className="w-3 h-3 sm:mr-1" /> <span className="hidden sm:inline">Boshlash</span>
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={handleEnd} data-testid="button-end-lesson">
              <Square className="w-3 h-3 sm:mr-1" /> <span className="hidden sm:inline">Tugatish</span>
            </Button>
          )}
        </div>
      </div>

      {showDeviceSettings && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 p-2 border-b bg-muted/30 z-10" data-testid="device-settings-panel">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Mic className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Select value={selectedAudioDevice} onValueChange={switchAudioDevice}>
              <SelectTrigger className="w-full sm:w-[200px] h-8 text-xs" data-testid="select-audio-device">
                <SelectValue placeholder="Mikrofon tanlang" />
              </SelectTrigger>
              <SelectContent>
                {audioDevices.map(d => (
                  <SelectItem key={d.deviceId} value={d.deviceId} data-testid={`option-audio-${d.deviceId}`}>
                    {d.label || `Mikrofon ${audioDevices.indexOf(d) + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Video className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Select value={selectedVideoDevice} onValueChange={switchVideoDevice}>
              <SelectTrigger className="w-full sm:w-[200px] h-8 text-xs" data-testid="select-video-device">
                <SelectValue placeholder="Kamera tanlang" />
              </SelectTrigger>
              <SelectContent>
                {videoDevices.map(d => (
                  <SelectItem key={d.deviceId} value={d.deviceId} data-testid={`option-video-${d.deviceId}`}>
                    {d.label || `Kamera ${videoDevices.indexOf(d) + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="flex-1 relative overflow-hidden min-h-0">
        {lessonMode === "voice" ? (
          <div className="flex flex-col items-center justify-center w-full h-full gap-6" data-testid="voice-lesson-view">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center ${audioEnabled ? "bg-primary/20 animate-pulse" : "bg-muted"}`}>
              {audioEnabled ? <Mic className="w-10 h-10 text-primary" /> : <MicOff className="w-10 h-10 text-muted-foreground" />}
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold">{lesson.title}</h2>
              <p className="text-sm text-muted-foreground">
                {audioEnabled ? "Ovozli dars davom etmoqda" : "Mikrofonni yoqing va darsni boshlang"}
              </p>
              <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="w-4 h-4" /> {participantCount} qatnashchi
                </span>
                {isRecording && (
                  <Badge variant="destructive" className="gap-1 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-white" /> Yozib olinmoqda
                  </Badge>
                )}
              </div>
            </div>
            {isScreenSharing && (
              <div className="w-full max-w-2xl mx-auto aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={screenVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                  data-testid="voice-screen-share-video"
                />
              </div>
            )}
          </div>
        ) : lessonMode === "pdf" ? (
          <PDFViewer
            url={lesson.pdfUrl!}
            currentPage={currentPage}
            onPageChange={handlePageChange}
            onTotalPages={setTotalPages}
            onPointerMove={handlePointerMove}
            onZoomChange={handleZoomChange}
            isHost
          />
        ) : (
          <div
            className="flex items-center justify-center w-full h-full bg-black relative"
            data-testid="screen-share-preview"
            onPointerMove={(e) => {
              if (!isScreenSharing || !screenVideoRef.current) return;
              const video = screenVideoRef.current;
              const rect = video.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) return;
              const x = ((e.clientX - rect.left) / rect.width) * 100;
              const y = ((e.clientY - rect.top) / rect.height) * 100;
              const visible = x >= 0 && x <= 100 && y >= 0 && y <= 100;
              handlePointerMove(x, y, visible);
            }}
            onPointerLeave={() => handlePointerMove(0, 0, false)}
          >
            <video
              ref={screenVideoRef}
              autoPlay
              playsInline
              muted
              className="max-w-full max-h-full object-contain"
              data-testid="screen-share-video"
            />
            {!isScreenSharing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white">
                <Monitor className="w-16 h-16 opacity-50" />
                <p className="text-lg opacity-70">Ekran ulashish to'xtatildi</p>
                <Button variant="outline" onClick={() => setLessonMode(lesson?.lessonType === "voice" ? "voice" : "pdf")} data-testid="button-back-to-pdf">
                  {lesson?.lessonType === "voice" ? "Ovozli darsga qaytish" : "PDF ga qaytish"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {videoEnabled && (
        <div
          className="fixed z-50"
          style={{
            right: `${videoPos.x}px`,
            bottom: `${videoPos.y}px`,
            width: `${videoSize}px`,
            height: videoShape === "circle" ? `${videoSize}px` : `${videoSize * 0.75}px`,
          }}
          data-testid="teacher-pip-video"
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
              muted
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

      <LessonChat socket={socketState} isHost />
    </div>
  );
}
