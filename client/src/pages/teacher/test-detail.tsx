import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Copy,
  Eye,
  EyeOff,
  FileDown,
  Link2,
  Loader2,
  Play,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errorMessage, textDir, uzDate } from "@/lib/teacher-access";
import { quizMeta } from "./tests";

type Detail = {
  id: string;
  title: string;
  description: string | null;
  totalQuestions: number;
  timerEnabled: boolean;
  timePerQuestion: number;
  library: { sourceQuizId: string; outdated: boolean } | null;
  schedule: { at: string; status: string; code: string | null } | null;
  links: { id: string; code: string; isActive: boolean; createdAt: string; finished: number }[];
  questions: { id: string; type: string; text: string; options: string[]; correctAnswer: string; config: any; mediaType: string | null; mediaUrl: string | null }[];
};

const origin = () => window.location.origin;
const shareUrl = (code: string) => `${origin()}/shared/${code}`;
const telegramShare = (url: string, text: string) =>
  `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
const when = (iso: string) => uzDate(iso);

function tashkentDefaults() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(Date.now() + 3600_000));
  const g = (t: string) => p.find((x) => x.type === t)?.value || "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:00` };
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex gap-2">
      <Input value={value} readOnly className="font-mono text-sm" aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      <Button
        variant="outline"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
        aria-label="Nusxalash"
      >
        {done ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  );
}

function answerText(q: Detail["questions"][number]) {
  const c = q.config || {};
  if (q.type === "match" && Array.isArray(c.pairs)) return c.pairs.map((p: any) => `${p.left} — ${p.right}`).join("; ");
  if (q.type === "reorder" && Array.isArray(c.tokens)) return c.tokens.join(" ");
  if (q.type === "fill_blank" && Array.isArray(c.blanks)) return c.blanks.map((b: any) => b.answers?.[0]).join(" / ");
  if (q.type === "multiple_select") {
    try {
      return (JSON.parse(q.correctAnswer) as string[]).join(", ");
    } catch {
      return q.correctAnswer;
    }
  }
  return q.correctAnswer;
}

export default function TeacherTestDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [linkOpen, setLinkOpen] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [form, setForm] = useState(() => ({ ...tashkentDefaults(), requireCode: true }));
  const key = ["/api/teacher-panel/quizzes", id];
  const q = useQuery<Detail>({ queryKey: key });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const fail = (title: string) => (e: unknown) => toast({ title, description: errorMessage(e), variant: "destructive" });

  const createLink = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/quizzes/${id}/share`)).json() as Promise<{ code: string }>,
    onSuccess: (d) => {
      setLinkOpen(d.code);
      void refresh();
    },
    onError: fail("Havola yaratilmadi"),
  });
  const toggleLink = useMutation({
    mutationFn: async (linkId: string) => apiRequest("PATCH", `/api/shared-quizzes/${linkId}/toggle`),
    onSuccess: () => void refresh(),
    onError: fail("O‘zgartirib bo‘lmadi"),
  });
  const schedule = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/quizzes/${id}/schedule`, {
        scheduledAt: new Date(`${form.date}T${form.time}:00+05:00`).toISOString(),
        requireCode: form.requireCode,
      }),
    onSuccess: () => {
      setScheduleOpen(false);
      void refresh();
      toast({ title: "Vaqt belgilandi", description: "Havolani o‘quvchilarga yuboring." });
    },
    onError: fail("Vaqt belgilanmadi"),
  });
  const cancelSchedule = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/quizzes/${id}/cancel-schedule`),
    onSuccess: () => void refresh(),
    onError: fail("Bekor qilinmadi"),
  });
  const refreshCopy = useMutation({
    mutationFn: async (sourceId: string) =>
      (await apiRequest("POST", `/api/teacher-panel/library/${sourceId}/open`)).json() as Promise<{ quizId: string }>,
    onSuccess: (d) => navigate(`/teacher/test/${d.quizId}`, { replace: true }),
    onError: fail("Yangilab bo‘lmadi"),
  });

  async function download(withAnswers: boolean) {
    try {
      const r = await fetch(`/api/quizzes/${id}/export/docx?answers=${withAnswers}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Yuklab bo‘lmadi");
      const url = URL.createObjectURL(await r.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: `${q.data?.title || "test"}${withAnswers ? " (javoblar)" : ""}.docx` });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      fail("Yuklab bo‘lmadi")(e);
    }
  }

  if (q.isLoading)
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <div className="grid md:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  if (!q.data)
    return (
      <div className="p-6 max-w-xl mx-auto text-center space-y-3">
        <p className="font-semibold">Test topilmadi</p>
        <Button onClick={() => navigate("/teacher/tests")}>Quizlarga qaytish</Button>
      </div>
    );

  const d = q.data;
  const scheduledLink = d.schedule ? (d.schedule.code ? `${origin()}/play/scheduled/${d.schedule.code}` : `${origin()}/play/scheduled-open/${d.id}`) : "";
  const actions = [
    {
      icon: Play,
      title: "Jonli o‘tkazish",
      text: "Sinfda ekranda ko‘rsatasiz, o‘quvchilar telefondan kod bilan qo‘shiladi. Natija va reyting darhol chiqadi.",
      button: "Boshlash",
      onClick: () => navigate(`/teacher/live?quizId=${d.id}`),
      busy: false,
      accent: "gradient-purple text-white border-0",
    },
    {
      icon: Link2,
      title: "Havola bilan yuborish",
      text: "O‘quvchilar istalgan vaqtda mustaqil ishlaydi. Har biri ismini yozib boshlaydi, natijasi sizga saqlanadi.",
      button: "Havola yaratish",
      onClick: () => createLink.mutate(),
      busy: createLink.isPending,
      accent: "",
    },
    {
      icon: CalendarClock,
      title: "Vaqtini belgilash",
      text: "Hamma belgilangan vaqtda birga boshlaydi. Havolani oldindan yuborasiz, test o‘zi ochiladi.",
      button: d.schedule ? "Vaqtni o‘zgartirish" : "Vaqt belgilash",
      onClick: () => setScheduleOpen(true),
      busy: false,
      accent: "",
    },
  ];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="space-y-2">
        <Link href="/teacher/tests" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Quizlar
        </Link>
        <h1 className="text-2xl font-bold leading-tight" data-testid="text-test-title">
          {d.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{quizMeta(d)}</span>
          {d.library && <Badge variant="secondary">Tayyor quiz</Badge>}
        </div>
        {d.description && <p className="text-sm text-muted-foreground max-w-2xl">{d.description}</p>}
      </div>

      {d.library?.outdated && (
        <Card className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
          <p className="text-sm flex-1">Administrator bu testni yangilagan. Yangi o‘tkazishlar uchun yangi versiyasini oching — eski natijalar saqlanib qoladi.</p>
          <Button size="sm" onClick={() => refreshCopy.mutate(d.library!.sourceQuizId)} disabled={refreshCopy.isPending}>
            {refreshCopy.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Yangi versiyani ochish
          </Button>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-3">
        {actions.map((a) => (
          <Card key={a.title} className="p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 grid place-items-center">
                <a.icon className="w-5 h-5" />
              </span>
              <h2 className="font-semibold">{a.title}</h2>
            </div>
            <p className="text-sm text-muted-foreground flex-1">{a.text}</p>
            <Button className={a.accent} variant={a.accent ? "default" : "outline"} onClick={a.onClick} disabled={a.busy} data-testid={`action-${a.title}`}>
              {a.busy && <Loader2 className="w-4 h-4 animate-spin" />} {a.button}
            </Button>
          </Card>
        ))}
      </div>

      {d.schedule && (
        <Card className="p-5 space-y-3 border-purple-200 dark:border-purple-900">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarClock className="w-5 h-5 text-purple-700" />
            <h2 className="font-semibold flex-1">
              {d.schedule.status === "started" ? "Test hozir o‘tmoqda" : `Boshlanadi: ${when(d.schedule.at)}`}
            </h2>
            {d.schedule.code && <Badge className="font-mono tracking-wider">Kod: {d.schedule.code}</Badge>}
          </div>
          <CopyField value={scheduledLink} label="Test havolasi" />
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={telegramShare(scheduledLink, `"${d.title}" testi ${when(d.schedule.at)} da boshlanadi.${d.schedule.code ? ` Kod: ${d.schedule.code}` : ""}`)} target="_blank" rel="noreferrer">
                <Send className="w-4 h-4" /> Telegramda yuborish
              </a>
            </Button>
            {d.schedule.status === "pending" && (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => cancelSchedule.mutate()} disabled={cancelSchedule.isPending}>
                <X className="w-4 h-4" /> Bekor qilish
              </Button>
            )}
          </div>
        </Card>
      )}

      {d.links.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Yuborilgan havolalar</h2>
          <Card className="divide-y">
            {d.links.map((l) => (
              <div key={l.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm truncate">{shareUrl(l.code)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {uzDate(l.createdAt, false)} · {l.finished} kishi ishladi · {l.isActive ? "ochiq" : "yopilgan"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setLinkOpen(l.code)}>
                    <Copy className="w-4 h-4" /> Ulashish
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleLink.mutate(l.id)} disabled={toggleLink.isPending}>
                    {l.isActive ? "Yopish" : "Qayta ochish"}
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold flex-1">Savollar ({d.questions.length})</h2>
          <Button size="sm" variant="ghost" onClick={() => setShowAnswers((v) => !v)}>
            {showAnswers ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {showAnswers ? "Javoblarni yashirish" : "Javoblarni ko‘rsatish"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void download(false)}>
            <FileDown className="w-4 h-4" /> Word
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void download(true)}>
            <FileDown className="w-4 h-4" /> Word (javoblar bilan)
          </Button>
        </div>
        <Card className="divide-y">
          {d.questions.map((item, i) => (
            <div key={item.id} className="p-4 space-y-2">
              <p className="font-medium">
                <span className="text-muted-foreground mr-2">{i + 1}.</span>
                <span dir={textDir(item.text)}>{item.text}</span>
              </p>
              {item.mediaType === "image" && item.mediaUrl && <img src={item.mediaUrl} alt="" className="max-h-40 rounded-md" loading="lazy" />}
              {item.options.length > 0 && (
                <ul className="grid sm:grid-cols-2 gap-1.5">
                  {item.options.map((o, k) => {
                    const right = showAnswers && answerText(item).split(", ").includes(o);
                    return (
                      <li key={k} dir={textDir(o)} className={`text-sm rounded-md border px-3 py-1.5 ${right ? "border-green-500 bg-green-50 dark:bg-green-950/40 font-medium" : ""}`}>
                        {o}
                      </li>
                    );
                  })}
                </ul>
              )}
              {showAnswers && !item.options.length && (
                <p className="text-sm text-green-700 dark:text-green-400" dir="auto">
                  Javob: {answerText(item)}
                </p>
              )}
            </div>
          ))}
        </Card>
      </section>

      <Dialog open={!!linkOpen} onOpenChange={(o) => !o && setLinkOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Havola tayyor</DialogTitle>
            <DialogDescription>Havolani o‘quvchilarga yuboring. Ular ismini yozib testni ishlaydi, natijalar sizda saqlanadi.</DialogDescription>
          </DialogHeader>
          {linkOpen && (
            <div className="space-y-3">
              <CopyField value={shareUrl(linkOpen)} label="Test havolasi" />
              <Button asChild className="w-full gradient-purple border-0 text-white">
                <a href={telegramShare(shareUrl(linkOpen), `"${d.title}" testini ishlang:`)} target="_blank" rel="noreferrer">
                  <Send className="w-4 h-4" /> Telegramda yuborish
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vaqtini belgilash</DialogTitle>
            <DialogDescription>Toshkent vaqti bilan. Belgilangan daqiqada test hamma uchun birga boshlanadi.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              schedule.mutate();
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="s-date">Sana</Label>
                <Input id="s-date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-time">Vaqt</Label>
                <Input id="s-time" type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
              <Switch checked={form.requireCode} onCheckedChange={(v) => setForm({ ...form, requireCode: v })} className="mt-0.5" />
              <span className="text-sm">
                <span className="font-medium block">Kirish kodi bilan</span>
                <span className="text-muted-foreground">Faqat kodni bilganlar qo‘shila oladi. O‘chirsangiz — havola bor har kim kiradi.</span>
              </span>
            </label>
            <Button type="submit" className="w-full gradient-purple border-0 text-white" disabled={schedule.isPending}>
              {schedule.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Saqlash
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
