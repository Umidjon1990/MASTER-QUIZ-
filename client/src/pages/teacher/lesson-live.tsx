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
  Monitor, MonitorOff, ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight,
  Minimize2, Wifi, WifiOff,
} from "lucide-react";
import type { LiveLesson } from "@shared/schema";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.services.mozilla.com:3478" },
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
};

function preferH264(description: RTCSessionDescriptionInit): RTCSessionDescriptionInit {
  if (!description.sdp) return description;
  const lines = description.sdp.split("\r\n");
  const h264Payloads: string[] = [];
  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+H264\//i);
    if (match) h264Payloads.push(match[1]);
  }
  if (h264Payloads.length === 0) return description;
  const modifiedLines = lines.map(line => {
    if (line.startsWith("m=video")) {
      const parts = line.split(" ");
      const header = parts.slice(0, 3);
      const payloads = parts.slice(3);
      const reordered = [
        ...h264Payloads.filter(p => payloads.includes(p)),
        ...payloads.filter(p => !h264Payloads.includes(p)),
      ];
      return [...header, ...reordered].join(" ");
    }
    return line;
  });
  return { ...description, sdp: modifiedLines.join("\r\n") };
}

type NetworkQuality = "excellent" | "good" | "fair" | "poor";

function getQualityFromStats(rtt: number, packetLoss: number): NetworkQuality {
  if (rtt < 100 && packetLoss < 1) return "excellent";
  if (rtt < 200 && packetLoss < 3) return "good";
  if (rtt < 400 && packetLoss < 8) return "fair";
  return "poor";
}

const QUALITY_PRESETS = {
  excellent: { maxBitrate: 1500000, maxFramerate: 30, scaleDown: 1 },
  good: { maxBitrate: 800000, maxFramerate: 24, scaleDown: 1 },
  fair: { maxBitrate: 400000, maxFramerate: 15, scaleDown: 2 },
  poor: { maxBitrate: 150000, maxFramerate: 10, scaleDown: 4 },
};

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
  const [zoomLevel, setZoomLevel] = useState(0);
  const [participantCount, setParticipantCount] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [videoShape, setVideoShape] = useState<"circle" | "rectangle">("circle");
  const [videoDragging, setVideoDragging] = useState(false);
  const initVideoSize = typeof window !== "undefined" && window.innerWidth < 640 ? 100 : 160;
  const [videoPos, setVideoPos] = useState({ left: typeof window !== "undefined" ? window.innerWidth - initVideoSize - 20 : 200, top: typeof window !== "undefined" ? window.innerHeight - initVideoSize - 20 : 200 });
  const [videoSize, setVideoSize] = useState(initVideoSize);
  const dragStart = useRef({ x: 0, y: 0, startLeft: 0, startTop: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ x: number; y: number; startW: number } | null>(null);
  const [showPipToolbar, setShowPipToolbar] = useState(false);
  const pipThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordScreenStreamRef = useRef<MediaStream | null>(null);

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>("");
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>("");
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const audioAnalyserRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode; source: MediaStreamAudioSourceNode; animId: number } | null>(null);

  const [lessonMode, setLessonMode] = useState<"pdf" | "screen" | "voice">("pdf");
  const [showControls, setShowControls] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenPeerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>("good");
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastQualityRef = useRef<NetworkQuality>("good");

  const { data: lesson, isLoading } = useQuery<LiveLesson>({
    queryKey: ["/api/live-lessons", lessonId],
    enabled: !!lessonId,
  });

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (!showDeviceSettings) setShowControls(false);
    }, 4000);
  }, [showDeviceSettings]);

  useEffect(() => {
    resetControlsTimer();
    const handleMove = () => resetControlsTimer();
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("touchstart", handleMove);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("touchstart", handleMove);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [resetControlsTimer]);


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

    socket.on("lesson:screen-stream-requested", async ({ socketId, deviceType }) => {
      if (!screenStreamRef.current) return;
      await createScreenPeerConnection(socketId, deviceType);
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
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
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

  const applyBitrateLimit = useCallback(async (pc: RTCPeerConnection, quality: NetworkQuality) => {
    const preset = QUALITY_PRESETS[quality];
    const senders = pc.getSenders();
    for (const sender of senders) {
      if (sender.track?.kind === "video") {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = preset.maxBitrate;
        params.encodings[0].maxFramerate = preset.maxFramerate;
        if (preset.scaleDown > 1) {
          params.encodings[0].scaleResolutionDownBy = preset.scaleDown;
        } else {
          delete params.encodings[0].scaleResolutionDownBy;
        }
        try {
          await sender.setParameters(params);
        } catch {}
      }
    }
  }, []);

  useEffect(() => {
    if (!videoEnabled && !isScreenSharing) {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = null;
      }
      return;
    }
    statsIntervalRef.current = setInterval(async () => {
      const allConnections = videoEnabled
        ? Array.from(peerConnectionsRef.current.values())
        : Array.from(screenPeerConnectionsRef.current.values());

      const connections = allConnections
        .filter(pc => pc.connectionState === "connected")
        .slice(0, 5);

      if (connections.length === 0) return;

      let totalRtt = 0;
      let totalPacketLoss = 0;
      let rttCount = 0;
      let lossCount = 0;

      const results = await Promise.allSettled(connections.map(pc => pc.getStats()));
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        result.value.forEach((report: any) => {
          if (report.type === "candidate-pair" && report.state === "succeeded") {
            if (typeof report.currentRoundTripTime === "number" && isFinite(report.currentRoundTripTime)) {
              totalRtt += report.currentRoundTripTime * 1000;
              rttCount++;
            }
          }
          if (report.type === "remote-inbound-rtp" && report.kind === "video") {
            const lost = report.packetsLost;
            const received = report.packetsReceived;
            if (typeof lost === "number" && typeof received === "number" && (lost + received) > 0) {
              const loss = (lost / (lost + received)) * 100;
              if (isFinite(loss)) {
                totalPacketLoss += loss;
                lossCount++;
              }
            }
          }
        });
      }

      if (rttCount > 0) {
        const avgRtt = totalRtt / rttCount;
        const avgLoss = lossCount > 0 ? totalPacketLoss / lossCount : 0;
        const quality = getQualityFromStats(avgRtt, avgLoss);

        if (quality !== lastQualityRef.current) {
          lastQualityRef.current = quality;
          setNetworkQuality(quality);
          for (const pc of connections) {
            if (pc.connectionState === "connected") {
              applyBitrateLimit(pc, quality);
            }
          }
        }
      }
    }, 5000);

    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = null;
      }
    };
  }, [videoEnabled, isScreenSharing, applyBitrateLimit]);

  const createPeerConnection = async (targetSocketId: string) => {
    const socket = socketRef.current;
    if (!socket || !localStreamRef.current) return;

    const existingPc = peerConnectionsRef.current.get(targetSocketId);
    if (existingPc) {
      existingPc.close();
      peerConnectionsRef.current.delete(targetSocketId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current.set(targetSocketId, pc);

    localStreamRef.current.getTracks().forEach(track => {
      const sender = pc.addTrack(track, localStreamRef.current!);
      if (track.kind === "video" && sender) {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = QUALITY_PRESETS[lastQualityRef.current].maxBitrate;
        params.encodings[0].maxFramerate = QUALITY_PRESETS[lastQualityRef.current].maxFramerate;
        sender.setParameters(params).catch(() => {});
      }
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

    let iceRestartCount = 0;
    const MAX_ICE_RESTARTS = 3;
    let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        iceRestartCount = 0;
        if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }
      } else if (pc.connectionState === "failed") {
        if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }
        if (iceRestartCount < MAX_ICE_RESTARTS) {
          iceRestartCount++;
          const backoff = 1000 * iceRestartCount;
          setTimeout(() => {
            if (peerConnectionsRef.current.get(targetSocketId) !== pc) return;
            pc.restartIce();
            pc.createOffer({ iceRestart: true }).then(offer => {
              if (peerConnectionsRef.current.get(targetSocketId) !== pc) return;
              const h264Offer = preferH264(offer);
              pc.setLocalDescription(h264Offer);
              socket.emit("lesson:webrtc-offer", { lessonId, offer: h264Offer, targetSocketId });
            }).catch(() => {
              pc.close();
              peerConnectionsRef.current.delete(targetSocketId);
            });
          }, backoff);
        } else {
          pc.close();
          peerConnectionsRef.current.delete(targetSocketId);
        }
      } else if (pc.connectionState === "disconnected") {
        if (disconnectTimer) clearTimeout(disconnectTimer);
        disconnectTimer = setTimeout(() => {
          if (peerConnectionsRef.current.get(targetSocketId) !== pc) return;
          if (pc.connectionState === "disconnected" && iceRestartCount < MAX_ICE_RESTARTS) {
            iceRestartCount++;
            pc.restartIce();
            pc.createOffer({ iceRestart: true }).then(offer => {
              if (peerConnectionsRef.current.get(targetSocketId) !== pc) return;
              const h264Offer = preferH264(offer);
              pc.setLocalDescription(h264Offer);
              socket.emit("lesson:webrtc-offer", { lessonId, offer: h264Offer, targetSocketId });
            }).catch(() => {});
          }
        }, 3000);
      }
    };

    const offer = await pc.createOffer();
    const h264Offer = preferH264(offer);
    await pc.setLocalDescription(h264Offer);
    socket.emit("lesson:webrtc-offer", { lessonId, offer: h264Offer, targetSocketId });
  };

  const createScreenPeerConnection = async (targetSocketId: string, deviceType?: string) => {
    const socket = socketRef.current;
    const stream = screenStreamRef.current;
    if (!socket || !stream) return;

    const existingPc = screenPeerConnectionsRef.current.get(targetSocketId);
    if (existingPc) {
      existingPc.close();
      screenPeerConnectionsRef.current.delete(targetSocketId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    screenPeerConnectionsRef.current.set(targetSocketId, pc);

    stream.getTracks().forEach(track => {
      const sender = pc.addTrack(track, stream);
      if (track.kind === "video" && sender) {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = 2500000;
        params.encodings[0].maxFramerate = 30;
        sender.setParameters(params).catch(() => {});
      }
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

    let screenIceRestartCount = 0;
    let screenDisconnectTimer: ReturnType<typeof setTimeout> | null = null;
    pc.onconnectionstatechange = () => {
      if (screenPeerConnectionsRef.current.get(targetSocketId) !== pc) return;
      if (pc.connectionState === "connected") {
        screenIceRestartCount = 0;
        if (screenDisconnectTimer) { clearTimeout(screenDisconnectTimer); screenDisconnectTimer = null; }
      } else if (pc.connectionState === "failed") {
        if (screenDisconnectTimer) { clearTimeout(screenDisconnectTimer); screenDisconnectTimer = null; }
        if (screenIceRestartCount < 3) {
          screenIceRestartCount++;
          const backoff = 1000 * screenIceRestartCount;
          setTimeout(() => {
            if (screenPeerConnectionsRef.current.get(targetSocketId) !== pc) return;
            pc.restartIce();
            pc.createOffer({ iceRestart: true }).then(offer => {
              if (screenPeerConnectionsRef.current.get(targetSocketId) !== pc) return;
              const h264Offer = preferH264(offer);
              pc.setLocalDescription(h264Offer);
              socket.emit("lesson:screen-offer", { lessonId, offer: h264Offer, targetSocketId });
            }).catch(() => {
              pc.close();
              screenPeerConnectionsRef.current.delete(targetSocketId);
            });
          }, backoff);
        } else {
          pc.close();
          screenPeerConnectionsRef.current.delete(targetSocketId);
        }
      } else if (pc.connectionState === "disconnected") {
        if (screenDisconnectTimer) clearTimeout(screenDisconnectTimer);
        screenDisconnectTimer = setTimeout(() => {
          if (screenPeerConnectionsRef.current.get(targetSocketId) !== pc) return;
          if (pc.connectionState === "disconnected" && screenIceRestartCount < 3) {
            screenIceRestartCount++;
            pc.restartIce();
            pc.createOffer({ iceRestart: true }).then(offer => {
              if (screenPeerConnectionsRef.current.get(targetSocketId) !== pc) return;
              const h264Offer = preferH264(offer);
              pc.setLocalDescription(h264Offer);
              socket.emit("lesson:screen-offer", { lessonId, offer: h264Offer, targetSocketId });
            }).catch(() => {});
          }
        }, 3000);
      }
    };

    const offer = await pc.createOffer();
    const h264Offer = preferH264(offer);
    await pc.setLocalDescription(h264Offer);
    socket.emit("lesson:screen-offer", { lessonId, offer: h264Offer, targetSocketId });
  };

  const stopScreenSharingCleanup = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    screenPeerConnectionsRef.current.forEach(pc => pc.close());
    screenPeerConnectionsRef.current.clear();
    setIsScreenSharing(false);
    setLessonMode("pdf");
    socketRef.current?.emit("lesson:mode-change", { lessonId, mode: "pdf" });
    socketRef.current?.emit("lesson:screen-sharing-status", { isScreenSharing: false });
  }, [lessonId]);

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      stopScreenSharingCleanup();
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        });

        screenStreamRef.current = stream;

        stream.getVideoTracks()[0].onended = () => {
          stopScreenSharingCleanup();
        };

        setIsScreenSharing(true);
        setLessonMode("screen");
        socketRef.current?.emit("lesson:mode-change", { lessonId, mode: "screen" });
        socketRef.current?.emit("lesson:screen-sharing-status", { isScreenSharing: true });

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
      constraints.audio = selectedAudioDevice
        ? { deviceId: { ideal: selectedAudioDevice }, echoCancellation: true, noiseSuppression: true }
        : { echoCancellation: true, noiseSuppression: true };
    }
    if (video) {
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      };
      if (selectedVideoDevice) videoConstraints.deviceId = { ideal: selectedVideoDevice };
      constraints.video = videoConstraints;
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
        const newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { ideal: deviceId }, echoCancellation: true, noiseSuppression: true } });
        newStream.getAudioTracks().forEach(t => localStreamRef.current!.addTrack(t));
        peerConnectionsRef.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === "audio");
          const newTrack = newStream.getAudioTracks()[0];
          if (sender && newTrack) sender.replaceTrack(newTrack);
        });
        if (showDeviceSettings) startAudioLevelMonitor();
      } catch {
        toast({ title: "Qurilmani almashtirish xatoligi", variant: "destructive" });
      }
    }
  };

  const stopAudioLevelMonitor = useCallback(() => {
    if (audioAnalyserRef.current) {
      cancelAnimationFrame(audioAnalyserRef.current.animId);
      audioAnalyserRef.current.source.disconnect();
      audioAnalyserRef.current.ctx.close().catch(() => {});
      audioAnalyserRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const startAudioLevelMonitor = useCallback(() => {
    stopAudioLevelMonitor();
    const stream = localStreamRef.current;
    if (!stream || stream.getAudioTracks().length === 0) {
      setAudioLevel(0);
      return;
    }
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        const id = requestAnimationFrame(tick);
        if (audioAnalyserRef.current) audioAnalyserRef.current.animId = id;
      };
      const animId = requestAnimationFrame(tick);
      audioAnalyserRef.current = { ctx, analyser, source, animId };
    } catch {
      setAudioLevel(0);
    }
  }, [stopAudioLevelMonitor]);

  useEffect(() => {
    if ((showDeviceSettings || isRecording) && audioEnabled && localStreamRef.current) {
      startAudioLevelMonitor();
    } else {
      stopAudioLevelMonitor();
    }
    return () => { stopAudioLevelMonitor(); };
  }, [showDeviceSettings, isRecording, audioEnabled, startAudioLevelMonitor, stopAudioLevelMonitor]);

  const switchVideoDevice = async (deviceId: string) => {
    setSelectedVideoDevice(deviceId);
    if (videoEnabled && localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => {
        t.stop();
        localStreamRef.current!.removeTrack(t);
      });
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { ideal: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
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

  const startRecording = async () => {
    try {
      const isVoiceOnly = lesson?.lessonType === "voice" && !isScreenSharing;

      if (isVoiceOnly) {
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

        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        setRecordingTime(0);
        recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
        toast({ title: "Ovoz yozib olish boshlandi" });
        return;
      }

      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      });

      recordScreenStreamRef.current = screenStream;

      const recordStream = new MediaStream();
      screenStream.getVideoTracks().forEach(t => recordStream.addTrack(t));
      screenStream.getAudioTracks().forEach(t => recordStream.addTrack(t));
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(t => recordStream.addTrack(t));
      }

      const { mime, ext } = getRecordingMimeType();
      const recorder = new MediaRecorder(recordStream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
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
        recordScreenStreamRef.current?.getTracks().forEach(t => t.stop());
        recordScreenStreamRef.current = null;
      };

      screenStream.getVideoTracks()[0].onended = () => {
        stopRecording();
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
      toast({ title: "Yozib olish boshlandi" });
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
    if (recordScreenStreamRef.current) {
      recordScreenStreamRef.current.getTracks().forEach(t => t.stop());
      recordScreenStreamRef.current = null;
    }
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
  }, [videoEnabled, lessonMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (lessonMode !== "pdf") return;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          if (currentPage < totalPages) handlePageChange(currentPage + 1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          if (currentPage > 1) handlePageChange(currentPage - 1);
          break;
        case "+":
        case "=":
          e.preventDefault();
          if (zoomLevel < 6) handleZoomChange(zoomLevel + 1);
          break;
        case "-":
          e.preventDefault();
          if (zoomLevel > 0) handleZoomChange(zoomLevel - 1);
          break;
        case "0":
          e.preventDefault();
          handleZoomChange(0);
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lessonMode, currentPage, totalPages, zoomLevel]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    socketRef.current?.emit("lesson:change-page", { lessonId, page });
    apiRequest("PATCH", `/api/live-lessons/${lessonId}`, { currentPage: page });
  };

  const handlePointerMove = (x: number, y: number, visible: boolean) => {
    socketRef.current?.emit("lesson:pointer-move", { lessonId, x, y, visible });
  };

  const lastViewportRef = useRef<{ scrollRatioX: number; scrollRatioY: number; visibleRatioW: number; visibleRatioH: number } | null>(null);

  const handleZoomChange = (newZoom: number) => {
    setZoomLevel(newZoom);
    socketRef.current?.emit("lesson:zoom-change", {
      lessonId,
      zoomLevel: newZoom,
      viewport: lastViewportRef.current || undefined,
    });
  };

  const handleViewportChange = useCallback((viewport: { scrollRatioX: number; scrollRatioY: number; visibleRatioW: number; visibleRatioH: number }) => {
    lastViewportRef.current = viewport;
    socketRef.current?.emit("lesson:zoom-change", { lessonId, zoomLevel, viewport });
  }, [lessonId, zoomLevel]);

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
    if (isResizing) return;
    e.preventDefault();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setVideoDragging(true);
    dragStart.current = { x: clientX, y: clientY, startLeft: videoPos.left, startTop: videoPos.top };
  };

  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setIsResizing(true);
    resizeStartRef.current = { x: clientX, y: clientY, startW: videoSize };
  };

  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!resizeStartRef.current) return;
      const clientX = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const dx = clientX - resizeStartRef.current.x;
      const dy = clientY - resizeStartRef.current.y;
      const delta = Math.max(dx, dy);
      const maxSize = Math.min(window.innerWidth / 2, window.innerHeight / 2);
      const newSize = Math.max(80, Math.min(maxSize, resizeStartRef.current.startW + delta));
      setVideoSize(newSize);
    };
    const handleUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };
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
  }, [isResizing]);

  useEffect(() => {
    if (!videoDragging) return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const dx = clientX - dragStart.current.x;
      const dy = clientY - dragStart.current.y;
      const newLeft = Math.max(0, Math.min(window.innerWidth - videoSize, dragStart.current.startLeft + dx));
      const newTop = Math.max(0, Math.min(window.innerHeight - videoSize, dragStart.current.startTop + dy));
      setVideoPos({ left: newLeft, top: newTop });
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
  }, [videoDragging, videoSize]);

  useEffect(() => {
    setVideoPos(prev => ({
      left: Math.max(0, Math.min(window.innerWidth - videoSize - 10, prev.left)),
      top: Math.max(0, Math.min(window.innerHeight - videoSize - 10, prev.top)),
    }));
  }, [videoSize]);

  useEffect(() => {
    const handleResize = () => {
      setVideoPos(prev => ({
        left: Math.max(0, Math.min(window.innerWidth - videoSize - 10, prev.left)),
        top: Math.max(0, Math.min(window.innerHeight - videoSize - 10, prev.top)),
      }));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [videoSize]);

  useEffect(() => {
    if (!socketRef.current || !videoEnabled) return;
    if (pipThrottleRef.current) clearTimeout(pipThrottleRef.current);
    pipThrottleRef.current = setTimeout(() => {
      const ratioX = videoPos.left / window.innerWidth;
      const ratioY = videoPos.top / window.innerHeight;
      const sizeRatio = videoSize / Math.min(window.innerWidth, window.innerHeight);
      socketRef.current?.emit("lesson:pip-change", {
        lessonId,
        posRatioX: ratioX,
        posRatioY: ratioY,
        sizeRatio,
        shape: videoShape,
      });
    }, 50);
    return () => {
      if (pipThrottleRef.current) clearTimeout(pipThrottleRef.current);
    };
  }, [videoPos.left, videoPos.top, videoSize, videoShape, videoEnabled, lessonId]);

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
    <div className="h-screen w-full overflow-hidden relative">
      <div className="absolute inset-0 z-0">
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
              <div className="flex items-center gap-2 px-4 py-2 bg-green-600/20 border border-green-500/30 rounded-lg" data-testid="voice-screen-share-status">
                <Monitor className="w-5 h-5 text-green-400" />
                <span className="text-sm text-green-300">Ekran ulashilmoqda</span>
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
            onViewportChange={handleViewportChange}
            externalZoom={zoomLevel}
            isHost
          />
        ) : (
          <div
            className="flex flex-col items-center justify-center w-full h-full bg-black relative gap-6"
            data-testid="screen-share-preview"
          >
            {isScreenSharing ? (
              <>
                <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center animate-pulse">
                  <Monitor className="w-10 h-10 text-green-400" />
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-semibold text-white">Ekran ulashilmoqda</h2>
                  <p className="text-sm text-white/60">O'quvchilar sizning ekraningizni ko'rmoqda</p>
                </div>
                <div className="flex items-center gap-3 text-sm text-white/50">
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" /> {participantCount} qatnashchi
                  </span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 text-white">
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

      <div className={`absolute top-0 left-0 right-0 z-30 flex items-center justify-between gap-1 p-1.5 sm:p-2 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`} data-testid="lesson-controls">
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap min-w-0">
          <Button size="icon" variant="ghost" className="text-white" onClick={() => navigate("/teacher/lessons")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="font-semibold text-xs sm:text-sm text-white truncate max-w-[80px] sm:max-w-[180px]" data-testid="text-lesson-name">
            {lesson.title}
          </span>
          <Badge variant="secondary" className="gap-1 bg-white/20 text-white border-0" data-testid="badge-participants">
            <Users className="w-3 h-3" /> {participantCount}
          </Badge>
          {(videoEnabled || isScreenSharing) && (
            <Badge
              variant="secondary"
              className={`gap-1 border-0 text-white ${
                networkQuality === "excellent" ? "bg-green-500/30" :
                networkQuality === "good" ? "bg-green-500/20" :
                networkQuality === "fair" ? "bg-yellow-500/30" :
                "bg-red-500/30"
              }`}
              data-testid="badge-network-quality"
            >
              {networkQuality === "poor" ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
              <span className="hidden sm:inline text-[10px]">
                {networkQuality === "excellent" ? "A'lo" : networkQuality === "good" ? "Yaxshi" : networkQuality === "fair" ? "O'rtacha" : "Past"}
              </span>
            </Badge>
          )}
          {lesson.requireCode && (
            <button onClick={copyCode} className="hidden sm:flex items-center gap-1 text-xs font-mono text-white/80" data-testid="button-lesson-code">
              <Lock className="w-3 h-3" /> {lesson.joinCode} <Copy className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 flex-wrap">
          <Button size="icon" variant="ghost" className={`toggle-elevate ${audioEnabled ? "toggle-elevated bg-white/20 text-white" : "text-white/60"}`} onClick={toggleAudio} data-testid="button-toggle-audio">
            {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </Button>
          <Button size="icon" variant="ghost" className={`toggle-elevate ${videoEnabled ? "toggle-elevated bg-white/20 text-white" : "text-white/60"}`} onClick={toggleVideo} data-testid="button-toggle-video">
            {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </Button>
          {videoEnabled && (
            <Button size="icon" variant="ghost" className="text-white" onClick={() => setVideoShape(s => s === "circle" ? "rectangle" : "circle")} data-testid="button-video-shape">
              {videoShape === "circle" ? <Circle className="w-4 h-4" /> : <RectangleHorizontal className="w-4 h-4" />}
            </Button>
          )}
          <Button size="icon" variant="ghost" className={`toggle-elevate ${isScreenSharing ? "toggle-elevated bg-white/20 text-white" : "text-white/60"}`} onClick={toggleScreenShare} data-testid="button-toggle-screen-share">
            {isScreenSharing ? <Monitor className="w-4 h-4" /> : <MonitorOff className="w-4 h-4" />}
          </Button>
          <Button size="icon" variant="ghost" className={`toggle-elevate ${showDeviceSettings ? "toggle-elevated bg-white/20 text-white" : "text-white/60"}`} onClick={() => setShowDeviceSettings(v => !v)} data-testid="button-device-settings">
            <Settings2 className="w-4 h-4" />
          </Button>
          {!isRecording ? (
            <Button size="icon" variant="ghost" className="text-red-400" onClick={() => startRecording()} data-testid="button-start-recording">
              <Circle className="w-4 h-4 fill-red-500" />
            </Button>
          ) : (
            <Button size="icon" variant="destructive" onClick={stopRecording} data-testid="button-stop-recording">
              <StopCircle className="w-4 h-4" />
            </Button>
          )}
          {isRecording && (
            <>
              <Badge variant="destructive" className="gap-1 animate-pulse" data-testid="badge-recording-time">
                <span className="w-2 h-2 rounded-full bg-white" /> {formatRecTime(recordingTime)}
              </Badge>
              {audioEnabled && (
                <div className="flex items-center gap-0.5" data-testid="recording-audio-level">
                  {[...Array(5)].map((_, i) => {
                    const threshold = (i + 1) * 20;
                    const active = audioLevel >= threshold;
                    return (
                      <div
                        key={i}
                        className="w-1 rounded-full transition-all duration-75"
                        style={{
                          height: `${6 + i * 2}px`,
                          backgroundColor: active
                            ? audioLevel > 80 ? "#ef4444" : audioLevel > 50 ? "#eab308" : "#22c55e"
                            : "rgba(255,255,255,0.3)",
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
          <Button size="icon" variant="ghost" className="text-white" onClick={copyLink} data-testid="button-copy-link">
            <Link2 className="w-4 h-4" />
          </Button>
          {!isStarted ? (
            <Button size="sm" className="bg-green-600 text-white border-green-600" onClick={handleStart} data-testid="button-start-lesson">
              <Play className="w-3 h-3 sm:mr-1" /> <span className="hidden sm:inline">Boshlash</span>
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={handleEnd} data-testid="button-end-lesson">
              <Square className="w-3 h-3 sm:mr-1" /> <span className="hidden sm:inline">Tugatish</span>
            </Button>
          )}
        </div>
      </div>

      {showDeviceSettings && showControls && (
        <div className="absolute top-12 left-0 right-0 z-20 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 p-2 bg-black/40 backdrop-blur-sm" data-testid="device-settings-panel">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Mic className="w-3.5 h-3.5 text-white/70 shrink-0" />
            <Select value={selectedAudioDevice} onValueChange={switchAudioDevice}>
              <SelectTrigger className="w-full sm:w-[200px] h-8 text-xs bg-white/10 border-white/20 text-white" data-testid="select-audio-device">
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
            <div className="flex items-center gap-1" data-testid="audio-level-meter">
              {[...Array(5)].map((_, i) => {
                const threshold = (i + 1) * 20;
                const active = audioLevel >= threshold;
                return (
                  <div
                    key={i}
                    className="w-1 rounded-full transition-all duration-75"
                    style={{
                      height: `${8 + i * 3}px`,
                      backgroundColor: active
                        ? audioLevel > 80 ? "#ef4444" : audioLevel > 50 ? "#eab308" : "#22c55e"
                        : "rgba(255,255,255,0.2)",
                    }}
                  />
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Video className="w-3.5 h-3.5 text-white/70 shrink-0" />
            <Select value={selectedVideoDevice} onValueChange={switchVideoDevice}>
              <SelectTrigger className="w-full sm:w-[200px] h-8 text-xs bg-white/10 border-white/20 text-white" data-testid="select-video-device">
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

      {lessonMode === "pdf" && totalPages > 0 && (
        <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-1 rounded-md bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`} data-testid="pdf-controls-overlay">
          <Button size="icon" variant="ghost" className="text-white" onClick={() => handlePageChange(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} data-testid="button-prev-page">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-white min-w-[50px] text-center" data-testid="text-page-indicator">
            {currentPage} / {totalPages}
          </span>
          <Button size="icon" variant="ghost" className="text-white" onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages} data-testid="button-next-page">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <div className="w-px h-5 bg-white/30 mx-1" />
          <Button size="icon" variant="ghost" className="text-white" onClick={() => handleZoomChange(Math.max(0, zoomLevel - 1))} disabled={zoomLevel <= 0} data-testid="button-zoom-out">
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs text-white min-w-[40px] text-center" data-testid="text-zoom-level">
            {Math.round(Math.pow(1.25, zoomLevel) * 100)}%
          </span>
          <Button size="icon" variant="ghost" className="text-white" onClick={() => handleZoomChange(Math.min(6, zoomLevel + 1))} disabled={zoomLevel >= 6} data-testid="button-zoom-in">
            <ZoomIn className="w-4 h-4" />
          </Button>
          {zoomLevel > 0 && (
            <Button size="icon" variant="ghost" className="text-white" onClick={() => handleZoomChange(0)} data-testid="button-fit-page">
              <Maximize2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}

      {videoEnabled && (
        <div
          className="fixed z-50"
          style={{
            left: `${videoPos.left}px`,
            top: `${videoPos.top}px`,
            width: `${videoSize}px`,
            height: videoShape === "circle" ? `${videoSize}px` : `${videoSize * 0.75}px`,
          }}
          onMouseEnter={() => setShowPipToolbar(true)}
          onMouseLeave={() => setShowPipToolbar(false)}
          data-testid="teacher-pip-video"
        >
          <div
            className={`relative w-full h-full overflow-hidden border-2 border-primary/50 shadow-lg ${
              videoShape === "circle" ? "rounded-full" : "rounded-lg"
            }`}
          >
            <video
              ref={(el) => {
                (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
                if (el && localStreamRef.current) {
                  el.srcObject = localStreamRef.current;
                }
              }}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <div
              className="absolute top-0 left-0 w-full h-8 sm:h-6 cursor-move flex items-center justify-center opacity-60 sm:opacity-0 hover:opacity-100 transition-opacity bg-black/30"
              onMouseDown={handleVideoDragStart}
              onTouchStart={handleVideoDragStart}
              data-testid="teacher-pip-drag-handle"
            >
              <GripVertical className="w-3 h-3 text-white" />
            </div>
            <div
              className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize z-10"
              style={{ background: "linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.6) 50%)" }}
              onMouseDown={handleResizeStart}
              onTouchStart={handleResizeStart}
              data-testid="teacher-pip-resize-handle"
            />
          </div>
          <div
            className={`absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1 py-0.5 rounded bg-black/60 backdrop-blur-sm transition-all duration-200 ${showPipToolbar ? "visible opacity-100" : "invisible opacity-0 sm:invisible sm:opacity-0"}`}
            style={{ visibility: typeof window !== "undefined" && window.innerWidth < 640 ? "visible" : undefined, opacity: typeof window !== "undefined" && window.innerWidth < 640 ? 1 : undefined }}
            data-testid="teacher-pip-toolbar"
          >
            <button className="p-1 text-white/80" onClick={() => setVideoSize(120)} data-testid="button-pip-small">
              <Minimize2 className="w-3 h-3" />
            </button>
            <button className="p-1 text-white/80" onClick={() => setVideoSize(200)} data-testid="button-pip-medium">
              <Square className="w-3 h-3" />
            </button>
            <button className="p-1 text-white/80" onClick={() => setVideoSize(Math.min(window.innerWidth / 2, window.innerHeight / 2))} data-testid="button-pip-large">
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      <LessonChat socket={socketState} isHost />

    </div>
  );
}
