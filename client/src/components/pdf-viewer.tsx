import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PDFViewerProps {
  url: string;
  currentPage: number;
  onPageChange?: (page: number) => void;
  onTotalPages?: (total: number) => void;
  onPointerMove?: (x: number, y: number, visible: boolean) => void;
  pointerPosition?: { x: number; y: number; visible: boolean } | null;
  isHost?: boolean;
  className?: string;
  onZoomChange?: (zoomLevel: number) => void;
  externalZoom?: number;
}

export default function PDFViewer({
  url,
  currentPage,
  onPageChange,
  onTotalPages,
  onPointerMove,
  pointerPosition,
  isHost = false,
  className = "",
  onZoomChange,
  externalZoom,
}: PDFViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const renderTaskRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  const lastTouchDistRef = useRef<number | null>(null);
  const touchDragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  useEffect(() => {
    if (externalZoom !== undefined) {
      setZoomLevel(externalZoom);
    }
  }, [externalZoom]);

  const updateZoom = useCallback((newZoomOrUpdater: number | ((prev: number) => number)) => {
    setZoomLevel(prev => {
      const newZoom = typeof newZoomOrUpdater === "function" ? newZoomOrUpdater(prev) : newZoomOrUpdater;
      onZoomChange?.(newZoom);
      return newZoom;
    });
  }, [onZoomChange]);

  useEffect(() => {
    let cancelled = false;
    const loadPdf = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const pdf = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        setTotalPages(pdf.numPages);
        onTotalPages?.(pdf.numPages);
        setIsLoading(false);
      } catch (err: any) {
        console.error("PDF load error:", err);
        setError("PDF yuklanmadi");
        setIsLoading(false);
      }
    };
    loadPdf();
    return () => { cancelled = true; };
  }, [url]);

  const renderPage = useCallback(async () => {
    if (!pdfRef.current || !canvasRef.current || !containerRef.current) return;

    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    } catch {}

    try {
      const page = await pdfRef.current.getPage(currentPage);
      const container = containerRef.current;
      const containerWidth = container.clientWidth - 16;
      const containerHeight = container.clientHeight - 16;

      if (containerWidth <= 0 || containerHeight <= 0) return;

      const viewport = page.getViewport({ scale: 1 });
      const scaleX = containerWidth / viewport.width;
      const scaleY = containerHeight / viewport.height;
      const fitScale = Math.min(scaleX, scaleY);
      const zoomMultiplier = 1 + (zoomLevel * 0.15);
      const finalScale = fitScale * zoomMultiplier;

      const scaledViewport = page.getViewport({ scale: finalScale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = scaledViewport.width * dpr;
      canvas.height = scaledViewport.height * dpr;
      canvas.style.width = `${scaledViewport.width}px`;
      canvas.style.height = `${scaledViewport.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const renderTask = page.render({
        canvasContext: ctx,
        viewport: scaledViewport,
        canvas: canvas,
      } as any);
      renderTaskRef.current = renderTask;
      await renderTask.promise;
    } catch (err: any) {
      if (err?.name !== "RenderingCancelledException") {
        console.error("PDF render error:", err);
      }
    }
  }, [currentPage, zoomLevel]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    resizeObserverRef.current = new ResizeObserver(() => {
      renderPage();
    });
    resizeObserverRef.current.observe(container);

    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [renderPage]);

  useEffect(() => {
    if (zoomLevel <= 0 && containerRef.current) {
      containerRef.current.scrollLeft = 0;
      containerRef.current.scrollTop = 0;
    }
  }, [zoomLevel]);

  const isZoomed = zoomLevel > 0;

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isZoomed || !containerRef.current) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop,
    };
  }, [isZoomed]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging && dragStartRef.current && containerRef.current) {
      e.preventDefault();
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      containerRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx;
      containerRef.current.scrollTop = dragStartRef.current.scrollTop - dy;
    }

    if (!isDragging && isHost && onPointerMove && canvasRef.current) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      onPointerMove(x, y, true);
    }
  }, [isDragging, isHost, onPointerMove]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
    if (isHost && onPointerMove) {
      onPointerMove(0, 0, false);
    }
  }, [isHost, onPointerMove]);

  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      lastTouchDistRef.current = getTouchDistance(e.touches);
      touchDragStartRef.current = null;
    } else if (e.touches.length === 1 && isZoomed && containerRef.current) {
      touchDragStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        scrollLeft: containerRef.current.scrollLeft,
        scrollTop: containerRef.current.scrollTop,
      };
    }
  }, [isZoomed]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && lastTouchDistRef.current !== null) {
      e.preventDefault();
      const currentDist = getTouchDistance(e.touches);
      const diff = currentDist - lastTouchDistRef.current;
      if (Math.abs(diff) > 20) {
        const direction = diff > 0 ? 1 : -1;
        updateZoom(z => Math.max(-3, Math.min(8, z + direction)));
        lastTouchDistRef.current = currentDist;
      }
    } else if (e.touches.length === 1 && touchDragStartRef.current && containerRef.current) {
      e.preventDefault();
      const dx = e.touches[0].clientX - touchDragStartRef.current.x;
      const dy = e.touches[0].clientY - touchDragStartRef.current.y;
      containerRef.current.scrollLeft = touchDragStartRef.current.scrollLeft - dx;
      containerRef.current.scrollTop = touchDragStartRef.current.scrollTop - dy;
    }
  }, [updateZoom]);

  const handleTouchEnd = useCallback(() => {
    lastTouchDistRef.current = null;
    touchDragStartRef.current = null;
  }, []);

  return (
    <div className={`flex flex-col h-full w-full ${className}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b bg-background/80 backdrop-blur-sm flex-wrap" data-testid="pdf-toolbar">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onPageChange?.(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1 || !isHost}
            data-testid="button-prev-page"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm min-w-[60px] text-center" data-testid="text-page-indicator">
            {currentPage} / {totalPages}
          </span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onPageChange?.(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages || !isHost}
            data-testid="button-next-page"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => updateZoom(z => Math.max(-3, z - 1))} data-testid="button-zoom-out">
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs min-w-[40px] text-center text-muted-foreground" data-testid="text-zoom-level">
            {Math.round((1 + zoomLevel * 0.15) * 100)}%
          </span>
          <Button size="icon" variant="ghost" onClick={() => updateZoom(z => Math.min(8, z + 1))} data-testid="button-zoom-in">
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => updateZoom(0)} data-testid="button-fit-width">
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`flex-1 flex items-center justify-center bg-muted/30 relative min-h-0 ${isZoomed ? "overflow-auto cursor-grab" : "overflow-hidden"} ${isDragging ? "cursor-grabbing" : ""}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        data-testid="pdf-canvas-container"
      >
        {isLoading ? (
          <div className="flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center text-muted-foreground p-4">
            <p>{error}</p>
          </div>
        ) : (
          <div className="relative inline-block">
            <canvas ref={canvasRef} className="block" data-testid="pdf-canvas" />
            {pointerPosition && pointerPosition.visible && (
              <div
                className="absolute pointer-events-none z-50"
                style={{
                  left: `${pointerPosition.x}%`,
                  top: `${pointerPosition.y}%`,
                  transform: "translate(-50%, -50%)",
                }}
                data-testid="laser-pointer"
              >
                <div className="w-5 h-5 rounded-full bg-red-500 opacity-80 animate-pulse shadow-[0_0_12px_4px_rgba(239,68,68,0.6)]" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
