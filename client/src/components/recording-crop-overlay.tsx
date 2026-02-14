import { useState, useRef, useCallback, useEffect } from "react";
import { Move } from "lucide-react";
import type { CropRegion } from "@/components/record-crop-selector";

interface RecordingCropOverlayProps {
  crop: CropRegion;
  onChange: (crop: CropRegion) => void;
}

export default function RecordingCropOverlay({ crop, onChange }: RecordingCropOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const dragStartRef = useRef<{ mx: number; my: number; crop: CropRegion }>({ mx: 0, my: 0, crop: crop });

  const getContainerRect = useCallback(() => {
    return containerRef.current?.getBoundingClientRect() || { left: 0, top: 0, width: 1, height: 1 };
  }, []);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const handlePointerDown = useCallback((e: React.PointerEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(handle);
    dragStartRef.current = { mx: e.clientX, my: e.clientY, crop: { ...crop } };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [crop]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const rect = getContainerRect();
    const dx = (e.clientX - dragStartRef.current.mx) / rect.width;
    const dy = (e.clientY - dragStartRef.current.my) / rect.height;
    const c = dragStartRef.current.crop;
    let nx = c.x, ny = c.y, nw = c.w, nh = c.h;

    if (dragging === "move") {
      nx = clamp(c.x + dx, 0, 1 - c.w);
      ny = clamp(c.y + dy, 0, 1 - c.h);
    } else {
      if (dragging.includes("l")) {
        const newX = clamp(c.x + dx, 0, c.x + c.w - 0.05);
        nw = c.w - (newX - c.x);
        nx = newX;
      }
      if (dragging.includes("r")) {
        nw = clamp(c.w + dx, 0.05, 1 - c.x);
      }
      if (dragging.includes("t")) {
        const newY = clamp(c.y + dy, 0, c.y + c.h - 0.05);
        nh = c.h - (newY - c.y);
        ny = newY;
      }
      if (dragging.includes("b")) {
        nh = clamp(c.h + dy, 0.05, 1 - c.y);
      }
    }
    onChange({ x: nx, y: ny, w: nw, h: nh });
  }, [dragging, getContainerRect, onChange]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const up = () => setDragging(null);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [dragging]);

  const pxLeft = `${crop.x * 100}%`;
  const pxTop = `${crop.y * 100}%`;
  const pxW = `${crop.w * 100}%`;
  const pxH = `${crop.h * 100}%`;

  const handles = [
    { pos: "tl", cls: "-top-1.5 -left-1.5 cursor-nwse-resize" },
    { pos: "tr", cls: "-top-1.5 -right-1.5 cursor-nesw-resize" },
    { pos: "bl", cls: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
    { pos: "br", cls: "-bottom-1.5 -right-1.5 cursor-nwse-resize" },
    { pos: "t", cls: "-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize" },
    { pos: "b", cls: "-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize" },
    { pos: "l", cls: "top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize" },
    { pos: "r", cls: "top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize" },
  ];

  const edgeHitSize = 8;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[200] pointer-events-none"
      data-testid="recording-crop-overlay"
    >
      <div
        className="absolute pointer-events-none"
        style={{ left: pxLeft, top: pxTop, width: pxW, height: pxH }}
        data-testid="recording-crop-region"
      >
        <div className="absolute inset-0 pointer-events-none" style={{ border: "2px solid rgba(0,0,0,0.7)", borderRadius: 2 }} />

        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium text-white whitespace-nowrap bg-red-600/90 pointer-events-none">
          REC
        </div>

        <div
          className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded bg-black/50 pointer-events-auto"
          style={{ cursor: dragging === "move" ? "grabbing" : "grab", touchAction: "none" }}
          onPointerDown={(e) => handlePointerDown(e, "move")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          data-testid="recording-crop-move-handle"
        >
          <Move className="w-3.5 h-3.5 text-white" />
        </div>

        <div
          className="absolute pointer-events-auto"
          style={{ top: -edgeHitSize / 2, left: edgeHitSize, right: edgeHitSize, height: edgeHitSize, cursor: "ns-resize", touchAction: "none" }}
          onPointerDown={(e) => handlePointerDown(e, "t")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
        <div
          className="absolute pointer-events-auto"
          style={{ bottom: -edgeHitSize / 2, left: edgeHitSize, right: edgeHitSize, height: edgeHitSize, cursor: "ns-resize", touchAction: "none" }}
          onPointerDown={(e) => handlePointerDown(e, "b")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
        <div
          className="absolute pointer-events-auto"
          style={{ left: -edgeHitSize / 2, top: edgeHitSize, bottom: edgeHitSize, width: edgeHitSize, cursor: "ew-resize", touchAction: "none" }}
          onPointerDown={(e) => handlePointerDown(e, "l")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
        <div
          className="absolute pointer-events-auto"
          style={{ right: -edgeHitSize / 2, top: edgeHitSize, bottom: edgeHitSize, width: edgeHitSize, cursor: "ew-resize", touchAction: "none" }}
          onPointerDown={(e) => handlePointerDown(e, "r")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />

        {handles.map(({ pos, cls }) => (
          <div
            key={pos}
            className={`absolute w-3 h-3 bg-black/70 rounded-full opacity-80 hover:opacity-100 z-10 pointer-events-auto ${cls}`}
            style={{ touchAction: "none" }}
            onPointerDown={(e) => handlePointerDown(e, pos)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            data-testid={`recording-crop-handle-${pos}`}
          />
        ))}
      </div>
    </div>
  );
}
