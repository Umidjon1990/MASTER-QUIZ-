---
name: Duo question grading paths
description: Where the 4 Duolingo-style question types must be graded, and the data contract that ties parser/editor/student/grading together.
---

# Duolingo-style question types (translate, reorder, match, fill_blank)

These types store extra data in `questions.config` (JSONB) and use serialized answer strings, so naive equality checks (`answer === correctAnswer`) grade them wrong. Every scoring path must call `gradeAnswer(question, answer)` from `shared/grading.ts`.

**Rule:** there are SEPARATE scoring code paths and it is easy to fix one and miss others. They are: websocket live play, websocket reconnect-grading, the assignment-submit REST route, and the public-submit REST route. Self-paced assignment solving grades server-side on submit (not purely client-side). If you add a Duo type or change grading, audit ALL of them.

**Why:** during initial build, only the websocket path was wired to `gradeAnswer`; the two REST routes (`/api/assignments/:id/attempt`, `/api/quizzes/:id/submit-public`) still used legacy equality logic, so Duo answers were scored as wrong/zero despite correct UI + serialization. Caught only in code review.

**Also:** question payloads must carry `config`. Any endpoint that sends questions to the client (play route's safeQuestions map, websocket `public:question` both emit sites, and `public:request-state` reconnect) must include `config`, or reorder/match render empty (they need config.tokens / config.pairs). translate/fill_blank only need questionText so they hide this bug.

**Data contract:** translate `config{accepted:string[]}` correctAnswer=primary, answer=plain string; reorder `config{tokens}` correctAnswer=tokens.join(" "), answer=JSON string[]; match `config{pairs:{left,right}[]}` correctAnswer="match", answer=JSON Record<left,right>; fill_blank `config{blanks:{answers:string[]}[]}` questionText has blanks, answer=JSON string[].

**fill_blank blank marker:** standardized on a run of 3+ underscores everywhere — parser/editor count via `/_{3,}/g`, student splits via `split(/_{3,}/)`. Keep these in lockstep or blank counts diverge between editor and play.

**How to apply:** when touching question types or scoring, grep for every place that builds a question payload or computes a score and confirm it forwards `config` and uses `gradeAnswer` (which returns `{isCorrect, ratio}` for partial credit; score = round(points * ratio)).
