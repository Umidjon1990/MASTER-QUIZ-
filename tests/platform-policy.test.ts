import test from "node:test";
import assert from "node:assert/strict";
import {
  quizVersion,
  quizQuestion,
  gradeQuizQuestion,
} from "../server/platform-quiz-policy";
import { safeQuestion } from "../server/platform-engine";

test("sale versions ignore play/like counters but include grading and timing edits", () => {
  const quiz = {
    id: "x",
    title: "Title",
    total_plays: 0,
    time_per_question: 30,
  };
  assert.equal(
    quizVersion(quiz, []),
    quizVersion({ ...quiz, total_plays: 50, total_likes: 10 }, []),
  );
  assert.notEqual(
    quizVersion(quiz, []),
    quizVersion({ ...quiz, time_per_question: 40 }, []),
  );
});
test("opaque choices preserve correct multi-select grading and reject duplicate/fabricated answers", () => {
  const q = quizQuestion(
    {
      id: "x",
      type: "multiple_select",
      options: ["A", "B", "C"],
      correctAnswer: "A,B",
      points: 10,
    },
    true,
  );
  const choice = (v: string) => q.options.find((o: any) => o.value === v).id;
  assert.equal(gradeQuizQuestion(q, [choice("A"), choice("B")]), 1);
  assert.equal(gradeQuizQuestion(q, [choice("A"), choice("A")]), 0.5);
  assert.equal(gradeQuizQuestion(q, ["forged"]), 0);
  assert.equal(
    safeQuestion(q).options.some((o: any) => "value" in o),
    false,
  );
});
test("Duo reorder, match, fill-blank and translate keep keys private and use native grading", () => {
  const reorder = quizQuestion(
    {
      id: "r",
      type: "reorder",
      config: { tokens: ["أنا", "طالب"] },
      correctAnswer: "أنا طالب",
    },
    false,
  );
  const tokens = reorder.publicConfig.tokens;
  assert.equal(
    gradeQuizQuestion(reorder, [
      tokens.find((t: any) => t.text === "أنا").id,
      tokens.find((t: any) => t.text === "طالب").id,
    ]),
    1,
  );
  assert.equal(gradeQuizQuestion(reorder, [tokens[0].id, tokens[0].id]), 0);
  const match = quizQuestion(
    {
      id: "m",
      type: "match",
      config: {
        pairs: [
          { left: "أ", right: "A" },
          { left: "ب", right: "B" },
        ],
      },
    },
    false,
  );
  assert.equal(
    gradeQuizQuestion(match, [
      [0, match.matchChoices.find((r: any) => r.text === "A").id],
      [1, match.matchChoices.find((r: any) => r.text === "B").id],
    ]),
    1,
  );
  assert.equal(safeQuestion(match).config.pairs, undefined);
  const blank = quizQuestion(
    {
      id: "b",
      type: "fill_blank",
      config: { blanks: [{ answers: ["student"] }] },
    },
    false,
  );
  assert.equal(gradeQuizQuestion(blank, ["student"]), 1);
  assert.equal(safeQuestion(blank).config.blanks, undefined);
  const translate = quizQuestion(
    {
      id: "t",
      type: "translate",
      correctAnswer: "student",
      config: { accepted: ["pupil"] },
    },
    false,
  );
  assert.equal(gradeQuizQuestion(translate, "pupil"), 1);
  assert.equal(safeQuestion(translate).config.accepted, undefined);
});
