import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Monitor, Smartphone, Check, RotateCcw, Crop } from "lucide-react";

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
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<"desktop" | "mobile">("desktop");
  const [desktopCrop, setDesktopCrop] = useState<CropRegion | null>(null);
  const [mobileCrop, setMobileCrop] = useState<CropRegion | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video) return;
    video.srcObject = videoStream;
    video.onloadedmetadata = () => {
      video.play();
      setVideoReady(true);
    };
  }, [videoStream]);

  const getVideoRect = useCallback(() => {
    const video = previewVideoRef.current;
    const container = containerRef.current;
    if (!video || !container) return null;

    const containerRect = container.getBoundingClientRect();
    const videoW = video.videoWidth;
    const videoH = video.videoHeight;
    if (!videoW || !videoH) return null;

    const containerAspect = containerRect.width / containerRect.height;
    const videoAspect = videoW / videoH;

    let renderW: number, renderH: number, offsetX: number, offsetY: number;
    if (videoAspect > containerAspect) {
      renderW = containerRect.width;
      renderH = containerRect.width / videoAspect;
      offsetX = 0;
      offsetY = (containerRect.height - renderH) / 2;
    } else {
      renderH = containerRect.height;
      renderW = containerRect.height * videoAspect;
      offsetX = (containerRect.width - renderW) / 2;
      offsetY = 0;
    }

    return { renderW, renderH, offsetX, offsetY, containerRect, videoW, videoH };
  }, []);

  const clientToRatio = useCallback((clientX: number, clientY: number) => {
    const info = getVideoRect();
    if (!info) return { rx: 0, ry: 0 };
    const { renderW, renderH, offsetX, offsetY, containerRect } = info;
    const rx = Math.max(0, Math.min(1, (clientX - containerRect.left - offsetX) / renderW));
    const ry = Math.max(0, Math.min(1, (clientY - containerRect.top - offsetY) / renderH));
    return { rx, ry };
  }, [getVideoRect]);

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
    const x = Math.min(startPoint.x, rx);
    const y = Math.min(startPoint.y, ry);
    const w = Math.abs(rx - startPoint.x);
    const h = Math.abs(ry - startPoint.y);
    setCurrentRect({ x, y, w, h });
  };

  const handlePointerUp = () => {
    if (!drawing || !currentRect) {
      setDrawing(false);
      return;
    }
    setDrawing(false);

    if (currentRect.w < 0.02 || currentRect.h < 0.02) return;

    const crop: CropRegion = {
      x: currentRect.x,
      y: currentRect.y,
      w: currentRect.w,
      h: currentRect.h,
    };

    if (activeTab === "desktop") {
      setDesktopCrop(crop);
    } else {
      setMobileCrop(crop);
    }
    setCurrentRect(null);
  };

  const activeCrop = activeTab === "desktop" ? desktopCrop : mobileCrop;
  const displayRect = drawing && currentRect ? currentRect : activeCrop;

  const rectToPixels = (r: { x: number; y: number; w: number; h: number }) => {
    const info = getVideoRect();
    if (!info) return { left: 0, top: 0, width: 0, height: 0 };
    const { renderW, renderH, offsetX, offsetY } = info;
    return {
      left: offsetX + r.x * renderW,
      top: offsetY + r.y * renderH,
      width: r.w * renderW,
      height: r.h * renderH,
    };
  };

  const resetCrop = () => {
    if (activeTab === "desktop") setDesktopCrop(null);
    else setMobileCrop(null);
  };

  const handleConfirm = () => {
    const dc = desktopCrop || { x: 0, y: 0, w: 1, h: 1 };
    const mc = mobileCrop || dc;
    onConfirm(dc, mc);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex flex-col" data-testid="screen-crop-overlay">
      <div className="flex items-center justify-between gap-2 p-3 bg-black/60 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Crop className="w-5 h-5 text-white" />
          <span className="text-white font-semibold text-sm sm:text-base">Ekran qirqish sozlamalari</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md overflow-hidden border border-white/20">
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm transition-colors ${activeTab === "desktop" ? "bg-white/20 text-white" : "text-white/60"}`}
              onClick={() => setActiveTab("desktop")}
              data-testid="button-crop-desktop-tab"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Kompyuter</span>
              {desktopCrop && <Check className="w-3 h-3 text-green-400" />}
            </button>
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm transition-colors ${activeTab === "mobile" ? "bg-white/20 text-white" : "text-white/60"}`}
              onClick={() => setActiveTab("mobile")}
              data-testid="button-crop-mobile-tab"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Mobil</span>
              {mobileCrop && <Check className="w-3 h-3 text-green-400" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 min-h-0">
        <div className="text-center mb-2 absolute top-16 left-1/2 -translate-x-1/2 z-10">
          <p className="text-white/70 text-xs sm:text-sm">
            {activeTab === "desktop" ? "Kompyuter" : "Mobil"} uchun ko'rsatiladigan qismni sichqoncha bilan belgilang
          </p>
        </div>
        <div
          ref={containerRef}
          className="relative w-full h-full max-w-[90vw] max-h-[70vh] flex items-center justify-center select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ cursor: "crosshair", touchAction: "none" }}
          data-testid="crop-draw-area"
        >
          <video
            ref={previewVideoRef}
            autoPlay
            playsInline
            muted
            className="max-w-full max-h-full object-contain pointer-events-none"
            data-testid="crop-preview-video"
          />

          {!videoReady && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white/60 text-sm">Yuklanmoqda...</span>
            </div>
          )}

          {videoReady && displayRect && (() => {
            const px = rectToPixels(displayRect);
            return (
              <>
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: `${px.left}px`,
                    top: `${px.top}px`,
                    width: `${px.width}px`,
                    height: `${px.height}px`,
                    border: `2px solid ${activeTab === "desktop" ? "#3b82f6" : "#8b5cf6"}`,
                    background: `${activeTab === "desktop" ? "rgba(59,130,246,0.1)" : "rgba(139,92,246,0.1)"}`,
                  }}
                  data-testid="crop-selection-rect"
                >
                  <Badge
                    variant="secondary"
                    className="absolute -top-6 left-0 text-[10px] px-1.5 py-0"
                    style={{ background: activeTab === "desktop" ? "#3b82f6" : "#8b5cf6", color: "white", border: "none" }}
                  >
                    {activeTab === "desktop" ? "Kompyuter" : "Mobil"}
                  </Badge>
                </div>

                <div className="absolute inset-0 pointer-events-none" style={{
                  background: `
                    linear-gradient(to bottom, rgba(0,0,0,0.5) ${px.top}px, transparent ${px.top}px, transparent ${px.top + px.height}px, rgba(0,0,0,0.5) ${px.top + px.height}px)
                  `,
                }} />
              </>
            );
          })()}

          {videoReady && activeTab === "mobile" && desktopCrop && !drawing && (() => {
            const px = rectToPixels(desktopCrop);
            return (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${px.left}px`,
                  top: `${px.top}px`,
                  width: `${px.width}px`,
                  height: `${px.height}px`,
                  border: "1px dashed rgba(59,130,246,0.5)",
                }}
              >
                <Badge
                  variant="secondary"
                  className="absolute -top-5 left-0 text-[9px] px-1 py-0 opacity-60"
                  style={{ background: "#3b82f6", color: "white", border: "none" }}
                >
                  Kompyuter
                </Badge>
              </div>
            );
          })()}

          {videoReady && activeTab === "desktop" && mobileCrop && !drawing && (() => {
            const px = rectToPixels(mobileCrop);
            return (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${px.left}px`,
                  top: `${px.top}px`,
                  width: `${px.width}px`,
                  height: `${px.height}px`,
                  border: "1px dashed rgba(139,92,246,0.5)",
                }}
              >
                <Badge
                  variant="secondary"
                  className="absolute -top-5 left-0 text-[9px] px-1 py-0 opacity-60"
                  style={{ background: "#8b5cf6", color: "white", border: "none" }}
                >
                  Mobil
                </Badge>
              </div>
            );
          })()}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 p-3 bg-black/60 border-t border-white/10">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={resetCrop} className="text-white border-white/20" data-testid="button-reset-crop">
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Qayta belgilash
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onCancel} className="text-white border-white/20" data-testid="button-cancel-crop">
            Bekor qilish
          </Button>
          <Button size="sm" onClick={handleConfirm} className="bg-green-600 text-white border-green-600" disabled={!desktopCrop && !mobileCrop} data-testid="button-confirm-crop">
            <Check className="w-3.5 h-3.5 mr-1" /> Tasdiqlash
          </Button>
        </div>
      </div>
    </div>
  );
}
