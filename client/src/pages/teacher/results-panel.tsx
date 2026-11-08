import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Search, Trophy, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { uzDate, useProfile } from "@/lib/teacher-access";
import { kindLabel, runPath, type Run } from "@/lib/teacher-results";
import TeacherResultsLegacy from "./results";

/** Natija foizini rangli ko'rsatish. */
export function PercentPill({ value }: { value: number }) {
  const tone =
    value >= 85
      ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
      : value >= 60
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
  return <span className={`inline-flex min-w-[3.25rem] justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`}>{value}%</span>;
}

export function RunRow({ r }: { r: Run }) {
  return (
    <Link href={runPath(r)}>
      <div className="flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors cursor-pointer" data-testid={`run-${r.id}`}>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{r.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2">
            <span>{uzDate(r.at)}</span>
            <span>·</span>
            <span>{r.group ? r.group.name : kindLabel[r.kind]}</span>
          </p>
        </div>
        <span className="text-sm text-muted-foreground flex items-center gap-1 tabular-nums">
          <Users className="w-4 h-4" />
          {r.expected != null ? `${r.participants}/${r.expected}` : r.participants}
        </span>
        {r.participants > 0 ? <PercentPill value={r.avgPercent} /> : <span className="text-xs text-muted-foreground min-w-[3.25rem] text-center">—</span>}
      </div>
    </Link>
  );
}

/** O'qituvchi uchun yagona natijalar ro'yxati. Admin eski sahifani ko'radi. */
export default function TeacherResultsPanel() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const isTeacher = profile?.role === "teacher";
  const q = useQuery<{ runs: Run[] }>({ queryKey: ["/api/teacher-panel/results"], enabled: isTeacher, staleTime: 30_000 });
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | "group" | "link" | "live">("all");
  const term = search.trim().toLocaleLowerCase("uz");
  const runs = useMemo(
    () =>
      (q.data?.runs || []).filter(
        (r) =>
          (kind === "all" || (kind === "live" ? r.kind === "live" || r.kind === "scheduled" : r.kind === kind)) &&
          (!term || `${r.title} ${r.group?.name || ""}`.toLocaleLowerCase("uz").includes(term)),
      ),
    [q.data, kind, term],
  );
  if (profileLoading) return null;
  if (!isTeacher) return <TeacherResultsLegacy />;

  const filters = [
    ["all", "Hammasi"],
    ["group", "Guruhlar"],
    ["link", "Havolalar"],
    ["live", "Jonli"],
  ] as const;
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-results-title">Natijalar</h1>
        <p className="text-sm text-muted-foreground mt-1">Har bir o‘tkazilgan test: kim qatnashdi, reyting va Telegram uchun tayyor matn.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Test yoki guruh nomi" className="pl-9" />
        </div>
        <div className="inline-flex rounded-lg border p-1 bg-muted/40 self-start" role="tablist">
          {filters.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={kind === id}
              onClick={() => setKind(id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${kind === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-64" />
      ) : !runs.length ? (
        <Card className="p-10 text-center">
          <Trophy className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <h2 className="font-semibold">{q.data?.runs.length ? "Hech narsa topilmadi" : "Hali natija yo‘q"}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {q.data?.runs.length ? "Boshqa so‘z yoki bo‘limni tanlang." : (
              <>
                Testni <Link href="/teacher/tests" className="underline">Quizlar</Link> bo‘limidan o‘tkazing — natijalar shu yerda paydo bo‘ladi.
              </>
            )}
          </p>
        </Card>
      ) : (
        <Card className="divide-y overflow-hidden">
          {runs.map((r) => (
            <RunRow key={r.kind + r.id} r={r} />
          ))}
        </Card>
      )}
      {!!runs.length && <div className="text-xs text-muted-foreground"><Badge variant="outline" className="mr-1">{runs.length}</Badge> ta o‘tkazish</div>}
    </div>
  );
}
