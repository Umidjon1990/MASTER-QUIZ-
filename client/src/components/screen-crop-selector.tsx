import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, RotateCcw, Crop, Monitor, Smartphone } from "lucide-react";

export interface CropRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ScreenCropSelectorProps {
  videoStream: MediaStream;
  onConfirm: (desktopCrop: CropRegion, mobileCrop: CropRegion) => void;
  onCancel: () => void;
}

export default function ScreenCropSelector({ videoStream, onConfirm, onCancel }: ScreenCropSelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  const [activeTab, setActiveTab] = useState<"desktop" | "mobile">("desktop");
  const [desktopCrop, setDesktopCrop] = useState<CropRegion | null>(null);
  const [mobileCrop, setMobileCrop] = useState<CropRegion | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<CropRegion | null>(null);
  const [ready, setReady] = useState(false);

  const videoMetaRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const renderInfoRef = useRef<{ offsetX: number; offsetY: number; renderW: number; renderH: number }>({ offsetX: 0, offsetY: 0, renderW: 0, renderH: 0 });

  useEffect(() => {
    const video = document.createElement("video");
    video.srcObject = videoStream;
    video.muted = true;
    video.playsInline = true;
    hiddenVideoRef.current = video;

    video.onloadedmetadata = () => {
      video.play();
      videoMetaRef.current = { w: video.videoWidth, h: video.videoHeight };
      setReady(true);
    };

    return () => {
      video.pause();
      video.srcObject = null;
    };
  }, [videoStream]);

  const computeRenderInfo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w: vw, h: vh } = videoMetaRef.current;
    if (!vw || !vh) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const videoAspect = vw / vh;
    const canvasAspect = cw / ch;

    let renderW: number, renderH: number, offsetX: number, offsetY: number;
    if (videoAspect > canvasAspect) {
      renderW = cw;
      renderH = cw / videoAspect;
      offsetX = 0;
      offsetY = (ch - renderH) / 2;
    } else {
      renderH = ch;
      renderW = ch * videoAspect;
      offsetX = (cw - renderW) / 2;
      offsetY = 0;
    }
    renderInfoRef.current = { offsetX, offsetY, renderW, renderH };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const video = hiddenVideoRef.current;
    if (!canvas || !video) return;

    const resize = () => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      computeRenderInfo();
    };
    resize();
    window.addEventListener("resize", resize);

    const ctx = canvas.getContext("2d")!;
    const drawFrame = () => {
      const { offsetX, offsetY, renderW, renderH } = renderInfoRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(video, offsetX, offsetY, renderW, renderH);

      animFrameRef.current = requestAnimationFrame(drawFrame);
    };
    animFrameRef.current = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [ready, computeRenderInfo]);

  const clientToRatio = useCallback((clientX: number, clientY: number): { rx: number; ry: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { rx: 0, ry: 0 };
    const rect = canvas.getBoundingClientRect();
    const { offsetX, offsetY, renderW, renderH } = renderInfoRef.current;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const rx = Math.max(0, Math.min(1, (px - offsetX) / renderW));
    const ry = Math.max(0, Math.min(1, (py - offsetY) / renderH));
    return { rx, ry };
  }, []);

  const ratioToCanvas = useCallback((r: CropRegion) => {
    const { offsetX, offsetY, renderW, renderH } = renderInfoRef.current;
    return {
      left: offsetX + r.x * renderW,
      top: offsetY + r.y * renderH,
      width: r.w * renderW,
      height: r.h * renderH,
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const { rx, ry } = clientToRatio(e.clientX, e.clientY);
    setStartPoint({ x: rx, y: ry });
    setDrawing(true);
    setCurrentRect(null);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drawing || !startPoint) return;
    const { rx, ry } = clientToRatio(e.clientX, e.clientY);
    setCurrentRect({
      x: Math.min(startPoint.x, rx),
      y: Math.min(startPoint.y, ry),
      w: Math.abs(rx - startPoint.x),
      h: Math.abs(ry - startPoint.y),
    });
  };

  const handlePointerUp = () => {
    if (!drawing || !currentRect) {
      setDrawing(false);
      return;
    }
    setDrawing(false);
    if (currentRect.w < 0.03 || currentRect.h < 0.03) return;

    if (activeTab === "desktop") {
      setDesktopCrop(currentRect);
    } else {
      setMobileCrop(currentRect);
    }
    setCurrentRect(null);
  };

  const activeCrop = activeTab === "desktop" ? desktopCrop : mobileCrop;
  const displayRect = drawing && currentRect ? currentRect : activeCrop;

  const resetCrop = () => {
    if (activeTab === "desktop") setDesktopCrop(null);
    else setMobileCrop(null);
  };

  const handleConfirm = () => {
    const dc = desktopCrop || { x: 0, y: 0, w: 1, h: 1 };
    const mc = mobileCrop || dc;
    onConfirm(dc, mc);
  };

  const borderColor = activeTab === "desktop" ? "#3b82f6" : "#a855f7";

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col" data-testid="screen-crop-overlay">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-700 shrink-0">
        <div className="flex items-center gap-3">
          <Crop className="w-5 h-5 text-white shrink-0" />
          <span className="text-white font-medium text-sm hidden sm:inline">Ekranni qirqish</span>

          <div className="flex rounded-md border border-zinc-600 overflow-visible ml-2">
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors ${activeTab === "desktop" ? "bg-blue-600 text-white" : "text-zinc-400"}`}
              onClick={() => setActiveTab("desktop")}
              data-testid="button-crop-desktop-tab"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kompyuter</span>
              {desktopCrop && <Check className="w-3 h-3 text-green-300" />}
            </button>
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors ${activeTab === "mobile" ? "bg-purple-600 text-white" : "text-zinc-400"}`}
              onClick={() => setActiveTab("mobile")}
              data-testid="button-crop-mobile-tab"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mobil</span>
              {mobileCrop && <Check className="w-3 h-3 text-green-300" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={resetCrop} className="text-zinc-300 gap-1" data-testid="button-reset-crop">
            <RotateCcw className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Tozalash</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} className="text-zinc-300 gap-1" data-testid="button-cancel-crop">
            <X className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Bekor</span>
          </Button>
          <Button size="sm" onClick={handleConfirm} className="bg-green-600 text-white border-green-600 gap-1" data-testid="button-confirm-crop">
            <Check className="w-3.5 h-3.5" /> Tasdiqlash
          </Button>
        </div>
      </div>

      <div className="px-3 py-1.5 bg-zinc-900/80 text-center shrink-0">
        <p className="text-zinc-400 text-xs">
          Sichqonchani bosib tortib, {activeTab === "desktop" ? "kompyuter" : "mobil"} talabalariga ko'rsatiladigan qismni belgilang
        </p>
      </div>

      <div ref={containerRef} className="flex-1 relative min-h-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ cursor: "crosshair", touchAction: "none" }}
          data-testid="crop-draw-area"
        />

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {ready && displayRect && (() => {
          const px = ratioToCanvas(displayRect);
          const canvas = canvasRef.current;
          if (!canvas) return null;
          const cRect = canvas.getBoundingClientRect();
          return (
            <>
              <svg
                className="absolute inset-0 pointer-events-none"
                width={cRect.width}
                height={cRect.height}
                style={{ position: "absolute", top: 0, left: 0 }}
              >
                <defs>
                  <mask id="cropMask">
                    <rect width="100%" height="100%" fill="white" />
                    <rect x={px.left} y={px.top} width={px.width} height={px.height} fill="black" />
                  </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#cropMask)" />
              </svg>

              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${px.left}px`,
                  top: `${px.top}px`,
                  width: `${px.width}px`,
                  height: `${px.height}px`,
                  border: `2px solid ${borderColor}`,
                  boxShadow: `0 0 0 1px rgba(0,0,0,0.5), 0 0 20px ${borderColor}40`,
                }}
                data-testid="crop-selection-rect"
              >
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[10px] font-medium text-white whitespace-nowrap" style={{ background: borderColor }}>
                  {activeTab === "desktop" ? "Kompyuter" : "Mobil"}
                </div>

                <div className="absolute w-2.5 h-2.5 rounded-full -top-1 -left-1" style={{ background: borderColor }} />
                <div className="absolute w-2.5 h-2.5 rounded-full -top-1 -right-1" style={{ background: borderColor }} />
                <div className="absolute w-2.5 h-2.5 rounded-full -bottom-1 -left-1" style={{ background: borderColor }} />
                <div className="absolute w-2.5 h-2.5 rounded-full -bottom-1 -right-1" style={{ background: borderColor }} />
              </div>
            </>
          );
        })()}

        {ready && activeTab === "mobile" && desktopCrop && !drawing && (() => {
          const px = ratioToCanvas(desktopCrop);
          return (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${px.left}px`,
                top: `${px.top}px`,
                width: `${px.width}px`,
                height: `${px.height}px`,
                border: "1px dashed rgba(59,130,246,0.4)",
              }}
            />
          );
        })()}

        {ready && activeTab === "desktop" && mobileCrop && !drawing && (() => {
          const px = ratioToCanvas(mobileCrop);
          return (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${px.left}px`,
                top: `${px.top}px`,
                width: `${px.width}px`,
                height: `${px.height}px`,
                border: "1px dashed rgba(168,85,247,0.4)",
              }}
            />
          );
        })()}
      </div>
    </div>
  );
}
