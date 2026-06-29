import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X, ArrowRight } from "lucide-react";
import type { QuestionConfig } from "@shared/schema";

const DUO_TYPES = ["translate", "reorder", "match", "fill_blank"] as const;

export function isDuoType(type: string | null | undefined): boolean {
  return !!type && (DUO_TYPES as readonly string[]).includes(type);
}

export interface DuoQuestion {
  id?: string;
  type: string;
  questionText: string;
  correctAnswer?: string | null;
  config?: QuestionConfig | null;
  options?: string[] | null;
}

interface DuoAnswerInputProps {
  question: DuoQuestion;
  value: string;
  onChange: (serialized: string) => void;
  disabled?: boolean;
  tone?: "default" | "onDark";
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseArray(value: string): string[] {
  if (!value) return [];
  try {
    const p = JSON.parse(value);
    return Array.isArray(p) ? p.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

function parseRecord(value: string): Record<string, string> {
  if (!value) return {};
  try {
    const p = JSON.parse(value);
    if (p && typeof p === "object" && !Array.isArray(p)) {
      const out: Record<string, string> = {};
      for (const k of Object.keys(p)) out[k] = String((p as any)[k]);
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

function questionKeyOf(q: DuoQuestion): string {
  return q.id ?? q.questionText;
}

// ---- Translate ---------------------------------------------------------------

function TranslateInput({ question, value, onChange, disabled, tone }: DuoAnswerInputProps) {
  return (
    <Input
      placeholder="Tarjimani yozing..."
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      dir="auto"
      data-testid="input-translate"
      className={cn(
        "text-lg",
        tone === "onDark" && "bg-white/10 border-white/20 text-white placeholder:text-white/40",
      )}
    />
  );
}

// ---- Reorder -----------------------------------------------------------------

function ReorderInput({ question, value, onChange, disabled, tone }: DuoAnswerInputProps) {
  const cfg = (question.config || {}) as { tokens?: string[] };
  const tokens = useMemo(
    () => (cfg.tokens || []).map((t) => String(t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questionKeyOf(question)],
  );
  const qKey = questionKeyOf(question);

  const [chips, setChips] = useState<{ id: number; token: string }[]>([]);
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    const baseChips = tokens.map((token, i) => ({ id: i, token }));
    setChips(shuffle(baseChips));
    const init = parseArray(value);
    const used = new Set<number>();
    const sel: number[] = [];
    for (const tok of init) {
      const found = baseChips.find((c) => c.token === tok && !used.has(c.id));
      if (found) {
        used.add(found.id);
        sel.push(found.id);
      }
    }
    setSelected(sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qKey]);

  const tokenById = useMemo(() => {
    const m: Record<number, string> = {};
    chips.forEach((c) => {
      m[c.id] = c.token;
    });
    return m;
  }, [chips]);

  const emit = (sel: number[]) => {
    onChange(JSON.stringify(sel.map((id) => tokenById[id] ?? "")));
  };

  const addChip = (id: number) => {
    if (disabled) return;
    const next = [...selected, id];
    setSelected(next);
    emit(next);
  };

  const removeChip = (id: number) => {
    if (disabled) return;
    const next = selected.filter((s) => s !== id);
    setSelected(next);
    emit(next);
  };

  const available = chips.filter((c) => !selected.includes(c.id));

  const chipClass = cn(
    "rounded-md px-3 py-2 text-sm font-medium border active-elevate-2 disabled:opacity-50",
    tone === "onDark"
      ? "bg-white/10 border-white/25 text-white"
      : "bg-card border-border text-foreground hover-elevate",
  );

  return (
    <div className="space-y-3" data-testid="reorder-input">
      <div
        className={cn(
          "min-h-12 rounded-md border border-dashed p-2 flex flex-wrap gap-2 items-center",
          tone === "onDark" ? "border-white/25 bg-white/5" : "border-border bg-muted/40",
        )}
        data-testid="reorder-answer-row"
      >
        {selected.length === 0 ? (
          <span className={cn("text-sm", tone === "onDark" ? "text-white/40" : "text-muted-foreground")}>
            So'zlarni to'g'ri tartibda tanlang
          </span>
        ) : (
          selected.map((id, idx) => (
            <button
              key={id}
              type="button"
              onClick={() => removeChip(id)}
              disabled={disabled}
              className={chipClass}
              data-testid={`chip-answer-${idx}`}
            >
              {tokenById[id]}
            </button>
          ))
        )}
      </div>
      <div className="flex flex-wrap gap-2" data-testid="reorder-bank">
        {available.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => addChip(c.id)}
            disabled={disabled}
            className={chipClass}
            data-testid={`chip-bank-${c.id}`}
          >
            {c.token}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Match -------------------------------------------------------------------

function MatchInput({ question, value, onChange, disabled, tone }: DuoAnswerInputProps) {
  const cfg = (question.config || {}) as { pairs?: { left: string; right: string }[] };
  const pairs = useMemo(
    () => cfg.pairs || [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questionKeyOf(question)],
  );
  const qKey = questionKeyOf(question);

  const [rights, setRights] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [activeLeft, setActiveLeft] = useState<string | null>(null);

  useEffect(() => {
    setRights(shuffle(pairs.map((p) => p.right)));
    setMapping(parseRecord(value));
    setActiveLeft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qKey]);

  const emit = (m: Record<string, string>) => onChange(JSON.stringify(m));

  const usedRights = new Set(Object.values(mapping));

  const handleLeft = (left: string) => {
    if (disabled) return;
    if (mapping[left]) {
      const m = { ...mapping };
      delete m[left];
      setMapping(m);
      emit(m);
      setActiveLeft(left);
      return;
    }
    setActiveLeft((cur) => (cur === left ? null : left));
  };

  const handleRight = (right: string) => {
    if (disabled || !activeLeft) return;
    const m = { ...mapping };
    for (const k of Object.keys(m)) {
      if (m[k] === right) delete m[k];
    }
    m[activeLeft] = right;
    setMapping(m);
    emit(m);
    setActiveLeft(null);
  };

  const leftClass = (active: boolean, assigned: boolean) =>
    cn(
      "w-full rounded-md px-3 py-2 text-sm font-medium border text-left active-elevate-2 disabled:opacity-50",
      tone === "onDark"
        ? "bg-white/10 border-white/25 text-white"
        : "bg-card border-border text-foreground hover-elevate",
      active && (tone === "onDark" ? "ring-2 ring-white" : "ring-2 ring-primary"),
      assigned && "opacity-90",
    );

  const rightClass = (used: boolean) =>
    cn(
      "w-full rounded-md px-3 py-2 text-sm font-medium border text-left active-elevate-2 disabled:opacity-50",
      tone === "onDark"
        ? "bg-white/10 border-white/25 text-white"
        : "bg-card border-border text-foreground hover-elevate",
      used && "opacity-40",
    );

  return (
    <div className="grid grid-cols-2 gap-3" data-testid="match-input">
      <div className="space-y-2">
        {pairs.map((p, idx) => (
          <button
            key={p.left + idx}
            type="button"
            onClick={() => handleLeft(p.left)}
            disabled={disabled}
            className={leftClass(activeLeft === p.left, !!mapping[p.left])}
            data-testid={`match-left-${idx}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate">{p.left}</span>
              {mapping[p.left] && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 shrink-0 rounded px-1.5 py-0.5 text-xs",
                    tone === "onDark" ? "bg-white/20 text-white" : "bg-primary/15 text-foreground",
                  )}
                >
                  <ArrowRight className="w-3 h-3" />
                  {mapping[p.left]}
                  <X className="w-3 h-3" />
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {rights.map((r, idx) => (
          <button
            key={r + idx}
            type="button"
            onClick={() => handleRight(r)}
            disabled={disabled || usedRights.has(r)}
            className={rightClass(usedRights.has(r))}
            data-testid={`match-right-${idx}`}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Fill blank --------------------------------------------------------------

function FillBlankInput({ question, value, onChange, disabled, tone }: DuoAnswerInputProps) {
  const parts = useMemo(
    () => question.questionText.split(/_{3,}/),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questionKeyOf(question)],
  );
  const blankCount = Math.max(0, parts.length - 1);
  const qKey = questionKeyOf(question);

  const [vals, setVals] = useState<string[]>([]);

  useEffect(() => {
    const init = parseArray(value);
    setVals(Array.from({ length: blankCount }, (_, i) => init[i] ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qKey]);

  const update = (i: number, v: string) => {
    if (disabled) return;
    const next = [...vals];
    next[i] = v;
    setVals(next);
    onChange(JSON.stringify(next));
  };

  return (
    <div
      className={cn(
        "text-lg leading-loose",
        tone === "onDark" ? "text-white" : "text-foreground",
      )}
      dir="auto"
      data-testid="fill-blank-input"
    >
      {parts.map((part, i) => (
        <span key={i}>
          <span>{part}</span>
          {i < blankCount && (
            <Input
              value={vals[i] ?? ""}
              onChange={(e) => update(i, e.target.value)}
              disabled={disabled}
              dir="auto"
              data-testid={`input-blank-${i}`}
              className={cn(
                "inline-block w-32 mx-1 align-middle h-9",
                tone === "onDark" && "bg-white/10 border-white/20 text-white placeholder:text-white/40",
              )}
            />
          )}
        </span>
      ))}
    </div>
  );
}

// ---- Dispatcher --------------------------------------------------------------

export default function DuoAnswerInput(props: DuoAnswerInputProps) {
  switch (props.question.type) {
    case "translate":
      return <TranslateInput {...props} />;
    case "reorder":
      return <ReorderInput {...props} />;
    case "match":
      return <MatchInput {...props} />;
    case "fill_blank":
      return <FillBlankInput {...props} />;
    default:
      return null;
  }
}
