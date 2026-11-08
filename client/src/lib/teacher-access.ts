import { useQuery } from "@tanstack/react-query";
import type { UserProfile } from "@shared/schema";

export const PORTAL_URL = "https://zamonaviy-talim.up.railway.app";

/**
 * O'qituvchilardan hozircha yashirilgan bo'limlar. Sahifalar va ma'lumotlar o'chirilmagan:
 * qaytadan ochish uchun yo'lni shu ro'yxatdan olib tashlab, menyuga qo'shish kifoya.
 */
export const hiddenTeacherPaths = [
  "/teacher/quizzes", // eski "Quizlarim" — o'rniga /teacher/tests
  "/teacher/folder",
  "/teacher/lessons",
  "/teacher/lesson",
  "/teacher/assignments",
  "/teacher/classes",
  "/teacher/ai-classes",
  "/teacher/question-bank",
  "/teacher/telegram",
  "/discover",
];

export const isHiddenForTeacher = (path: string) =>
  hiddenTeacherPaths.some((p) => path === p || path.startsWith(p + "/"));

export function useProfile(enabled = true) {
  return useQuery<UserProfile>({ queryKey: ["/api/profile"], enabled });
}

/** apiRequest xatosi "403: {\"message\":...}" ko'rinishida keladi — o'quvchiga faqat matnini ko'rsatamiz. */
export function errorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const body = raw.replace(/^\d{3}:\s*/, "");
  try {
    return JSON.parse(body).message || body;
  } catch {
    return body || "Xatolik yuz berdi";
  }
}

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
/** Toshkent vaqti bilan "8-noyabr, 19:00" (brauzerlarda uz-UZ formati to'liq emas, shuning uchun o'zimiz yozamiz). */
export function uzDate(iso: string | Date, withTime = true) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value || "";
  const thisYear = String(new Date().getFullYear()) === g("year");
  const date = `${Number(g("day"))}-${MONTHS[Number(g("month")) - 1]}${thisYear ? "" : " " + g("year")}`;
  return withTime ? `${date}, ${g("hour")}:${g("minute")}` : date;
}

/** Arabcha so'z qo'shilgan o'zbekcha savol chapdan o'ngga, faqat arabcha matn o'ngdan chapga o'qilsin. */
export const textDir = (s: string) => (/[A-Za-zЀ-ӿ]/.test(s) ? "ltr" : "auto");
