import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ArrowLeft, Check, Copy, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { uzDate } from "@/lib/teacher-access";
import { copyText, kindLabel, telegramText, type RunDetail } from "@/lib/teacher-results";
import { PercentPill } from "./results-panel";

function downloadCsv(d: RunDetail) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [["O‘rin", "Ism", "To‘g‘ri", "Jami", "Foiz", "Ball"].map(esc).join(";")]
    .concat(d.rows.map((r) => [r.rank, r.name, r.correct, r.total, r.percent, r.score].map(esc).join(";")))
    .concat(d.missing.map((n) => ["", n, "", "", "ishlamagan", ""].map(esc).join(";")));
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${d.title} — natijalar.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function TeacherResultDetail() {
  const { kind = "", id = "" } = useParams<{ kind: string; id: string }>();
  const q = useQuery<RunDetail>({ queryKey: ["/api/teacher-panel/results", kind, id] });
  const [copied, setCopied] = useState(false);
  if (q.isLoading)
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-64" />
      </div>
    );
  const d = q.data;
  if (!d)
    return (
      <div className="p-6 text-center space-y-3">
        <p className="font-semibold">Natija topilmadi</p>
        <Link href="/teacher/results" className="underline">Natijalarga qaytish</Link>
      </div>
    );
  const avg = d.rows.length ? Math.round(d.rows.reduce((n, r) => n + r.percent, 0) / d.rows.length) : 0;
  const best = d.rows[0]?.percent ?? 0;
  const text = telegramText(d);
  const stats = [
    ["Qatnashdi", d.group ? `${d.rows.length}/${d.rows.length + d.missing.length}` : String(d.rows.length)],
    ["O‘rtacha", `${avg}%`],
    ["Eng yuqori", `${best}%`],
  ];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="space-y-2">
        <Link href={d.group ? `/teacher/groups/${d.group.id}` : "/teacher/results"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> {d.group ? d.group.name : "Natijalar"}
        </Link>
        <h1 className="text-2xl font-bold leading-tight">{d.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary">{d.group ? `Guruh: ${d.group.name}` : kindLabel[d.kind]}</Badge>
          <span>{uzDate(d.at)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map(([label, value]) => (
          <Card key={label} className="p-4 text-center">
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          className="gradient-purple border-0 text-white"
          onClick={() =>
            void copyText(text).then((ok) => {
              setCopied(ok);
              setTimeout(() => setCopied(false), 2000);
            })
          }
          disabled={!d.rows.length}
          data-testid="button-copy-telegram"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? "Nusxalandi" : "Telegram uchun nusxalash"}
        </Button>
        <Button variant="ghost" onClick={() => downloadCsv(d)} disabled={!d.rows.length}>
          <Download className="w-4 h-4" /> Excel (CSV)
        </Button>
      </div>

      {d.rows.length ? (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2 w-12">#</th>
                <th className="text-left font-medium px-2 py-2">Ism</th>
                <th className="text-right font-medium px-2 py-2">To‘g‘ri</th>
                <th className="text-right font-medium px-4 py-2">Natija</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {d.rows.map((r) => (
                <tr key={r.rank + r.name} className={r.rank <= 3 ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}>
                  <td className="px-4 py-2.5 font-semibold tabular-nums">{r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}</td>
                  <td className="px-2 py-2.5">{r.name}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {r.correct}/{r.total}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <PercentPill value={r.percent} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card className="p-8 text-center text-sm text-muted-foreground">Hali hech kim testni tugatmagan.</Card>
      )}

      {d.missing.length > 0 && (
        <Card className="p-4">
          <p className="font-medium text-sm mb-2">Hali ishlamaganlar ({d.missing.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {d.missing.map((n) => (
              <Badge key={n} variant="outline">
                {n}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Telegram matnini ko‘rish</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 font-sans">{text}</pre>
      </details>
    </div>
  );
}
