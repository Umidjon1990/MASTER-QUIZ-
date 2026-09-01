import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, ChevronLeft, ChevronRight, Expand, Loader2, Minus, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";

export default function LibraryViewer() {
  const [, params] = useRoute("/teacher/library/view/:sessionId");
  const sessionId = params?.sessionId || "";
  const token = sessionStorage.getItem(`library-token:${sessionId}`) || "";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTask = useRef<any>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(() => Math.max(1, Number(sessionStorage.getItem(`library-page:${sessionId}`)) || 1));
  const [scale, setScale] = useState(1.15);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionId || !token) { setError("Ko'rish sessiyasi topilmadi. Kitobni kutubxonadan qayta oching."); setLoading(false); return; }
    let task: any;
    let disposed = false;
    import("pdfjs-dist").then(async pdfjs => {
      if (disposed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      task = pdfjs.getDocument({ url: `/api/library/view/${sessionId}/file`, httpHeaders: { "X-Library-Token": token }, withCredentials: true, disableAutoFetch: false });
      const pdf = await task.promise;
      if (disposed) return task.destroy();
      setPdfDocument(pdf);
      setLoading(false);
    }).catch(reason => { if (!disposed) { setError(reason?.message || "Himoyalangan PDF ochilmadi"); setLoading(false); } });
    return () => { disposed = true; task?.destroy(); };
  }, [sessionId, token]);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return;
    let cancelled = false;
    pdfDocument.getPage(page).then(pdfPage => {
      if (cancelled || !canvasRef.current) return;
      if (renderTask.current) renderTask.current.cancel();
      const viewport = pdfPage.getViewport({ scale: scale * Math.min(1, (window.innerWidth - 24) / pdfPage.getViewport({ scale: 1 }).width) });
      const canvas = canvasRef.current;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      renderTask.current = pdfPage.render({ canvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      renderTask.current.promise.catch((reason: any) => { if (reason?.name !== "RenderingCancelledException") setError("Sahifa ko'rsatilmadi"); });
    });
    const timer = window.setTimeout(() => fetch(`/api/library/view/${sessionId}/progress`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", "X-Library-Token": token }, body: JSON.stringify({ page }) }).catch(() => {}), 700);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [pdfDocument, page, scale, sessionId, token]);

  const fullscreen = useCallback(async () => {
    try { if (!document.fullscreenElement) await containerRef.current?.requestFullscreen(); else await document.exitFullscreen(); }
    catch { toast({ title: "To'liq ekran rejimi yoqilmadi", variant: "destructive" }); }
  }, [toast]);

  useEffect(() => {
    const block = (event: Event) => event.preventDefault();
    const keys = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && ["s", "p", "u"].includes(event.key.toLowerCase())) event.preventDefault(); };
    window.addEventListener("contextmenu", block); window.addEventListener("keydown", keys);
    return () => { window.removeEventListener("contextmenu", block); window.removeEventListener("keydown", keys); };
  }, []);

  return <div ref={containerRef} className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col select-none">
    <header className="h-16 shrink-0 border-b border-white/10 bg-slate-900 px-3 md:px-5 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Button size="icon" variant="ghost" className="text-white" onClick={() => navigate("/teacher/library")}><ArrowLeft /></Button><div className="hidden sm:block"><p className="font-semibold text-sm">Himoyalangan kutubxona</p><p className="text-[11px] text-emerald-400 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Server watermark faol</p></div></div>
      <div className="flex items-center gap-1 md:gap-2"><Button size="icon" variant="ghost" className="text-white" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft /></Button><div className="px-2 text-sm min-w-20 text-center"><InputPage page={page} total={pdfDocument?.numPages || 0} onChange={setPage} /></div><Button size="icon" variant="ghost" className="text-white" disabled={!pdfDocument || page >= pdfDocument.numPages} onClick={() => setPage(p => p + 1)}><ChevronRight /></Button></div>
      <div className="flex items-center gap-1"><Button size="icon" variant="ghost" className="text-white" onClick={() => setScale(s => Math.max(.65, s - .15))}><Minus /></Button><span className="text-xs w-10 text-center hidden sm:inline">{Math.round(scale * 100)}%</span><Button size="icon" variant="ghost" className="text-white" onClick={() => setScale(s => Math.min(2.5, s + .15))}><Plus /></Button><Button size="icon" variant="ghost" className="text-white" onClick={fullscreen}><Expand /></Button></div></header>
    <main className="flex-1 overflow-auto bg-slate-800 p-3 md:p-6" onDragStart={e => e.preventDefault()}>{loading ? <div className="h-full flex flex-col items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-purple-400" /><p className="mt-3 text-slate-300">PDF himoyalanmoqda va tayyorlanmoqda...</p></div> : error ? <div className="h-full flex flex-col items-center justify-center text-center px-5"><ShieldCheck className="w-14 h-14 text-red-400 mb-3" /><h2 className="font-bold text-xl">PDF ochilmadi</h2><p className="text-slate-300 mt-2 max-w-lg">{error}</p><Button className="mt-5" onClick={() => navigate("/teacher/library")}>Kutubxonaga qaytish</Button></div> : <div className="min-h-full flex justify-center items-start"><canvas ref={canvasRef} className="bg-white shadow-2xl" aria-label={`${page}-sahifa`} /></div>}</main>
    <footer className="h-7 shrink-0 bg-slate-950 text-[10px] text-slate-400 flex items-center justify-center">Nusxa olingan material shaxsiy sessiya watermark'i orqali aniqlanadi</footer>
  </div>;
}

function InputPage({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const [value, setValue] = useState(String(page));
  useEffect(() => setValue(String(page)), [page]);
  return <form onSubmit={event => { event.preventDefault(); onChange(Math.max(1, Math.min(total, Number(value) || 1))); }} className="flex items-center justify-center gap-1"><input value={value} onChange={e => setValue(e.target.value)} className="w-9 rounded bg-white/10 text-center py-1 outline-none" inputMode="numeric" /><span className="text-slate-400">/ {total || "—"}</span></form>;
}
