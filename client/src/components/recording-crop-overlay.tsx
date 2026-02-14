import { useState, useRef, useCallback, useEffect } from "react";
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

  const left = `${crop.x * 100}%`;
  const top = `${crop.y * 100}%`;
  const width = `${crop.w * 100}%`;
  const height = `${crop.h * 100}%`;

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

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[200] pointer-events-none"
      data-testid="recording-crop-overlay"
    >
      <div
        className="absolute pointer-events-auto"
        style={{ left, top, width, height, cursor: dragging === "move" ? "grabbing" : "grab", touchAction: "none" }}
        onPointerDown={(e) => handlePointerDown(e, "move")}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        data-testid="recording-crop-region"
      >
        <div className="absolute inset-0 border-2 border-red-500 rounded-sm" />

        <div className="absolute -top-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-medium text-white whitespace-nowrap bg-red-600/80 pointer-events-none">
          REC
        </div>

        {handles.map(({ pos, cls }) => (
          <div
            key={pos}
            className={`absolute w-3 h-3 bg-red-500 rounded-full opacity-80 hover:opacity-100 z-10 pointer-events-auto ${cls}`}
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
