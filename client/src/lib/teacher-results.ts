import { uzDate } from "./teacher-access";

export type RunKind = "live" | "scheduled" | "link" | "group";
export type Run = {
  id: string;
  kind: RunKind;
  quizId: string;
  title: string;
  at: string;
  participants: number;
  expected: number | null;
  avgPercent: number;
  group: { id: string; name: string } | null;
  code: string | null;
  isActive: boolean;
  closesAt: string | null;
};
export type ResultRow = { rank: number; name: string; correct: number; total: number; score: number; percent: number; finishedAt: string };
export type RunDetail = {
  kind: RunKind;
  title: string;
  quizId: string;
  at: string;
  code?: string;
  group: { id: string; name: string } | null;
  missing: string[];
  rows: ResultRow[];
};

export const kindLabel: Record<RunKind, string> = {
  live: "Jonli",
  scheduled: "Vaqt belgilangan",
  link: "Havola",
  group: "Guruh",
};

export const runPath = (r: { kind: RunKind; id: string }) => `/teacher/results/${r.kind}/${r.id}`;
export const shareUrl = (code: string) => `${window.location.origin}/shared/${code}`;
export const telegramShare = (url: string, text: string) =>
  `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;

const medals = ["🥇", "🥈", "🥉"];

/** Telegram guruhiga tashlash uchun tayyor matn (reyting bilan). */
export function telegramText(d: RunDetail, limit = 30) {
  const head = `🏆 ${d.title}${d.group ? ` — ${d.group.name}` : ""} (${uzDate(d.at, false)})`;
  const lines = d.rows
    .slice(0, limit)
    .map((r) => `${r.rank <= 3 ? medals[r.rank - 1] : `${r.rank}.`} ${r.name} — ${r.correct}/${r.total} (${r.percent}%)`);
  if (d.rows.length > limit) lines.push(`… yana ${d.rows.length - limit} kishi`);
  const avg = d.rows.length ? Math.round(d.rows.reduce((n, r) => n + r.percent, 0) / d.rows.length) : 0;
  const total = d.group ? `${d.rows.length}/${d.rows.length + d.missing.length}` : String(d.rows.length);
  const foot = [`👥 Qatnashdi: ${total} · O‘rtacha: ${avg}%`];
  if (d.missing.length) foot.push(`⏳ Ishlamaganlar: ${d.missing.join(", ")}`);
  return [head, "", ...lines, "", ...foot].join("\n");
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = Object.assign(document.createElement("textarea"), { value: text });
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}
