import type { Express, RequestHandler } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import {
  adminQuizAssignments,
  questions,
  quizFolders,
  quizzes,
  userProfiles,
} from "@shared/schema";

type RoleMiddleware = (roles: string[]) => RequestHandler;

const MAX_SOURCE_QUIZZES = 50;
const MAX_TARGET_TEACHERS = 20;
const MAX_COPIES_PER_REQUEST = 250;

const assignmentRequestSchema = z.object({
  sourceTeacherId: z.string().trim().min(1).max(255),
  sourceQuizIds: z.array(z.string().trim().min(1).max(255)).min(1).max(MAX_SOURCE_QUIZZES),
  targetTeacherIds: z.array(z.string().trim().min(1).max(255)).min(1).max(MAX_TARGET_TEACHERS),
});

function unique(values: string[]) {
  return [...new Set(values)];
}

function assignedFolderName(sourceTeacherName: string, sourceFolderName: string | null) {
  const suffix = sourceFolderName ? ` · ${sourceFolderName}` : "";
  return `Biriktirilgan · ${sourceTeacherName}${suffix}`.slice(0, 255);
}

export function registerAdminQuizAssignmentRoutes(
  app: Express,
  requireAuth: RequestHandler,
  requireRole: RoleMiddleware,
) {
  app.get("/api/admin/quiz-assignments/teachers", requireAuth, requireRole(["admin"]), async (_req, res) => {
    try {
      const profiles = await db.select({
          userId: userProfiles.userId,
          displayName: userProfiles.displayName,
          role: userProfiles.role,
          isActive: userProfiles.isActive,
        }).from(userProfiles).where(inArray(userProfiles.role, ["teacher", "admin"]));
      const quizOwners = await db.select({ creatorId: quizzes.creatorId }).from(quizzes);
      const counts = new Map<string, number>();
      for (const row of quizOwners) counts.set(row.creatorId, (counts.get(row.creatorId) || 0) + 1);
      const byName = (a: { displayName: string | null }, b: { displayName: string | null }) =>
        (a.displayName || "").localeCompare(b.displayName || "", "uz");
      res.json({
        sources: profiles
          .map(profile => ({ ...profile, quizCount: counts.get(profile.userId) || 0 }))
          .filter(profile => profile.quizCount > 0)
          .sort(byName),
        targets: profiles.filter(profile => profile.role === "teacher" && profile.isActive).sort(byName),
      });
    } catch (error) {
      console.error("[Admin quiz assignment] teachers:", error);
      res.status(500).json({ message: "O'qituvchilarni yuklab bo'lmadi" });
    }
  });

  app.get("/api/admin/quiz-assignments/source/:teacherId", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const [source] = await db.select({
        userId: userProfiles.userId,
        displayName: userProfiles.displayName,
        role: userProfiles.role,
      }).from(userProfiles).where(eq(userProfiles.userId, String(req.params.teacherId)));
      if (!source || !["teacher", "admin"].includes(source.role)) {
        return res.status(404).json({ message: "Manba o'qituvchi topilmadi" });
      }
      const sourceQuizzes = await db.select().from(quizzes).where(eq(quizzes.creatorId, source.userId));
      const sourceFolders = await db.select().from(quizFolders).where(eq(quizFolders.creatorId, source.userId));
      sourceQuizzes.sort((a, b) => {
        if (a.folderId === b.folderId) return a.orderInFolder - b.orderInFolder || a.title.localeCompare(b.title, "uz");
        return (a.folderId || "").localeCompare(b.folderId || "");
      });
      res.json({ source, folders: sourceFolders, quizzes: sourceQuizzes });
    } catch (error) {
      console.error("[Admin quiz assignment] source:", error);
      res.status(500).json({ message: "Testlarni yuklab bo'lmadi" });
    }
  });

  app.get("/api/admin/quiz-assignments/audit", requireAuth, requireRole(["admin"]), async (_req, res) => {
    try {
      const rows = await db.select().from(adminQuizAssignments).orderBy(desc(adminQuizAssignments.createdAt)).limit(100);
      res.json(rows);
    } catch (error) {
      console.error("[Admin quiz assignment] audit:", error);
      res.status(500).json({ message: "Biriktirish jurnalini yuklab bo'lmadi" });
    }
  });

  app.post("/api/admin/quiz-assignments", requireAuth, requireRole(["admin"]), async (req: any, res) => {
    const parsed = assignmentRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Manba testlar va qabul qiluvchi o'qituvchilarni to'g'ri tanlang" });
    }

    const sourceQuizIds = unique(parsed.data.sourceQuizIds);
    const targetTeacherIds = unique(parsed.data.targetTeacherIds);
    if (targetTeacherIds.includes(parsed.data.sourceTeacherId)) {
      return res.status(400).json({ message: "Test egasini qabul qiluvchi sifatida tanlab bo'lmaydi" });
    }
    if (sourceQuizIds.length * targetTeacherIds.length > MAX_COPIES_PER_REQUEST) {
      return res.status(400).json({ message: `Bir so'rovda ko'pi bilan ${MAX_COPIES_PER_REQUEST} ta nusxa yaratish mumkin` });
    }

    try {
      const result = await db.transaction(async tx => {
        const [sourceProfile] = await tx.select({
          userId: userProfiles.userId,
          displayName: userProfiles.displayName,
          role: userProfiles.role,
        }).from(userProfiles).where(eq(userProfiles.userId, parsed.data.sourceTeacherId));
        if (!sourceProfile || !["teacher", "admin"].includes(sourceProfile.role)) {
          throw new Error("SOURCE_NOT_FOUND");
        }

        const targetProfiles = await tx.select({
          userId: userProfiles.userId,
          displayName: userProfiles.displayName,
          role: userProfiles.role,
          isActive: userProfiles.isActive,
        }).from(userProfiles).where(inArray(userProfiles.userId, targetTeacherIds));
        if (targetProfiles.length !== targetTeacherIds.length || targetProfiles.some(profile => profile.role !== "teacher" || !profile.isActive)) {
          throw new Error("TARGET_NOT_FOUND");
        }

        const sourceQuizzes = await tx.select().from(quizzes).where(and(
          eq(quizzes.creatorId, sourceProfile.userId),
          inArray(quizzes.id, sourceQuizIds),
        ));
        if (sourceQuizzes.length !== sourceQuizIds.length) throw new Error("QUIZ_NOT_FOUND");

        const sourceFolders = await tx.select().from(quizFolders).where(eq(quizFolders.creatorId, sourceProfile.userId));
        const sourceQuestions = await tx.select().from(questions).where(inArray(questions.quizId, sourceQuizIds));
        const existingAssignments = await tx.select().from(adminQuizAssignments).where(and(
            inArray(adminQuizAssignments.sourceQuizId, sourceQuizIds),
            inArray(adminQuizAssignments.targetTeacherId, targetTeacherIds),
          ));
        const targetFolders = await tx.select().from(quizFolders).where(inArray(quizFolders.creatorId, targetTeacherIds));
        const targetQuizzes = await tx.select().from(quizzes).where(inArray(quizzes.creatorId, targetTeacherIds));

        const targetQuizIdSet = new Set(targetQuizzes.map(quiz => quiz.id));
        const activeAssignments = new Map<string, typeof existingAssignments[number]>();
        for (const assignment of existingAssignments) {
          if (targetQuizIdSet.has(assignment.targetQuizId)) {
            activeAssignments.set(`${assignment.sourceQuizId}:${assignment.targetTeacherId}`, assignment);
          } else {
            await tx.delete(adminQuizAssignments).where(eq(adminQuizAssignments.id, assignment.id));
          }
        }

        const sourceFolderMap = new Map(sourceFolders.map(folder => [folder.id, folder]));
        const questionsByQuiz = new Map<string, typeof sourceQuestions>();
        for (const question of sourceQuestions) {
          const list = questionsByQuiz.get(question.quizId) || [];
          list.push(question);
          questionsByQuiz.set(question.quizId, list);
        }
        for (const list of questionsByQuiz.values()) list.sort((a, b) => a.orderIndex - b.orderIndex);

        const folderByOwnerAndName = new Map(targetFolders.map(folder => [`${folder.creatorId}:${folder.name}`, folder]));
        const nextFolderSort = new Map<string, number>();
        for (const targetId of targetTeacherIds) {
          const max = targetFolders.filter(folder => folder.creatorId === targetId).reduce((value, folder) => Math.max(value, folder.sortOrder), 0);
          nextFolderSort.set(targetId, max + 1);
        }
        const nextQuizOrder = new Map<string, number>();
        for (const quiz of targetQuizzes) {
          if (!quiz.folderId) continue;
          nextQuizOrder.set(quiz.folderId, Math.max(nextQuizOrder.get(quiz.folderId) || 0, quiz.orderInFolder) + 1);
        }

        const sortedSources = [...sourceQuizzes].sort((a, b) => {
          const aFolder = sourceFolderMap.get(a.folderId || "")?.sortOrder ?? Number.MAX_SAFE_INTEGER;
          const bFolder = sourceFolderMap.get(b.folderId || "")?.sortOrder ?? Number.MAX_SAFE_INTEGER;
          return aFolder - bFolder || a.orderInFolder - b.orderInFolder || a.title.localeCompare(b.title, "uz");
        });
        const sourceTeacherName = sourceProfile.displayName?.trim() || "O'qituvchi";
        const createdByTarget: Record<string, number> = {};
        let created = 0;
        let skipped = 0;

        for (const targetTeacherId of targetTeacherIds) {
          createdByTarget[targetTeacherId] = 0;
          for (const sourceQuiz of sortedSources) {
            if (activeAssignments.has(`${sourceQuiz.id}:${targetTeacherId}`)) {
              skipped += 1;
              continue;
            }

            const sourceFolder = sourceQuiz.folderId ? sourceFolderMap.get(sourceQuiz.folderId) : undefined;
            const folderName = assignedFolderName(sourceTeacherName, sourceFolder?.name || null);
            const folderKey = `${targetTeacherId}:${folderName}`;
            let targetFolder = folderByOwnerAndName.get(folderKey);
            if (!targetFolder) {
              const [createdFolder] = await tx.insert(quizFolders).values({
                name: folderName,
                creatorId: targetTeacherId,
                sortOrder: nextFolderSort.get(targetTeacherId) || 1,
              }).returning();
              nextFolderSort.set(targetTeacherId, createdFolder.sortOrder + 1);
              folderByOwnerAndName.set(folderKey, createdFolder);
              targetFolder = createdFolder;
            }

            const orderInFolder = nextQuizOrder.get(targetFolder.id) || 1;
            nextQuizOrder.set(targetFolder.id, orderInFolder + 1);
            const quizQuestions = questionsByQuiz.get(sourceQuiz.id) || [];
            const [targetQuiz] = await tx.insert(quizzes).values({
              title: sourceQuiz.title,
              description: sourceQuiz.description,
              category: sourceQuiz.category,
              coverImage: sourceQuiz.coverImage,
              isPublic: sourceQuiz.isPublic,
              creatorId: targetTeacherId,
              timerEnabled: sourceQuiz.timerEnabled,
              timePerQuestion: sourceQuiz.timePerQuestion,
              shuffleQuestions: sourceQuiz.shuffleQuestions,
              shuffleOptions: sourceQuiz.shuffleOptions,
              showCorrectAnswers: sourceQuiz.showCorrectAnswers,
              totalQuestions: quizQuestions.length,
              totalPlays: 0,
              totalLikes: 0,
              status: sourceQuiz.status,
              scheduledAt: null,
              scheduledStatus: null,
              scheduledCode: null,
              scheduledRoomCode: null,
              scheduledRequireCode: true,
              scheduledTelegramChatId: null,
              scheduledTelegramQuizChatId: null,
              practiceMode: sourceQuiz.practiceMode,
              allowReplay: sourceQuiz.allowReplay,
              questionSections: sourceQuiz.questionSections || [],
              folderId: targetFolder.id,
              orderInFolder,
            }).returning();

            if (quizQuestions.length > 0) {
              await tx.insert(questions).values(quizQuestions.map(question => ({
                quizId: targetQuiz.id,
                orderIndex: question.orderIndex,
                type: question.type,
                questionText: question.questionText,
                mediaType: question.mediaType,
                mediaUrl: question.mediaUrl,
                options: question.options,
                correctAnswer: question.correctAnswer,
                config: question.config,
                points: question.points,
                timeLimit: question.timeLimit,
              })));
            }

            await tx.insert(adminQuizAssignments).values({
              sourceQuizId: sourceQuiz.id,
              sourceTeacherId: sourceProfile.userId,
              targetQuizId: targetQuiz.id,
              targetTeacherId,
              assignedBy: req.userId,
              sourceTitle: sourceQuiz.title,
              sourceFolderName: sourceFolder?.name || null,
            });
            created += 1;
            createdByTarget[targetTeacherId] += 1;
          }
        }

        return { created, skipped, createdByTarget };
      });
      res.status(201).json(result);
    } catch (error: any) {
      const known: Record<string, string> = {
        SOURCE_NOT_FOUND: "Manba o'qituvchi topilmadi",
        TARGET_NOT_FOUND: "Qabul qiluvchi faol o'qituvchilardan biri topilmadi",
        QUIZ_NOT_FOUND: "Tanlangan testlardan biri manba o'qituvchiga tegishli emas",
      };
      if (known[error?.message]) return res.status(400).json({ message: known[error.message] });
      console.error("[Admin quiz assignment] copy:", error);
      res.status(500).json({ message: "Testlarni biriktirishda xatolik yuz berdi" });
    }
  });
}
