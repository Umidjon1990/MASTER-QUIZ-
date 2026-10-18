import { createHash, randomUUID } from "node:crypto";
import { gradeAnswer } from "../shared/grading";
import { shuffle } from "./platform-engine";
export const types = new Set([
  "multiple_choice",
  "multiple_select",
  "true_false",
  "open_ended",
  "translate",
  "reorder",
  "match",
  "fill_blank",
]);
export function quizVersion(quiz: any, questions: any[]) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        {
          id: quiz.id,
          title: quiz.title,
          description: quiz.description,
          status: quiz.status,
          isPublic: quiz.is_public,
          timerEnabled: quiz.timer_enabled,
          timePerQuestion: quiz.time_per_question,
          shuffleQuestions: quiz.shuffle_questions,
          shuffleOptions: quiz.shuffle_options,
          sections: quiz.question_sections,
        },
        questions,
      ]),
    )
    .digest("hex")
    .slice(0, 40);
}
export function quizQuestion(
  native: any,
  shuffleOptions: boolean,
  passage?: string,
) {
  const optionList = (native.options || []).map((value: string) => ({
    id: randomUUID(),
    optionText: value,
    value,
  }));
  const q: any = {
    id: native.id,
    type: native.type,
    questionText: native.questionText,
    points: native.points,
    passage,
    audioUrl: native.mediaType === "audio" ? native.mediaUrl : undefined,
    imageUrl: native.mediaType === "image" ? native.mediaUrl : undefined,
    native,
    options: shuffleOptions ? shuffle(optionList) : optionList,
    publicConfig: {},
  };
  if (native.type === "multiple_select") {
    q.type = "multiple_choice";
    q.multiple = true;
  }
  if (native.type === "true_false") {
    q.type = "multiple_choice";
    q.options = optionList.length
      ? optionList
      : ["true", "false"].map((value) => ({
          id: randomUUID(),
          optionText: value === "true" ? "To‘g‘ri" : "Noto‘g‘ri",
          value,
        }));
  }
  if (native.type === "reorder")
    q.publicConfig.tokens = shuffle(
      (native.config?.tokens || []).map((text: string) => ({
        id: randomUUID(),
        text,
      })),
    );
  if (native.type === "match") {
    q.type = "matching";
    q.matchChoices = shuffle(
      (native.config?.pairs || []).map((p: any) => ({
        id: randomUUID(),
        text: p.right,
      })),
    );
    q.publicConfig = {
      leftColumn: (native.config?.pairs || []).map((p: any) => p.left),
      rightColumn: q.matchChoices,
    };
  }
  if (native.type === "fill_blank") {
    q.type = "multi_blank";
    q.publicConfig = { blankCount: native.config?.blanks?.length || 0 };
  }
  return q;
}
export function gradeQuizQuestion(q: any, value: any) {
  if (value === undefined || value === null) return 0;
  let answer = value;
  const native = q.native;
  if (
    ["multiple_choice", "multiple_select", "true_false"].includes(native.type)
  ) {
    const values = [...new Set(Array.isArray(value) ? value : [value])].map(
      (v) => q.options.find((o: any) => o.id === v)?.value,
    );
    if (values.some((v) => v === undefined)) return 0;
    if (native.type !== "multiple_select" && values.length !== 1) return 0;
    answer = native.type === "multiple_select" ? values : values[0];
  }
  if (native.type === "reorder") {
    if (!Array.isArray(value) || new Set(value).size !== value.length) return 0;
    const tokens = value.map(
      (v) => q.publicConfig.tokens.find((t: any) => t.id === v)?.text,
    );
    if (tokens.some((v) => v === undefined)) return 0;
    answer = JSON.stringify(tokens);
  }
  if (native.type === "match") {
    if (!Array.isArray(value)) return 0;
    const pairs: Record<string, string> = {};
    for (const pair of value) {
      const left = q.publicConfig.leftColumn[pair?.[0]],
        right = q.matchChoices.find((r: any) => r.id === pair?.[1]);
      if (left && right) pairs[left] = right.text;
    }
    answer = JSON.stringify(pairs);
  }
  if (native.type === "fill_blank")
    answer = JSON.stringify(Array.isArray(value) ? value : []);
  return gradeAnswer(native, answer).ratio;
}
