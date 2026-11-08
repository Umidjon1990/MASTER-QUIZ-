import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errorMessage, uzDate } from "@/lib/teacher-access";
import { copyText, shareUrl, telegramShare } from "@/lib/teacher-results";

type Folder = { id: string; name: string; quizzes: { id: string; title: string; totalQuestions: number }[] };

function tashkentPlus(hours: number) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(Date.now() + hours * 3600_000));
  const g = (t: string) => p.find((x) => x.type === t)?.value || "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:00` };
}

export function CopyRow({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex gap-2">
      <Input value={value} readOnly className="font-mono text-sm" aria-label="Havola" onFocus={(e) => e.currentTarget.select()} />
      <Button
        type="button"
        variant="outline"
        aria-label="Nusxalash"
        onClick={() =>
          void copyText(value).then((ok) => {
            setDone(ok);
            setTimeout(() => setDone(false), 1500);
          })
        }
      >
        {done ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  );
}

/**
 * Havola yaratish oynasi. Test sahifasidan ochilsa — test tayin, guruh tanlanadi;
 * guruh sahifasidan ochilsa — guruh tayin, test tanlanadi.
 */
export function TeacherLinkDialog({
  open,
  onOpenChange,
  quiz,
  group,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  quiz?: { id: string; title: string };
  group?: { id: string; name: string };
}) {
  const { toast } = useToast();
  const groups = useQuery<{ groups: { id: string; name: string; students: number }[] }>({
    queryKey: ["/api/teacher-panel/groups"],
    enabled: open && !group,
  });
  const library = useQuery<{ folders: Folder[] }>({ queryKey: ["/api/teacher-panel/library"], enabled: open && !quiz });
  const mine = useQuery<{ folders: Folder[] }>({ queryKey: ["/api/teacher-panel/mine"], enabled: open && !quiz });
  const [target, setTarget] = useState<string>(group?.id || "");
  const [picked, setPicked] = useState<{ id: string; title: string; library: boolean } | null>(null);
  const [deadline, setDeadline] = useState(false);
  const [when, setWhen] = useState(() => tashkentPlus(24 * 7));
  const [created, setCreated] = useState<{ code: string; title: string; groupName?: string; closesAt?: string } | null>(null);

  const quizOptions = useMemo(
    () => [
      ...(library.data?.folders || []).map((f) => ({ folder: f.name, library: true, quizzes: f.quizzes })),
      ...(mine.data?.folders || []).map((f) => ({ folder: `Mening: ${f.name}`, library: false, quizzes: f.quizzes })),
    ],
    [library.data, mine.data],
  );

  const create = useMutation({
    mutationFn: async () => {
      let quizId = quiz?.id || picked?.id || "";
      const title = quiz?.title || picked?.title || "";
      if (!quiz && picked?.library)
        quizId = ((await (await apiRequest("POST", `/api/teacher-panel/library/${picked.id}/open`)).json()) as { quizId: string }).quizId;
      const closesAt = deadline ? new Date(`${when.date}T${when.time}:00+05:00`).toISOString() : null;
      const groupId = group?.id || target || null;
      const link = (await (await apiRequest("POST", `/api/teacher-panel/quizzes/${quizId}/links`, { groupId, closesAt })).json()) as { code: string };
      const groupName = group?.name || groups.data?.groups.find((g) => g.id === groupId)?.name;
      return { code: link.code, title, groupName, closesAt: closesAt || undefined };
    },
    onSuccess: (d) => {
      setCreated(d);
      void queryClient.invalidateQueries({ queryKey: ["/api/teacher-panel/quizzes"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/teacher-panel/groups"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/teacher-panel/results"] });
    },
    onError: (e) => toast({ title: "Havola yaratilmadi", description: errorMessage(e), variant: "destructive" }),
  });

  function close(v: boolean) {
    onOpenChange(v);
    if (!v) {
      setCreated(null);
      setPicked(null);
      setDeadline(false);
      if (!group) setTarget("");
    }
  }

  const message = created
    ? `📝 "${created.title}" testi${created.groupName ? ` (${created.groupName})` : ""}.${created.closesAt ? ` Muddat: ${uzDate(created.closesAt)} gacha.` : ""} Havolani ochib, ${created.groupName ? "ro‘yxatdan ismingizni tanlang" : "ismingizni yozing"}:`
    : "";

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Havola tayyor</DialogTitle>
              <DialogDescription>Havolani o‘quvchilarga yuboring. Natijalar “Natijalar” bo‘limida{created.groupName ? " va guruh sahifasida" : ""} saqlanadi.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <CopyRow value={shareUrl(created.code)} />
              <Button asChild className="w-full gradient-purple border-0 text-white">
                <a href={telegramShare(shareUrl(created.code), message)} target="_blank" rel="noreferrer">
                  <Send className="w-4 h-4" /> Telegramda yuborish
                </a>
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => void copyText(`${message}\n${shareUrl(created.code)}`)}>
                <Copy className="w-4 h-4" /> Xabar matni bilan nusxalash
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{group ? `“${group.name}” guruhiga test biriktirish` : "Havola bilan yuborish"}</DialogTitle>
              <DialogDescription>
                {group ? "O‘quvchilar havolani ochib, ro‘yxatdan o‘z ismini tanlaydi. Har biri testni bir marta ishlaydi." : quiz?.title}
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              {!quiz && (
                <div className="space-y-1.5">
                  <Label>Test</Label>
                  <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
                    {library.isLoading || mine.isLoading ? (
                      <p className="p-3 text-sm text-muted-foreground">Yuklanmoqda…</p>
                    ) : !quizOptions.length ? (
                      <p className="p-3 text-sm text-muted-foreground">Hozircha tayyor test yo‘q.</p>
                    ) : (
                      quizOptions.map((f) => (
                        <div key={f.folder}>
                          <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/40 sticky top-0">{f.folder}</p>
                          {f.quizzes.map((qz) => (
                            <button
                              type="button"
                              key={qz.id}
                              role="radio"
                              aria-checked={picked?.id === qz.id}
                              onClick={() => setPicked({ id: qz.id, title: qz.title, library: f.library })}
                              className={`w-full text-left px-3 py-2 text-sm transition-colors ${picked?.id === qz.id ? "bg-purple-50 dark:bg-purple-950 font-semibold" : "hover:bg-muted/50"}`}
                            >
                              {qz.title} <span className="text-xs text-muted-foreground font-normal">· {qz.totalQuestions} savol</span>
                            </button>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              {!group && (
                <div className="space-y-1.5">
                  <Label htmlFor="l-target">Kimga</Label>
                  <select
                    id="l-target"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">Hamma uchun (o‘quvchi ismini o‘zi yozadi)</option>
                    {(groups.data?.groups || []).map((g) => (
                      <option key={g.id} value={g.id}>
                        Guruh: {g.name} ({g.students} o‘quvchi)
                      </option>
                    ))}
                  </select>
                  {!groups.isLoading && !groups.data?.groups.length && (
                    <p className="text-xs text-muted-foreground">Guruhga biriktirish uchun avval “Sinflarim”da guruh yarating.</p>
                  )}
                </div>
              )}
              <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
                <Switch checked={deadline} onCheckedChange={setDeadline} className="mt-0.5" />
                <span className="text-sm">
                  <span className="font-medium block">Ishlash muddati</span>
                  <span className="text-muted-foreground">Muddat tugagach havola avtomatik yopiladi.</span>
                </span>
              </label>
              {deadline && (
                <div className="grid grid-cols-2 gap-3">
                  <Input type="date" required value={when.date} onChange={(e) => setWhen({ ...when, date: e.target.value })} aria-label="Sana" />
                  <Input type="time" required value={when.time} onChange={(e) => setWhen({ ...when, time: e.target.value })} aria-label="Vaqt" />
                </div>
              )}
              <Button type="submit" className="w-full gradient-purple border-0 text-white" disabled={create.isPending || (!quiz && !picked)}>
                {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Havola yaratish
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
