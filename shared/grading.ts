import type { Question, QuestionConfig } from "./schema";

// Normalize a free-text answer for comparison: lowercase, trim, strip most
// punctuation, collapse whitespace. Used by translate / fill_blank matching.
export function normalizeText(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[.,!?;:"'`’‘“”()\[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface GradeResult {
  isCorrect: boolean;
  ratio: number; // 0..1 — partial credit fraction of the question's points
}

type GradableQuestion = Pick<Question, "type" | "correctAnswer" | "options"> & {
  config?: QuestionConfig | null;
};

// Safely parse an answer that may be a JSON string (array/object) or a plain string.
function parseJsonAnswer<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Grade a single answer. Returns isCorrect plus a partial-credit ratio (0..1).
// Works for both the new Duolingo-style types and the legacy ones.
export function gradeAnswer(question: GradableQuestion, answer: unknown): GradeResult {
  const type = question.type || "multiple_choice";

  if (type === "poll") {
    return { isCorrect: true, ratio: 1 };
  }

  if (type === "translate") {
    const cfg = (question.config || {}) as { accepted?: string[] };
    const accepted = [question.correctAnswer, ...(cfg.accepted || [])]
      .filter(Boolean)
      .map(normalizeText);
    const given = normalizeText(String(answer ?? ""));
    const ok = accepted.includes(given) && given.length > 0;
    return { isCorrect: ok, ratio: ok ? 1 : 0 };
  }

  if (type === "reorder") {
    const cfg = (question.config || {}) as { tokens?: string[] };
    const correctTokens = (cfg.tokens || []).map(normalizeText).filter(Boolean);
    const arr = parseJsonAnswer<string[]>(answer) || [];
    const givenTokens = Array.isArray(arr) ? arr.map(normalizeText).filter(Boolean) : [];
    const ok =
      correctTokens.length > 0 &&
      givenTokens.length === correctTokens.length &&
      givenTokens.every((t, i) => t === correctTokens[i]);
    return { isCorrect: ok, ratio: ok ? 1 : 0 };
  }

  if (type === "match") {
    const cfg = (question.config || {}) as { pairs?: { left: string; right: string }[] };
    const pairs = cfg.pairs || [];
    const total = pairs.length;
    if (total === 0) return { isCorrect: false, ratio: 0 };
    const given = parseJsonAnswer<Record<string, string>>(answer) || {};
    let correct = 0;
    for (const p of pairs) {
      const chosen = given[p.left];
      if (chosen != null && normalizeText(String(chosen)) === normalizeText(p.right)) correct++;
    }
    const ratio = correct / total;
    return { isCorrect: correct === total, ratio };
  }

  if (type === "fill_blank") {
    const cfg = (question.config || {}) as { blanks?: { answers: string[] }[] };
    const blanks = cfg.blanks || [];
    const total = blanks.length;
    if (total === 0) return { isCorrect: false, ratio: 0 };
    const given = parseJsonAnswer<string[]>(answer) || [];
    let correct = 0;
    for (let i = 0; i < total; i++) {
      const accepted = (blanks[i]?.answers || []).map(normalizeText).filter(Boolean);
      const val = normalizeText(String((Array.isArray(given) ? given[i] : "") ?? ""));
      if (val.length > 0 && accepted.includes(val)) correct++;
    }
    const ratio = correct / total;
    return { isCorrect: correct === total, ratio };
  }

  if (type === "multiple_select") {
    const correctArr = (question.correctAnswer || "")
      .split(",")
      .map((s) => normalizeText(s))
      .filter(Boolean);
    const total = correctArr.length;
    if (total === 0) return { isCorrect: false, ratio: 0 };
    let givenArr: string[];
    const parsed = parseJsonAnswer<string[]>(answer);
    if (Array.isArray(parsed)) givenArr = parsed.map(normalizeText);
    else givenArr = String(answer ?? "").split(",").map(normalizeText).filter(Boolean);
    const correctCount = givenArr.filter((g) => correctArr.includes(g)).length;
    const wrongCount = givenArr.filter((g) => !correctArr.includes(g)).length;
    const ratio = Math.max(0, (correctCount - wrongCount) / total);
    const isCorrect = correctCount === total && wrongCount === 0;
    return { isCorrect, ratio: isCorrect ? 1 : ratio };
  }

  // multiple_choice, true_false, open_ended — exact (normalized) match
  const ok =
    normalizeText(question.correctAnswer || "") === normalizeText(String(answer ?? "")) &&
    (question.correctAnswer || "").length > 0;
  return { isCorrect: ok, ratio: ok ? 1 : 0 };
}
