import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, Link2, Loader2, MoreHorizontal, Plus, Trash2, UserPlus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errorMessage, uzDate } from "@/lib/teacher-access";
import { runPath, shareUrl, type Run } from "@/lib/teacher-results";
import { CopyRow, TeacherLinkDialog } from "@/components/teacher-link-dialog";
import { PercentPill } from "./results-panel";
import { parseNames } from "./groups";

type GroupDetail = {
  id: string;
  name: string;
  students: { id: string; name: string }[];
  tests: Run[];
  results: Record<string, Record<string, number>>;
  rating: { id: string; name: string; done: number; avgPercent: number | null }[];
};

export default function TeacherGroupDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const key = ["/api/teacher-panel/groups", id];
  const q = useQuery<GroupDetail>({ queryKey: key });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["/api/teacher-panel/groups"] });
  };
  const [assign, setAssign] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [names, setNames] = useState("");
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [tab, setTab] = useState<"tests" | "table" | "students">("tests");
  const fail = (title: string) => (e: unknown) => toast({ title, description: errorMessage(e), variant: "destructive" });

  const addStudents = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/teacher-panel/groups/${id}/students`, { names: parseNames(names) })).json() as Promise<{ added: number }>,
    onSuccess: (d) => {
      setAddOpen(false);
      setNames("");
      refresh();
      toast({ title: d.added ? `${d.added} ta o‘quvchi qo‘shildi` : "Bu ismlar ro‘yxatda bor edi" });
    },
    onError: fail("Qo‘shilmadi"),
  });
  const removeStudent = useMutation({
    mutationFn: async (sid: string) => apiRequest("DELETE", `/api/teacher-panel/groups/${id}/students/${sid}`),
    onSuccess: refresh,
    onError: fail("O‘chirilmadi"),
  });
  const toggleLink = useMutation({
    mutationFn: async (linkId: string) => apiRequest("PATCH", `/api/shared-quizzes/${linkId}/toggle`),
    onSuccess: refresh,
    onError: fail("O‘zgartirib bo‘lmadi"),
  });
  const archive = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/teacher-panel/groups/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/teacher-panel/groups"] });
      navigate("/teacher/groups");
    },
    onError: fail("Guruh o‘chirilmadi"),
  });

  if (q.isLoading)
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64" />
      </div>
    );
  const g = q.data;
  if (!g)
    return (
      <div className="p-6 text-center space-y-3">
        <p className="font-semibold">Guruh topilmadi</p>
        <Link href="/teacher/groups" className="underline">Sinflarimga qaytish</Link>
      </div>
    );

  const tabs = [
    ["tests", `Testlar (${g.tests.length})`],
    ["table", "Natijalar jadvali"],
    ["students", `O‘quvchilar (${g.students.length})`],
  ] as const;
  const columns = [...g.tests].reverse(); // jadvalda eski test chapda

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="space-y-2">
        <Link href="/teacher/groups" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Sinflarim
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold flex-1">{g.name}</h1>
          <Button className="gradient-purple border-0 text-white" onClick={() => setAssign(true)} disabled={!g.students.length} data-testid="button-assign-test">
            <Plus className="w-4 h-4" /> Test biriktirish
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Boshqa amallar">
                <MoreHorizontal className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  if (confirm(`"${g.name}" guruhini o‘chirasizmi? Natijalar “Natijalar” bo‘limida saqlanib qoladi, guruh havolalari yopiladi.`)) archive.mutate();
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" /> Guruhni o‘chirish
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {!g.students.length && (
          <Card className="p-4 flex flex-wrap items-center gap-3 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
            <p className="text-sm flex-1">Test biriktirishdan oldin o‘quvchilar ismini qo‘shing.</p>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <UserPlus className="w-4 h-4" /> O‘quvchi qo‘shish
            </Button>
          </Card>
        )}
      </div>

      <div className="inline-flex rounded-lg border p-1 bg-muted/40 flex-wrap" role="tablist">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "tests" &&
        (g.tests.length ? (
          <Card className="divide-y overflow-hidden">
            {g.tests.map((t) => {
              const closed = !t.isActive || (t.closesAt && new Date(t.closesAt) <= new Date());
              return (
                <div key={t.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <Link href={runPath(t)} className="flex-1 min-w-0 group">
                    <p className="font-medium truncate group-hover:underline">{t.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {uzDate(t.at, false)}
                      {t.closesAt ? ` · muddat ${uzDate(t.closesAt)}` : ""} · {closed ? "yopilgan" : "ochiq"}
                    </p>
                  </Link>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="tabular-nums">
                      {t.participants}/{t.expected ?? g.students.length} ishladi
                    </Badge>
                    {t.participants > 0 && <PercentPill value={t.avgPercent} />}
                    <Button size="sm" variant="outline" onClick={() => setShareCode(t.code)}>
                      <Link2 className="w-4 h-4" /> Havola
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleLink.mutate(t.id)} disabled={toggleLink.isPending}>
                      {t.isActive ? "Yopish" : "Ochish"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </Card>
        ) : (
          <Card className="p-8 text-center text-sm text-muted-foreground">Hali test biriktirilmagan. “Test biriktirish” tugmasini bosing.</Card>
        ))}

      {tab === "table" &&
        (g.tests.length && g.students.length ? (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2 sticky left-0 bg-muted/90 backdrop-blur min-w-[10rem]">O‘quvchi</th>
                  <th className="text-center font-medium px-3 py-2">O‘rtacha</th>
                  {columns.map((t, i) => (
                    <th key={t.id} className="text-center font-medium px-3 py-2 whitespace-nowrap" title={t.title}>
                      <Link href={runPath(t)} className="hover:underline">
                        {i + 1}. {t.title.length > 18 ? t.title.slice(0, 17) + "…" : t.title}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {g.rating.map((s, i) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2 sticky left-0 bg-background">
                      <span className="text-muted-foreground tabular-nums mr-2">{i + 1}.</span>
                      {s.name}
                    </td>
                    <td className="px-3 py-2 text-center">{s.avgPercent == null ? "—" : <PercentPill value={s.avgPercent} />}</td>
                    {columns.map((t) => {
                      const v = g.results[s.id]?.[t.id];
                      return (
                        <td key={t.id} className="px-3 py-2 text-center tabular-nums">
                          {v == null ? <span className="text-muted-foreground">—</span> : `${v}%`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <Card className="p-8 text-center text-sm text-muted-foreground">Jadval o‘quvchilar testni ishlagach to‘ladi.</Card>
        ))}

      {tab === "students" && (
        <div className="space-y-3">
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <UserPlus className="w-4 h-4" /> O‘quvchi qo‘shish
          </Button>
          {g.students.length > 0 && (
            <Card className="divide-y">
              {g.students.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-muted-foreground tabular-nums w-6">{i + 1}.</span>
                  <span className="flex-1">{s.name}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label={`${s.name} — ro‘yxatdan olib tashlash`}
                    onClick={() => {
                      if (confirm(`${s.name} ro‘yxatdan olib tashlansinmi? Oldingi natijalari saqlanadi.`)) removeStudent.mutate(s.id);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      <TeacherLinkDialog open={assign} onOpenChange={(v) => { setAssign(v); if (!v) refresh(); }} group={{ id: g.id, name: g.name }} />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>O‘quvchi qo‘shish</DialogTitle>
            <DialogDescription>Har qatorda bitta ism. Ro‘yxatda bor ismlar qayta qo‘shilmaydi.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              addStudents.mutate();
            }}
          >
            <Textarea rows={8} value={names} onChange={(e) => setNames(e.target.value)} placeholder={"Aliyev Ali\nKarimova Zuhra"} autoFocus />
            <Button type="submit" className="w-full gradient-purple border-0 text-white" disabled={!parseNames(names).length || addStudents.isPending}>
              {addStudents.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Qo‘shish ({parseNames(names).length})
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!shareCode} onOpenChange={(v) => !v && setShareCode(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Guruh havolasi</DialogTitle>
            <DialogDescription>O‘quvchilar havolani ochib, ro‘yxatdan o‘z ismini tanlaydi.</DialogDescription>
          </DialogHeader>
          {shareCode && <CopyRow value={shareUrl(shareCode)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
