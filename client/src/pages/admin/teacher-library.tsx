import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, FolderOpen, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errorMessage } from "@/lib/teacher-access";

type Folder = { id: string; name: string; owner: string; ownerRole: string; quizzes: number; published: boolean };

/** Admin: qaysi papkalar o'qituvchilarning "Tayyor quizlar" bo'limida va qaysi tartibda chiqadi. */
export default function AdminTeacherLibrary() {
  const { toast } = useToast();
  const q = useQuery<{ folders: Folder[] }>({ queryKey: ["/api/admin/teacher-library"] });
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    if (q.data) setOrder(q.data.folders.filter((f) => f.published).map((f) => f.id));
  }, [q.data]);
  const byId = useMemo(() => new Map((q.data?.folders || []).map((f) => [f.id, f])), [q.data]);
  const others = (q.data?.folders || []).filter((f) => !order.includes(f.id));
  const saved = q.data?.folders.filter((f) => f.published).map((f) => f.id).join() ?? "";
  const dirty = saved !== order.join();

  const save = useMutation({
    mutationFn: async () => apiRequest("PUT", "/api/admin/teacher-library", { folderIds: order }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/teacher-library"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/teacher-panel/library"] });
      toast({ title: "Saqlandi", description: "O‘qituvchilar yangi ro‘yxatni darhol ko‘radi." });
    },
    onError: (e) => toast({ title: "Saqlanmadi", description: errorMessage(e), variant: "destructive" }),
  });
  const move = (i: number, dir: -1 | 1) =>
    setOrder((o) => {
      const n = [...o];
      [n[i], n[i + dir]] = [n[i + dir], n[i]];
      return n;
    });

  const row = (f: Folder, i?: number) => (
    <li key={f.id} className="flex items-center gap-3 p-3">
      <Checkbox
        checked={order.includes(f.id)}
        onCheckedChange={(v) => setOrder((o) => (v ? [...o, f.id] : o.filter((x) => x !== f.id)))}
        aria-label={`${f.name} — o‘qituvchilarga ko‘rsatish`}
      />
      <FolderOpen className="w-4 h-4 text-purple-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{f.name}</p>
        <p className="text-xs text-muted-foreground">
          {f.quizzes} ta test · {f.owner}
        </p>
      </div>
      {i !== undefined && (
        <div className="flex">
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Yuqoriga">
            <ArrowUp className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Pastga">
            <ArrowDown className="w-4 h-4" />
          </Button>
        </div>
      )}
    </li>
  );

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Tayyor quizlar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Belgilangan papkalar barcha o‘qituvchilarning “Quizlar” bo‘limida shu tartibda chiqadi. O‘qituvchilar testlarni o‘zgartira olmaydi —
          faqat o‘tkazadi va natijalarini ko‘radi. Papkadagi testni “Test tuzish” bo‘limida o‘zgartirsangiz, o‘qituvchilar yangi versiyani oladi.
        </p>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-48" />
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="font-semibold">O‘qituvchilarga ko‘rinadi ({order.length})</h2>
            <Card>
              {order.length ? (
                <ul className="divide-y">{order.map((id, i) => byId.get(id) && row(byId.get(id)!, i))}</ul>
              ) : (
                <p className="p-4 text-sm text-muted-foreground">Hali papka tanlanmagan. Pastdagi ro‘yxatdan belgilang.</p>
              )}
            </Card>
          </section>
          {others.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-semibold">Boshqa papkalar</h2>
              <Card>
                <ul className="divide-y">{others.map((f) => row(f))}</ul>
              </Card>
            </section>
          )}
          <div className="sticky bottom-4 flex justify-end">
            <Button className="gradient-purple border-0 text-white shadow-lg" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} O‘zgarishlarni saqlash
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
