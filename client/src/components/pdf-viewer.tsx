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

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isHost || !onPointerMove || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onPointerMove(x, y, true);
  };

  const handleCanvasMouseLeave = () => {
    if (!isHost || !onPointerMove) return;
    onPointerMove(0, 0, false);
  };

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
          <Button size="icon" variant="ghost" onClick={() => setZoomLevel(z => Math.max(-3, z - 1))} data-testid="button-zoom-out">
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs min-w-[40px] text-center text-muted-foreground">
            {Math.round((1 + zoomLevel * 0.15) * 100)}%
          </span>
          <Button size="icon" variant="ghost" onClick={() => setZoomLevel(z => Math.min(8, z + 1))} data-testid="button-zoom-in">
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setZoomLevel(0)} data-testid="button-fit-width">
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex items-center justify-center bg-muted/30 relative min-h-0"
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={handleCanvasMouseLeave}
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
