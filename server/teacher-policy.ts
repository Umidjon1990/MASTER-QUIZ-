import type { NextFunction, Request, Response } from "express";
import { pool } from "./db";

/**
 * Hozircha o'qituvchilar testlarni faqat ishlatadi: o'tkazadi, ulashadi, rejalashtiradi va natijani ko'radi.
 * Test yaratish va savollarni o'zgartirish faqat admin uchun. Keyinroq ochish uchun shu ro'yxatni bo'shatish kifoya.
 */
export const teacherContentLocked: { method: string; path: RegExp }[] = [
  { method: "POST", path: /^\/api\/quizzes\/?$/ },
  { method: "PATCH", path: /^\/api\/quizzes\/[^/]+\/?$/ },
  { method: "PUT", path: /^\/api\/quizzes\/[^/]+\/?$/ },
  { method: "DELETE", path: /^\/api\/quizzes\/[^/]+\/?$/ },
  { method: "POST", path: /^\/api\/quizzes\/[^/]+\/(questions|import|import-text)\/?$/ },
  { method: "PATCH", path: /^\/api\/questions\/[^/]+\/?$/ },
  { method: "DELETE", path: /^\/api\/questions\/[^/]+\/?$/ },
  { method: "POST", path: /^\/api\/question-bank(\/.*)?$/ },
  { method: "DELETE", path: /^\/api\/question-bank(\/.*)?$/ },
  { method: "POST", path: /^\/api\/quiz-categories\/?$/ },
  { method: "DELETE", path: /^\/api\/quiz-categories\/[^/]+\/?$/ },
  { method: "POST", path: /^\/api\/media\/upload\/?$/ },
];

export function isTeacherLocked(method: string, path: string) {
  return teacherContentLocked.some((r) => r.method === method && r.path.test(path));
}

export function teacherReadOnly(req: Request, res: Response, next: NextFunction) {
  if (!isTeacherLocked(req.method, req.path)) return next();
  const userId = req.platformEditor?.nativeId || (req.session as any)?.userId;
  if (!userId) return next();
  pool
    .query("SELECT role FROM user_profiles WHERE user_id=$1", [userId])
    .then(({ rows }) => {
      if (rows[0]?.role === "teacher")
        return res.status(403).json({
          message: "Hozircha o‘qituvchilar tayyor testlardan foydalanadi. Test tuzish keyinroq qo‘shiladi.",
        });
      next();
    })
    .catch(next);
}
