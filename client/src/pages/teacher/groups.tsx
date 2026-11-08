import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { GraduationCap, Loader2, Plus, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errorMessage, uzDate } from "@/lib/teacher-access";

type Group = { id: string; name: string; students: number; tests: number; lastActivity: string | null };

/** Har qatorda bitta ism; vergul bilan ajratilsa ham bo'ladi. */
export const parseNames = (text: string) =>
  text
    .split(/[\n,;]+/)
    .map((n) => n.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);

export default function TeacherGroups() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const q = useQuery<{ groups: Group[] }>({ queryKey: ["/api/teacher-panel/groups"] });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [students, setStudents] = useState("");
  const count = parseNames(students).length;
  const create = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", "/api/teacher-panel/groups", { name: name.trim(), students: parseNames(students) })).json() as Promise<{ id: string }>,
    onSuccess: (d) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/teacher-panel/groups"] });
      setOpen(false);
      navigate(`/teacher/groups/${d.id}`);
    },
    onError: (e) => toast({ title: "Guruh yaratilmadi", description: errorMessage(e), variant: "destructive" }),
  });

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sinflarim</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Guruh oching, o‘quvchilar ismini kiriting va testni guruhga biriktiring. O‘quvchilarga akkaunt kerak emas — ular havolani ochib, ro‘yxatdan o‘z ismini tanlaydi.
          </p>
        </div>
        <Button className="gradient-purple border-0 text-white" onClick={() => setOpen(true)} data-testid="button-new-group">
          <Plus className="w-4 h-4" /> Yangi guruh
        </Button>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : !q.data?.groups.length ? (
        <Card className="p-10 text-center">
          <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <h2 className="font-semibold">Hali guruh yo‘q</h2>
          <p className="text-sm text-muted-foreground mt-1">Birinchi guruhingizni yarating — natijalar shu guruh ichida tartib bilan saqlanadi.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {q.data.groups.map((g) => (
            <Link key={g.id} href={`/teacher/groups/${g.id}`}>
              <Card className="p-5 h-full hover:border-purple-300 transition-colors cursor-pointer" data-testid={`group-${g.id}`}>
                <h2 className="font-semibold text-lg">{g.name}</h2>
                <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1.5">
                  <Users className="w-4 h-4" /> {g.students} o‘quvchi · {g.tests} ta test
                </p>
                <p className="text-xs text-muted-foreground mt-1">{g.lastActivity ? `Oxirgi natija: ${uzDate(g.lastActivity)}` : "Hali natija yo‘q"}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yangi guruh</DialogTitle>
            <DialogDescription>Ismlarni keyin ham qo‘shishingiz mumkin.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="g-name">Guruh nomi</Label>
              <Input id="g-name" required maxLength={100} placeholder="Masalan: 7-B yoki Kechki guruh" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-students">O‘quvchilar (har qatorda bitta ism)</Label>
              <Textarea id="g-students" rows={8} placeholder={"Aliyev Ali\nKarimova Zuhra\n…"} value={students} onChange={(e) => setStudents(e.target.value)} />
              <p className="text-xs text-muted-foreground">{count ? `${count} ta ism` : "Ro‘yxatni Excel yoki Telegramdan nusxalab qo‘yishingiz mumkin."}</p>
            </div>
            <Button type="submit" className="w-full gradient-purple border-0 text-white" disabled={!name.trim() || create.isPending}>
              {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Guruhni yaratish
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
