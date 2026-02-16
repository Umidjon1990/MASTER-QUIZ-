import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface ViewportData {
  scrollRatioX: number;
  scrollRatioY: number;
  visibleRatioW: number;
  visibleRatioH: number;
}

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
  onViewportChange?: (viewport: ViewportData) => void;
  externalViewport?: ViewportData | null;
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
  onViewportChange,
  externalViewport,
}: PDFViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPageRendering, setIsPageRendering] = useState(false);
  const renderTaskRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const pageCacheRef = useRef<Map<string, ImageBitmap>>(new Map());
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [wrapperPadding, setWrapperPadding] = useState({ top: 0, left: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  const lastTouchDistRef = useRef<number | null>(null);
  const touchDragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const prevZoomRef = useRef(0);
  const scrollAnchorRef = useRef<{ ratioX: number; ratioY: number } | null>(null);
  const applyingExternalViewportRef = useRef(false);

  const computeViewport = useCallback((): ViewportData | null => {
    const container = containerRef.current;
    if (!container || container.scrollWidth <= 0 || container.scrollHeight <= 0) return null;
    const maxScrollX = container.scrollWidth - container.clientWidth;
    const maxScrollY = container.scrollHeight - container.clientHeight;
    return {
      scrollRatioX: maxScrollX > 0 ? container.scrollLeft / maxScrollX : 0,
      scrollRatioY: maxScrollY > 0 ? container.scrollTop / maxScrollY : 0,
      visibleRatioW: container.clientWidth / container.scrollWidth,
      visibleRatioH: container.clientHeight / container.scrollHeight,
    };
  }, []);

  const emitViewport = useCallback(() => {
    if (!onViewportChange || applyingExternalViewportRef.current) return;
    const vp = computeViewport();
    if (vp) onViewportChange(vp);
  }, [onViewportChange, computeViewport]);

  useEffect(() => {
    if (externalZoom !== undefined && externalZoom !== zoomLevel && !isHost) {
      const container = containerRef.current;
      if (container && externalZoom > 0) {
        const scrollCenterX = container.scrollLeft + container.clientWidth / 2;
        const scrollCenterY = container.scrollTop + container.clientHeight / 2;
        const contentW = container.scrollWidth || 1;
        const contentH = container.scrollHeight || 1;
        scrollAnchorRef.current = { ratioX: scrollCenterX / contentW, ratioY: scrollCenterY / contentH };
      }
      prevZoomRef.current = zoomLevel;
      setZoomLevel(externalZoom);
    }
  }, [externalZoom]);

  useEffect(() => {
    if (externalViewport && !isHost) {
      applyingExternalViewportRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = containerRef.current;
          if (container) {
            const maxScrollX = container.scrollWidth - container.clientWidth;
            const maxScrollY = container.scrollHeight - container.clientHeight;
            container.scrollLeft = externalViewport.scrollRatioX * maxScrollX;
            container.scrollTop = externalViewport.scrollRatioY * maxScrollY;
          }
          applyingExternalViewportRef.current = false;
        });
      });
    }
  }, [externalViewport]);

  const updateZoom = useCallback((newZoomOrUpdater: number | ((prev: number) => number)) => {
    const container = containerRef.current;
    if (container) {
      const scrollCenterX = container.scrollLeft + container.clientWidth / 2;
      const scrollCenterY = container.scrollTop + container.clientHeight / 2;
      const contentW = container.scrollWidth || 1;
      const contentH = container.scrollHeight || 1;
      scrollAnchorRef.current = { ratioX: scrollCenterX / contentW, ratioY: scrollCenterY / contentH };
    }
    setZoomLevel(prev => {
      prevZoomRef.current = prev;
      const newZoom = typeof newZoomOrUpdater === "function" ? newZoomOrUpdater(prev) : newZoomOrUpdater;
      onZoomChange?.(newZoom);
      return newZoom;
    });
  }, [onZoomChange]);

  useEffect(() => {
    pageCacheRef.current.forEach(bitmap => bitmap.close());
    pageCacheRef.current = new Map();
  }, [url]);

  useEffect(() => {
    return () => {
      pageCacheRef.current.forEach(bitmap => bitmap.close());
      pageCacheRef.current = new Map();
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    };
  }, []);

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

  const getZoomMultiplier = useCallback((level: number) => {
    return Math.pow(1.25, level);
  }, []);

  const prefetchPage = useCallback(async (pageNum: number, containerWidth: number, containerHeight: number, currentZoom: number) => {
    if (!pdfRef.current || pageNum < 1 || pageNum > pdfRef.current.numPages) return;

    const cacheKey = `${pageNum}_${containerWidth}_${containerHeight}_${currentZoom}`;
    if (pageCacheRef.current.has(cacheKey)) return;

    try {
      const page = await pdfRef.current.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const scaleX = containerWidth / viewport.width;
      const scaleY = containerHeight / viewport.height;
      const fitScale = Math.min(scaleX, scaleY);
      const zoomMultiplier = getZoomMultiplier(currentZoom);
      const finalScale = fitScale * zoomMultiplier;

      const scaledViewport = page.getViewport({ scale: finalScale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const offscreen = document.createElement("canvas");
      offscreen.width = scaledViewport.width * dpr;
      offscreen.height = scaledViewport.height * dpr;
      const offCtx = offscreen.getContext("2d");
      if (!offCtx) return;
      offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const renderTask = page.render({
        canvasContext: offCtx,
        viewport: scaledViewport,
        canvas: offscreen,
      } as any);
      await renderTask.promise;

      const bitmap = await createImageBitmap(offscreen);
      pageCacheRef.current.set(cacheKey, bitmap);
    } catch {}
  }, [getZoomMultiplier]);

  const renderPage = useCallback(async () => {
    if (!pdfRef.current || !canvasRef.current || !containerRef.current) return;

    setIsPageRendering(true);

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

      if (containerWidth <= 0 || containerHeight <= 0) {
        setIsPageRendering(false);
        return;
      }

      const viewport = page.getViewport({ scale: 1 });
      const scaleX = containerWidth / viewport.width;
      const scaleY = containerHeight / viewport.height;
      const fitScale = Math.min(scaleX, scaleY);
      const zoomMultiplier = getZoomMultiplier(zoomLevel);
      const finalScale = fitScale * zoomMultiplier;

      const scaledViewport = page.getViewport({ scale: finalScale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setIsPageRendering(false);
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = scaledViewport.width * dpr;
      canvas.height = scaledViewport.height * dpr;
      canvas.style.width = `${scaledViewport.width}px`;
      canvas.style.height = `${scaledViewport.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const padLeft = Math.max(0, (containerWidth - scaledViewport.width) / 2);
      const padTop = Math.max(0, (containerHeight - scaledViewport.height) / 2);
      setWrapperPadding({ top: padTop, left: padLeft });

      const cacheKey = `${currentPage}_${containerWidth}_${containerHeight}_${zoomLevel}`;
      const cachedBitmap = pageCacheRef.current.get(cacheKey);

      if (cachedBitmap) {
        ctx.drawImage(cachedBitmap, 0, 0, scaledViewport.width, scaledViewport.height);
        setIsPageRendering(false);
      } else {
        const renderTask = page.render({
          canvasContext: ctx,
          viewport: scaledViewport,
          canvas: canvas,
        } as any);
        renderTaskRef.current = renderTask;
        await renderTask.promise;

        try {
          const bitmap = await createImageBitmap(canvas);
          pageCacheRef.current.set(cacheKey, bitmap);
        } catch {}

        setIsPageRendering(false);
      }

      requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const c = containerRef.current;
        if (scrollAnchorRef.current && zoomLevel > 0) {
          const newScrollX = scrollAnchorRef.current.ratioX * c.scrollWidth - c.clientWidth / 2;
          const newScrollY = scrollAnchorRef.current.ratioY * c.scrollHeight - c.clientHeight / 2;
          c.scrollLeft = Math.max(0, newScrollX);
          c.scrollTop = Math.max(0, newScrollY);
          scrollAnchorRef.current = null;
        }
        emitViewport();
      });

      let prefetchCancelled = false;
      const currentPageNum = currentPage;
      const cw = containerWidth;
      const ch = containerHeight;
      const cz = zoomLevel;
      const numPages = pdfRef.current.numPages;

      const doPrefetch = () => {
        if (prefetchCancelled) return;
        if (currentPageNum < numPages) {
          prefetchPage(currentPageNum + 1, cw, ch, cz);
        }
        if (currentPageNum > 1) {
          prefetchPage(currentPageNum - 1, cw, ch, cz);
        }
      };

      if (typeof window.requestIdleCallback === "function") {
        const idleId = window.requestIdleCallback(doPrefetch);
        renderTaskRef.current = { cancel: () => { prefetchCancelled = true; window.cancelIdleCallback(idleId); } };
      } else {
        const timerId = setTimeout(doPrefetch, 100);
        renderTaskRef.current = { cancel: () => { prefetchCancelled = true; clearTimeout(timerId); } };
      }
    } catch (err: any) {
      if (err?.name !== "RenderingCancelledException") {
        console.error("PDF render error:", err);
      }
      setIsPageRendering(false);
    }
  }, [currentPage, zoomLevel, totalPages, prefetchPage, getZoomMultiplier, emitViewport]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    resizeObserverRef.current = new ResizeObserver(() => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(() => {
        pageCacheRef.current.forEach(bitmap => bitmap.close());
        pageCacheRef.current = new Map();
        renderPage();
      }, 300);
    });
    resizeObserverRef.current.observe(container);

    return () => {
      resizeObserverRef.current?.disconnect();
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [renderPage]);

  useEffect(() => {
    if (zoomLevel <= 0 && containerRef.current) {
      containerRef.current.scrollLeft = 0;
      containerRef.current.scrollTop = 0;
    }
  }, [zoomLevel]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onViewportChange) return;
    const handleScroll = () => {
      emitViewport();
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [onViewportChange, emitViewport]);

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
        updateZoom(z => Math.max(0, Math.min(6, z + direction)));
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

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      updateZoom(z => Math.max(0, Math.min(6, z + direction)));
    }
  }, [updateZoom]);

  return (
    <div className={`h-full w-full relative ${className}`}>
      <div
        ref={containerRef}
        className={`w-full h-full relative overflow-auto ${isZoomed ? "cursor-grab" : ""} ${isDragging ? "cursor-grabbing" : ""}`}
        style={{ scrollbarWidth: isZoomed ? "thin" : "none", scrollbarColor: isZoomed ? "rgba(255,255,255,0.3) transparent" : "transparent transparent" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
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
          <div className="relative" style={{ width: "fit-content", paddingTop: `${wrapperPadding.top}px`, paddingLeft: `${wrapperPadding.left}px`, paddingRight: `${wrapperPadding.left}px` }}>
            <canvas ref={canvasRef} className="block" data-testid="pdf-canvas" />
            {isPageRendering && (
              <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none" data-testid="page-render-spinner">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin opacity-70" />
              </div>
            )}
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
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-10 h-10 rounded-full bg-red-500/30 animate-ping" />
                  <div className="absolute w-8 h-8 rounded-full bg-red-500/20 shadow-[0_0_24px_8px_rgba(239,68,68,0.5)]" />
                  <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow-[0_0_16px_4px_rgba(239,68,68,0.7)]" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
