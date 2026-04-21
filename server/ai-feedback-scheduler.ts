import { db } from "./db";
import { aiSubmissions, aiClassTasks, aiStudents, aiClasses } from "@shared/schema";
import { eq, and, lte, isNull, isNotNull } from "drizzle-orm";
import { activeBots } from "./ai-bot";

const FEEDBACK_TEACHER_INTROS = [
  "👨‍🏫 Ustozdan izoh keldi:",
  "📝 Ustoz vazifangizni ko'rib chiqdi:",
  "💬 Mana ustozning fikri:",
  "📚 Ustoz baholadi:",
];

function pickIntro(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % FEEDBACK_TEACHER_INTROS.length;
  return FEEDBACK_TEACHER_INTROS[idx];
}

async function processDueFeedbacks() {
  const now = new Date();
  const due = await db
    .select()
    .from(aiSubmissions)
    .where(
      and(
        eq(aiSubmissions.status, "completed"),
        isNull(aiSubmissions.feedbackSentAt),
        isNotNull(aiSubmissions.feedbackScheduledFor),
        lte(aiSubmissions.feedbackScheduledFor, now),
        isNotNull(aiSubmissions.studentChatId),
      ),
    )
    .limit(50);

  if (due.length === 0) return;
  console.log(`[FEEDBACK-SCHEDULER] ${due.length} due feedback(s) to send`);

  for (const sub of due) {
    try {
      const [task] = await db.select().from(aiClassTasks).where(eq(aiClassTasks.id, sub.aiTaskId));
      if (!task) {
        console.warn(`[FEEDBACK-SCHEDULER] Task not found for submission ${sub.id}`);
        await db.update(aiSubmissions).set({ feedbackSentAt: now }).where(eq(aiSubmissions.id, sub.id));
        continue;
      }

      const [student] = await db.select().from(aiStudents).where(eq(aiStudents.id, sub.aiStudentId));
      if (!student) {
        await db.update(aiSubmissions).set({ feedbackSentAt: now }).where(eq(aiSubmissions.id, sub.id));
        continue;
      }

      const [aiClass] = await db.select().from(aiClasses).where(eq(aiClasses.id, student.aiClassId));
      if (!aiClass) {
        await db.update(aiSubmissions).set({ feedbackSentAt: now }).where(eq(aiSubmissions.id, sub.id));
        continue;
      }

      const bot = activeBots.get(aiClass.id);
      if (!bot) {
        console.warn(`[FEEDBACK-SCHEDULER] Bot not active for class ${aiClass.id}, will retry`);
        continue;
      }

      const hasParts = Array.isArray(task.parts) && task.parts.length > 0;
      const partLabel = hasParts ? ` (${sub.partNumber}-bo'lim)` : "";
      const intro = pickIntro(sub.id);
      const msg =
        `${intro}\n\n` +
        `📚 ${task.lessonNumber}-dars: ${task.title}${partLabel}\n` +
        `📊 Baho: ${sub.score}/10\n` +
        `💬 ${sub.aiResponse || ""}`;

      await bot.sendMessage(Number(sub.studentChatId), msg);
      await db.update(aiSubmissions).set({ feedbackSentAt: new Date() }).where(eq(aiSubmissions.id, sub.id));
      console.log(`[FEEDBACK-SCHEDULER] Sent delayed feedback for submission ${sub.id} to chat ${sub.studentChatId}`);
    } catch (err: any) {
      console.error(`[FEEDBACK-SCHEDULER] Failed to send feedback for ${sub.id}:`, err?.message || err);
    }
  }
}

export function startFeedbackScheduler() {
  console.log("[FEEDBACK-SCHEDULER] Starting (interval: 60s)");
  processDueFeedbacks().catch(err => console.error("[FEEDBACK-SCHEDULER] Initial run failed:", err));
  setInterval(() => {
    processDueFeedbacks().catch(err => console.error("[FEEDBACK-SCHEDULER] Tick failed:", err));
  }, 60 * 1000);
}
