import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Crop } from "lucide-react";

export interface CropRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RecordCropSelectorProps {
  videoStream: MediaStream;
  onConfirm: (crop: CropRegion | null) => void;
  onCancel: () => void;
}

export default function RecordCropSelector({ videoStream, onConfirm, onCancel }: RecordCropSelectorProps) {
  const imgCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [crop, setCrop] = useState<CropRegion | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<CropRegion | null>(null);
  const [ready, setReady] = useState(false);

  const renderInfoRef = useRef<{ offsetX: number; offsetY: number; renderW: number; renderH: number }>({ offsetX: 0, offsetY: 0, renderW: 0, renderH: 0 });
  const imgSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const captureSnapshot = useCallback(() => {
    return new Promise<string>((resolve, reject) => {
      const video = document.createElement("video");
      video.srcObject = videoStream;
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        video.play();
        setTimeout(() => {
          const c = document.createElement("canvas");
          c.width = video.videoWidth;
          c.height = video.videoHeight;
          const ctx = c.getContext("2d");
          if (!ctx) { reject("no ctx"); return; }
          ctx.drawImage(video, 0, 0);
          video.pause();
          video.srcObject = null;
          resolve(c.toDataURL("image/png"));
        }, 300);
      };
      video.onerror = () => reject("video error");
    });
  }, [videoStream]);

  const computeRenderInfo = useCallback(() => {
    const canvas = imgCanvasRef.current;
    if (!canvas) return;
    const { w: vw, h: vh } = imgSizeRef.current;
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

  const drawSnapshot = useCallback(() => {
    const canvas = imgCanvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    computeRenderInfo();

    const { offsetX, offsetY, renderW, renderH } = renderInfoRef.current;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, offsetX, offsetY, renderW, renderH);
  }, [computeRenderInfo]);

  useEffect(() => {
    let cancelled = false;
    captureSnapshot().then(dataUrl => {
      if (cancelled) return;
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        imgRef.current = img;
        imgSizeRef.current = { w: img.naturalWidth, h: img.naturalHeight };
        setReady(true);
      };
      img.src = dataUrl;
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [captureSnapshot]);

  useEffect(() => {
    if (!ready) return;
    drawSnapshot();
    const handleResize = () => drawSnapshot();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [ready, drawSnapshot]);

  const clientToRatio = useCallback((clientX: number, clientY: number): { rx: number; ry: number } => {
    const canvas = imgCanvasRef.current;
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
    setCrop(currentRect);
    setCurrentRect(null);
  };

  const displayRect = drawing && currentRect ? currentRect : crop;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col" data-testid="record-crop-overlay">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-700 shrink-0">
        <div className="flex items-center gap-3">
          <Crop className="w-5 h-5 text-red-400 shrink-0" />
          <span className="text-white font-medium text-sm">Yozib olish uchun qismni belgilang</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={onCancel} className="text-zinc-300 gap-1" data-testid="button-cancel-record-crop">
            <X className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Bekor</span>
          </Button>
          <Button size="sm" onClick={() => onConfirm(null)} variant="ghost" className="text-zinc-300 gap-1" data-testid="button-record-full">
            To'liq ekran
          </Button>
          <Button size="sm" onClick={() => onConfirm(crop)} disabled={!crop} className="bg-red-600 text-white border-red-600 gap-1" data-testid="button-confirm-record-crop">
            <Check className="w-3.5 h-3.5" /> Yozishni boshlash
          </Button>
        </div>
      </div>

      <div className="px-3 py-1.5 bg-zinc-900/80 text-center shrink-0">
        <p className="text-zinc-400 text-xs">
          Sichqonchani bosib tortib, yozib olinadigan qismni belgilang. Yoki "To'liq ekran" bosing.
        </p>
      </div>

      <div ref={containerRef} className="flex-1 relative min-h-0 overflow-hidden">
        <canvas
          ref={imgCanvasRef}
          className="absolute inset-0 w-full h-full"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ cursor: "crosshair", touchAction: "none" }}
          data-testid="record-crop-draw-area"
        />

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <p className="text-zinc-400 text-sm">Ekran rasmi olinmoqda...</p>
            </div>
          </div>
        )}

        {ready && displayRect && (() => {
          const px = ratioToCanvas(displayRect);
          const canvas = imgCanvasRef.current;
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
                  <mask id="recordCropMask">
                    <rect width="100%" height="100%" fill="white" />
                    <rect x={px.left} y={px.top} width={px.width} height={px.height} fill="black" />
                  </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#recordCropMask)" />
              </svg>

              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${px.left}px`,
                  top: `${px.top}px`,
                  width: `${px.width}px`,
                  height: `${px.height}px`,
                  border: "2px solid #ef4444",
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.5), 0 0 20px rgba(239,68,68,0.25)",
                }}
                data-testid="record-crop-selection-rect"
              >
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[10px] font-medium text-white whitespace-nowrap bg-red-600">
                  Yozib olinadi
                </div>
                <div className="absolute w-2.5 h-2.5 rounded-full -top-1 -left-1 bg-red-500" />
                <div className="absolute w-2.5 h-2.5 rounded-full -top-1 -right-1 bg-red-500" />
                <div className="absolute w-2.5 h-2.5 rounded-full -bottom-1 -left-1 bg-red-500" />
                <div className="absolute w-2.5 h-2.5 rounded-full -bottom-1 -right-1 bg-red-500" />
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
