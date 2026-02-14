import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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
  const [scale, setScale] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    const loadPdf = async () => {
      try {
        setIsLoading(true);
        const pdf = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        setTotalPages(pdf.numPages);
        onTotalPages?.(pdf.numPages);
        setIsLoading(false);
      } catch (err) {
        console.error("PDF load error:", err);
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
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      const viewport = page.getViewport({ scale: 1 });
      const scaleX = containerWidth / viewport.width;
      const scaleY = containerHeight / viewport.height;
      const baseScale = Math.min(scaleX, scaleY);
      const finalScale = baseScale * scale;

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
  }, [currentPage, scale]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  useEffect(() => {
    const handleResize = () => renderPage();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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

  const fitToWidth = () => setScale(1);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {isHost && (
        <div className="flex items-center justify-between gap-2 p-2 border-b bg-background/80 backdrop-blur-sm flex-wrap" data-testid="pdf-toolbar">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onPageChange?.(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm min-w-[80px] text-center" data-testid="text-page-indicator">
              {currentPage} / {totalPages}
            </span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onPageChange?.(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
              data-testid="button-next-page"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => setScale(s => Math.max(0.5, s - 0.15))} data-testid="button-zoom-out">
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-xs min-w-[40px] text-center text-muted-foreground">{Math.round(scale * 100)}%</span>
            <Button size="icon" variant="ghost" onClick={() => setScale(s => Math.min(3, s + 0.15))} data-testid="button-zoom-in">
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={fitToWidth} data-testid="button-fit-width">
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {!isHost && totalPages > 0 && (
        <div className="flex items-center justify-center gap-2 p-1.5 border-b bg-background/80 backdrop-blur-sm">
          <span className="text-sm text-muted-foreground" data-testid="text-page-indicator-student">
            {currentPage} / {totalPages}
          </span>
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex items-center justify-center bg-muted/30 relative"
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={handleCanvasMouseLeave}
        data-testid="pdf-canvas-container"
      >
        {isLoading ? (
          <div className="flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
