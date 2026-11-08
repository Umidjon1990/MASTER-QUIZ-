import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { uzDate } from "@/lib/teacher-access";

type Row = {
  id: string;
  name: string;
  isActive: boolean;
  runs: number;
  runsThisMonth: number;
  participants: number;
  avgPercent: number;
  groups: number;
  lastRunAt: string | null;
};

/** Admin: har bir o'qituvchi qancha test o'tkazgani va natijalari. */
export default function AdminTeacherStats() {
  const q = useQuery<{ teachers: Row[] }>({ queryKey: ["/api/admin/teacher-stats"] });
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold">O‘qituvchilar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Har bir o‘qituvchi o‘tkazgan testlar, qatnashgan o‘quvchilar va o‘rtacha natija. O‘qituvchi maqomi asosiy saytning admin panelida beriladi.
        </p>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-48" />
      ) : !q.data?.teachers.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Hali o‘qituvchi yo‘q.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2">O‘qituvchi</th>
                <th className="text-right font-medium px-3 py-2">Bu oy</th>
                <th className="text-right font-medium px-3 py-2">Jami testlar</th>
                <th className="text-right font-medium px-3 py-2">Qatnashchilar</th>
                <th className="text-right font-medium px-3 py-2">O‘rtacha</th>
                <th className="text-right font-medium px-3 py-2">Guruhlar</th>
                <th className="text-right font-medium px-4 py-2">Oxirgi test</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {q.data.teachers.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2.5">
                    {t.name} {!t.isActive && <Badge variant="outline">faol emas</Badge>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{t.runsThisMonth}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.runs}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.participants}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.participants ? `${t.avgPercent}%` : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.groups}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap">{t.lastRunAt ? uzDate(t.lastRunAt, false) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
