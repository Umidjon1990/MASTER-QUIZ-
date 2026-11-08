import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, BookOpen, GraduationCap, Target, Trophy, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { textDir, uzDate, useProfile } from "@/lib/teacher-access";
import type { Run } from "@/lib/teacher-results";
import { RunRow } from "./results-panel";
import TeacherDashboard from "./index";

type Stats = {
  runs: number;
  runsThisMonth: number;
  participants: number;
  avgPercent: number;
  quizzesUsed: number;
  groups: number;
  lastRunAt: string | null;
  topQuizzes: { title: string; runs: number; participants: number }[];
  recent: Run[];
  hardest: { text: string; percent: number; answers: number }[];
};

/** O'qituvchining bosh sahifasi — shaxsiy statistika. Admin (test muallifi) uchun eski dashboard qoladi. */
export default function TeacherHome() {
  const { data: profile, isLoading } = useProfile();
  const { user } = useAuth();
  const isTeacher = profile?.role === "teacher";
  const q = useQuery<Stats>({ queryKey: ["/api/teacher-panel/stats"], enabled: isTeacher, staleTime: 30_000 });
  if (isLoading) return null;
  if (!isTeacher) return <TeacherDashboard />;
  const name = (profile?.displayName || user?.firstName || "Ustoz").split(" ")[0];
  const s = q.data;
  const cards = s
    ? [
        { icon: Trophy, label: "O‘tkazilgan testlar", value: s.runs, note: `bu oy: ${s.runsThisMonth}` },
        { icon: Users, label: "Qatnashchilar", value: s.participants, note: `${s.quizzesUsed} xil test` },
        { icon: Target, label: "O‘rtacha natija", value: `${s.avgPercent}%`, note: "barcha o‘quvchilar" },
        { icon: GraduationCap, label: "Guruhlar", value: s.groups, note: s.lastRunAt ? `oxirgi: ${uzDate(s.lastRunAt, false)}` : "—" },
      ]
    : [];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-teacher-title">Assalomu alaykum, {name}!</h1>
          <p className="text-muted-foreground mt-1">Sizning statistikangiz va so‘nggi o‘tkazilgan testlar.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/teacher/groups">
              <GraduationCap className="w-4 h-4" /> Sinflarim
            </Link>
          </Button>
          <Button asChild className="gradient-purple border-0 text-white">
            <Link href="/teacher/tests">
              <BookOpen className="w-4 h-4" /> Test o‘tkazish
            </Link>
          </Button>
        </div>
      </div>

      {q.isLoading || !s ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map((c) => (
              <Card key={c.label} className="p-4">
                <c.icon className="w-5 h-5 text-purple-600" />
                <p className="text-2xl font-bold mt-2 tabular-nums">{c.value}</p>
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{c.note}</p>
              </Card>
            ))}
          </div>

          {s.runs === 0 ? (
            <Card className="p-6">
              <h2 className="font-semibold mb-3">Qanday boshlash kerak?</h2>
              <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                <li>
                  <Link href="/teacher/groups" className="text-foreground underline">Sinflarim</Link> bo‘limida guruh oching va o‘quvchilar ismini kiriting.
                </li>
                <li>
                  <Link href="/teacher/tests" className="text-foreground underline">Quizlar</Link> bo‘limidan testni tanlang: sinfda jonli o‘tkazing yoki guruhga havola yuboring.
                </li>
                <li>Natija va reyting “Natijalar” bo‘limida chiqadi — Telegramga bir bosishda nusxalanadi.</li>
              </ol>
            </Card>
          ) : (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">So‘nggi o‘tkazilganlar</h2>
                <Link href="/teacher/results" className="text-sm text-purple-700 dark:text-purple-300 inline-flex items-center gap-1">
                  Barchasi <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <Card className="divide-y overflow-hidden">
                {s.recent.map((r) => (
                  <RunRow key={r.kind + r.id} r={r} />
                ))}
              </Card>
            </section>
          )}

          {(s.topQuizzes.length > 0 || s.hardest.length > 0) && (
            <div className="grid md:grid-cols-2 gap-4">
              {s.topQuizzes.length > 0 && (
                <Card className="p-5">
                  <h2 className="font-semibold mb-3">Ko‘p ishlatgan testlaringiz</h2>
                  <ul className="space-y-2.5">
                    {s.topQuizzes.map((t) => (
                      <li key={t.title} className="flex items-center gap-3 text-sm">
                        <span className="flex-1 truncate">{t.title}</span>
                        <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                          {t.runs} marta · {t.participants} kishi
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {s.hardest.length > 0 && (
                <Card className="p-5">
                  <h2 className="font-semibold mb-1">Eng ko‘p xato qilingan savollar</h2>
                  <p className="text-xs text-muted-foreground mb-3">Darsda takrorlash uchun</p>
                  <ul className="space-y-2.5">
                    {s.hardest.map((h) => (
                      <li key={h.text} className="flex items-center gap-3 text-sm">
                        <span className="flex-1 truncate" dir={textDir(h.text)}>
                          {h.text}
                        </span>
                        <span className="text-red-600 dark:text-red-400 font-medium tabular-nums whitespace-nowrap">{h.percent}% to‘g‘ri</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
