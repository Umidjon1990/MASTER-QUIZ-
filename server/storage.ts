import {
  type UserProfile, type InsertUserProfile,
  type Quiz, type InsertQuiz,
  type Question, type InsertQuestion,
  type LiveSession, type InsertLiveSession,
  type SessionParticipant, type InsertSessionParticipant,
  type SessionAnswer, type InsertSessionAnswer,
  type QuizResult, type InsertQuizResult,
  type Assignment, type InsertAssignment,
  type AssignmentAttempt, type InsertAssignmentAttempt,
  type Class as ClassType, type InsertClass,
  type ClassMember, type InsertClassMember,
  type QuestionBankItem, type InsertQuestionBank,
  type QuizLike, type InsertQuizLike,
  type LiveLesson, type InsertLiveLesson,
  type QuizCategory,
  type QuizFolder, type InsertQuizFolder,
  type SharedQuiz, type InsertSharedQuiz,
  type SharedQuizAttempt, type InsertSharedQuizAttempt,
  userProfiles, quizzes, questions, liveSessions,
  sessionParticipants, sessionAnswers, quizResults,
  assignments, assignmentAttempts, classes, classMembers, questionBank, quizLikes,
  liveLessons, quizCategories, quizFolders, sharedQuizzes, sharedQuizAttempts,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, ilike, isNull, or, inArray, lte } from "drizzle-orm";

export interface IStorage {
  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  updateUserProfile(userId: string, data: Partial<InsertUserProfile>): Promise<UserProfile | undefined>;
  getAllProfiles(): Promise<UserProfile[]>;

  createQuiz(quiz: InsertQuiz): Promise<Quiz>;
  getQuiz(id: string): Promise<Quiz | undefined>;
  getQuizzesByCreator(creatorId: string): Promise<Quiz[]>;
  getPublicQuizzes(): Promise<Quiz[]>;
  getAllQuizzes(): Promise<Quiz[]>;
  updateQuiz(id: string, data: Partial<InsertQuiz>): Promise<Quiz | undefined>;
  deleteQuiz(id: string): Promise<void>;
  incrementQuizPlays(id: string): Promise<void>;
  getQuizByScheduledCode(code: string): Promise<Quiz | undefined>;
  getScheduledPendingQuizzes(): Promise<Quiz[]>;

  createQuestion(question: InsertQuestion): Promise<Question>;
  getQuestionsByQuiz(quizId: string): Promise<Question[]>;
  getQuestion(id: string): Promise<Question | undefined>;
  updateQuestion(id: string, data: Partial<InsertQuestion>): Promise<Question | undefined>;
  deleteQuestion(id: string): Promise<void>;
  deleteQuestionsByQuiz(quizId: string): Promise<void>;

  createLiveSession(session: InsertLiveSession): Promise<LiveSession>;
  getLiveSession(id: string): Promise<LiveSession | undefined>;
  getLiveSessionByCode(code: string): Promise<LiveSession | undefined>;
  getActiveSessionsByHost(hostId: string): Promise<LiveSession[]>;
  updateLiveSession(id: string, data: Partial<LiveSession>): Promise<LiveSession | undefined>;

  addParticipant(participant: InsertSessionParticipant): Promise<SessionParticipant>;
  getParticipant(id: string): Promise<SessionParticipant | undefined>;
  getSessionParticipants(sessionId: string): Promise<SessionParticipant[]>;
  updateParticipant(id: string, data: Partial<SessionParticipant>): Promise<SessionParticipant | undefined>;

  saveAnswer(answer: InsertSessionAnswer): Promise<SessionAnswer>;
  getAnswersBySession(sessionId: string): Promise<SessionAnswer[]>;

  saveQuizResult(result: InsertQuizResult): Promise<QuizResult>;
  getResultsBySession(sessionId: string): Promise<QuizResult[]>;
  getResultsByUser(userId: string): Promise<QuizResult[]>;
  getResultsByQuiz(quizId: string): Promise<QuizResult[]>;

  getDashboardStats(): Promise<{ totalUsers: number; totalQuizzes: number; totalSessions: number; totalPlays: number }>;

  createAssignment(data: InsertAssignment): Promise<Assignment>;
  getAssignment(id: string): Promise<Assignment | undefined>;
  getAssignmentsByCreator(creatorId: string): Promise<Assignment[]>;
  getAssignmentsByClass(classId: string): Promise<Assignment[]>;
  getAssignmentsByStudent(userId: string): Promise<Assignment[]>;
  updateAssignment(id: string, data: Partial<InsertAssignment>): Promise<Assignment | undefined>;
  deleteAssignment(id: string): Promise<void>;
  createAssignmentAttempt(data: InsertAssignmentAttempt): Promise<AssignmentAttempt>;
  getAttemptsByAssignment(assignmentId: string): Promise<AssignmentAttempt[]>;
  getAttemptsByUser(assignmentId: string, userId: string): Promise<AssignmentAttempt[]>;

  createClass(data: InsertClass): Promise<ClassType>;
  getClass(id: string): Promise<ClassType | undefined>;
  getClassByCode(code: string): Promise<ClassType | undefined>;
  getClassesByTeacher(teacherId: string): Promise<ClassType[]>;
  getClassesByStudent(userId: string): Promise<ClassType[]>;
  addClassMember(data: InsertClassMember): Promise<ClassMember>;
  getClassMembers(classId: string): Promise<ClassMember[]>;
  removeClassMember(classId: string, userId: string): Promise<void>;
  deleteClass(id: string): Promise<void>;

  createBankQuestion(data: InsertQuestionBank): Promise<QuestionBankItem>;
  getBankQuestionsByCreator(creatorId: string): Promise<QuestionBankItem[]>;
  getBankQuestion(id: string): Promise<QuestionBankItem | undefined>;
  updateBankQuestion(id: string, data: Partial<InsertQuestionBank>): Promise<QuestionBankItem | undefined>;
  deleteBankQuestion(id: string): Promise<void>;

  toggleQuizLike(quizId: string, userId: string): Promise<{ liked: boolean }>;
  getQuizLikes(quizId: string): Promise<number>;
  isQuizLiked(quizId: string, userId: string): Promise<boolean>;

  createLiveLesson(data: InsertLiveLesson): Promise<LiveLesson>;
  getLiveLesson(id: string): Promise<LiveLesson | undefined>;
  getLiveLessonByCode(code: string): Promise<LiveLesson | undefined>;
  getLiveLessonsByTeacher(teacherId: string): Promise<LiveLesson[]>;
  updateLiveLesson(id: string, data: Partial<LiveLesson>): Promise<LiveLesson | undefined>;
  deleteLiveLesson(id: string): Promise<void>;

  createQuizCategory(data: { name: string; creatorId: string }): Promise<QuizCategory>;
  getQuizCategoriesByCreator(creatorId: string): Promise<QuizCategory[]>;
  deleteQuizCategory(id: string): Promise<void>;
  getAllQuizCategories(): Promise<QuizCategory[]>;

  createQuizFolder(data: InsertQuizFolder): Promise<QuizFolder>;
  getQuizFoldersByCreator(creatorId: string): Promise<QuizFolder[]>;
  deleteQuizFolder(id: string): Promise<void>;
  updateQuizFolderOrder(id: string, sortOrder: number): Promise<void>;
  updateQuizOrderInFolder(quizId: string, orderInFolder: number): Promise<void>;

  createSharedQuiz(data: InsertSharedQuiz): Promise<SharedQuiz>;
  getSharedQuizByCode(code: string): Promise<SharedQuiz | undefined>;
  getSharedQuizzesByCreator(creatorId: string): Promise<SharedQuiz[]>;
  getSharedQuizzesByQuizId(quizId: string): Promise<SharedQuiz[]>;
  updateSharedQuiz(id: string, data: Partial<SharedQuiz>): Promise<SharedQuiz | undefined>;
  createSharedQuizAttempt(data: InsertSharedQuizAttempt): Promise<SharedQuizAttempt>;
  updateSharedQuizAttempt(id: string, data: Partial<SharedQuizAttempt>): Promise<SharedQuizAttempt | undefined>;
  getSharedQuizAttempts(sharedQuizId: string): Promise<SharedQuizAttempt[]>;
  getSharedQuizAttempt(id: string): Promise<SharedQuizAttempt | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return profile;
  }

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const [created] = await db.insert(userProfiles).values(profile as any).returning();
    return created;
  }

  async updateUserProfile(userId: string, data: Partial<InsertUserProfile>): Promise<UserProfile | undefined> {
    const [updated] = await db.update(userProfiles).set(data as any).where(eq(userProfiles.userId, userId)).returning();
    return updated;
  }

  async getAllProfiles(): Promise<UserProfile[]> {
    return db.select().from(userProfiles).orderBy(desc(userProfiles.createdAt));
  }

  async createQuiz(quiz: InsertQuiz): Promise<Quiz> {
    const [created] = await db.insert(quizzes).values(quiz).returning();
    return created;
  }

  async getQuiz(id: string): Promise<Quiz | undefined> {
    const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, id));
    return quiz;
  }

  async getQuizzesByCreator(creatorId: string): Promise<Quiz[]> {
    return db.select().from(quizzes).where(eq(quizzes.creatorId, creatorId)).orderBy(desc(quizzes.createdAt));
  }

  async getPublicQuizzes(): Promise<Quiz[]> {
    return db.select().from(quizzes).where(and(eq(quizzes.isPublic, true), eq(quizzes.status, "published"))).orderBy(desc(quizzes.createdAt));
  }

  async getAllQuizzes(): Promise<Quiz[]> {
    return db.select().from(quizzes).orderBy(desc(quizzes.createdAt));
  }

  async updateQuiz(id: string, data: Partial<InsertQuiz>): Promise<Quiz | undefined> {
    const [updated] = await db.update(quizzes).set({ ...data, updatedAt: new Date() }).where(eq(quizzes.id, id)).returning();
    return updated;
  }

  async deleteQuiz(id: string): Promise<void> {
    await db.delete(quizzes).where(eq(quizzes.id, id));
  }

  async incrementQuizPlays(id: string): Promise<void> {
    await db.update(quizzes).set({ totalPlays: sql`${quizzes.totalPlays} + 1` }).where(eq(quizzes.id, id));
  }

  async getQuizByScheduledCode(code: string): Promise<Quiz | undefined> {
    const [quiz] = await db.select().from(quizzes).where(eq(quizzes.scheduledCode, code));
    return quiz;
  }

  async getScheduledPendingQuizzes(): Promise<Quiz[]> {
    return db.select().from(quizzes)
      .where(and(eq(quizzes.scheduledStatus, "pending"), lte(quizzes.scheduledAt, new Date())));
  }

  async createQuestion(question: InsertQuestion): Promise<Question> {
    const [created] = await db.insert(questions).values(question as any).returning();
    const count = await db.select({ count: sql<number>`count(*)` }).from(questions).where(eq(questions.quizId, question.quizId));
    await db.update(quizzes).set({ totalQuestions: Number(count[0].count) }).where(eq(quizzes.id, question.quizId));
    return created;
  }

  async getQuestionsByQuiz(quizId: string): Promise<Question[]> {
    return db.select().from(questions).where(eq(questions.quizId, quizId)).orderBy(questions.orderIndex);
  }

  async getQuestion(id: string): Promise<Question | undefined> {
    const [q] = await db.select().from(questions).where(eq(questions.id, id));
    return q;
  }

  async updateQuestion(id: string, data: Partial<InsertQuestion>): Promise<Question | undefined> {
    const [updated] = await db.update(questions).set(data as any).where(eq(questions.id, id)).returning();
    return updated;
  }

  async deleteQuestion(id: string): Promise<void> {
    const [q] = await db.select().from(questions).where(eq(questions.id, id));
    if (q) {
      await db.delete(questions).where(eq(questions.id, id));
      const count = await db.select({ count: sql<number>`count(*)` }).from(questions).where(eq(questions.quizId, q.quizId));
      await db.update(quizzes).set({ totalQuestions: Number(count[0].count) }).where(eq(quizzes.id, q.quizId));
    }
  }

  async deleteQuestionsByQuiz(quizId: string): Promise<void> {
    await db.delete(questions).where(eq(questions.quizId, quizId));
    await db.update(quizzes).set({ totalQuestions: 0 }).where(eq(quizzes.id, quizId));
  }

  async createLiveSession(session: InsertLiveSession): Promise<LiveSession> {
    const [created] = await db.insert(liveSessions).values(session).returning();
    return created;
  }

  async getLiveSession(id: string): Promise<LiveSession | undefined> {
    const [s] = await db.select().from(liveSessions).where(eq(liveSessions.id, id));
    return s;
  }

  async getLiveSessionByCode(code: string): Promise<LiveSession | undefined> {
    const [s] = await db.select().from(liveSessions).where(eq(liveSessions.joinCode, code));
    return s;
  }

  async getActiveSessionsByHost(hostId: string): Promise<LiveSession[]> {
    return db.select().from(liveSessions)
      .where(and(eq(liveSessions.hostId, hostId), eq(liveSessions.status, "waiting")))
      .orderBy(desc(liveSessions.createdAt));
  }

  async updateLiveSession(id: string, data: Partial<LiveSession>): Promise<LiveSession | undefined> {
    const [updated] = await db.update(liveSessions).set(data).where(eq(liveSessions.id, id)).returning();
    return updated;
  }

  async addParticipant(participant: InsertSessionParticipant): Promise<SessionParticipant> {
    const [created] = await db.insert(sessionParticipants).values(participant).returning();
    await db.update(liveSessions).set({ participantCount: sql`${liveSessions.participantCount} + 1` }).where(eq(liveSessions.id, participant.sessionId));
    return created;
  }

  async getParticipant(id: string): Promise<SessionParticipant | undefined> {
    const [p] = await db.select().from(sessionParticipants).where(eq(sessionParticipants.id, id));
    return p;
  }

  async getSessionParticipants(sessionId: string): Promise<SessionParticipant[]> {
    return db.select().from(sessionParticipants)
      .where(eq(sessionParticipants.sessionId, sessionId))
      .orderBy(desc(sessionParticipants.score));
  }

  async updateParticipant(id: string, data: Partial<SessionParticipant>): Promise<SessionParticipant | undefined> {
    const [updated] = await db.update(sessionParticipants).set(data).where(eq(sessionParticipants.id, id)).returning();
    return updated;
  }

  async saveAnswer(answer: InsertSessionAnswer): Promise<SessionAnswer> {
    const [created] = await db.insert(sessionAnswers).values(answer).returning();
    return created;
  }

  async getAnswersBySession(sessionId: string): Promise<SessionAnswer[]> {
    return db.select().from(sessionAnswers).where(eq(sessionAnswers.sessionId, sessionId));
  }

  async saveQuizResult(result: InsertQuizResult): Promise<QuizResult> {
    const [created] = await db.insert(quizResults).values(result).returning();
    return created;
  }

  async getResultsBySession(sessionId: string): Promise<QuizResult[]> {
    return db.select().from(quizResults).where(eq(quizResults.sessionId, sessionId)).orderBy(quizResults.rank);
  }

  async getResultsByUser(userId: string): Promise<QuizResult[]> {
    return db.select().from(quizResults).where(eq(quizResults.userId, userId)).orderBy(desc(quizResults.completedAt));
  }

  async getResultsByQuiz(quizId: string): Promise<QuizResult[]> {
    return db.select().from(quizResults).where(eq(quizResults.quizId, quizId)).orderBy(quizResults.rank);
  }

  async getDashboardStats() {
    const [usersCount] = await db.select({ count: sql<number>`count(*)` }).from(userProfiles);
    const [quizzesCount] = await db.select({ count: sql<number>`count(*)` }).from(quizzes);
    const [sessionsCount] = await db.select({ count: sql<number>`count(*)` }).from(liveSessions);
    const [playsSum] = await db.select({ total: sql<number>`coalesce(sum(${quizzes.totalPlays}), 0)` }).from(quizzes);
    return {
      totalUsers: Number(usersCount.count),
      totalQuizzes: Number(quizzesCount.count),
      totalSessions: Number(sessionsCount.count),
      totalPlays: Number(playsSum.total),
    };
  }

  async createAssignment(data: InsertAssignment): Promise<Assignment> {
    const [created] = await db.insert(assignments).values(data).returning();
    return created;
  }

  async getAssignment(id: string): Promise<Assignment | undefined> {
    const [a] = await db.select().from(assignments).where(eq(assignments.id, id));
    return a;
  }

  async getAssignmentsByCreator(creatorId: string): Promise<Assignment[]> {
    return db.select().from(assignments).where(eq(assignments.creatorId, creatorId)).orderBy(desc(assignments.createdAt));
  }

  async getAssignmentsByClass(classId: string): Promise<Assignment[]> {
    return db.select().from(assignments).where(eq(assignments.classId, classId)).orderBy(desc(assignments.createdAt));
  }

  async getAssignmentsByStudent(userId: string): Promise<Assignment[]> {
    return db.select().from(assignments).where(eq(assignments.status, "active")).orderBy(desc(assignments.createdAt));
  }

  async updateAssignment(id: string, data: Partial<InsertAssignment>): Promise<Assignment | undefined> {
    const [updated] = await db.update(assignments).set(data).where(eq(assignments.id, id)).returning();
    return updated;
  }

  async deleteAssignment(id: string): Promise<void> {
    await db.delete(assignmentAttempts).where(eq(assignmentAttempts.assignmentId, id));
    await db.delete(assignments).where(eq(assignments.id, id));
  }

  async createAssignmentAttempt(data: InsertAssignmentAttempt): Promise<AssignmentAttempt> {
    const [created] = await db.insert(assignmentAttempts).values(data as any).returning();
    return created;
  }

  async getAttemptsByAssignment(assignmentId: string): Promise<AssignmentAttempt[]> {
    return db.select().from(assignmentAttempts).where(eq(assignmentAttempts.assignmentId, assignmentId)).orderBy(desc(assignmentAttempts.completedAt));
  }

  async getAttemptsByUser(assignmentId: string, userId: string): Promise<AssignmentAttempt[]> {
    return db.select().from(assignmentAttempts).where(and(eq(assignmentAttempts.assignmentId, assignmentId), eq(assignmentAttempts.userId, userId))).orderBy(desc(assignmentAttempts.completedAt));
  }

  async createClass(data: InsertClass): Promise<ClassType> {
    const [created] = await db.insert(classes).values(data).returning();
    return created;
  }

  async getClass(id: string): Promise<ClassType | undefined> {
    const [c] = await db.select().from(classes).where(eq(classes.id, id));
    return c;
  }

  async getClassByCode(code: string): Promise<ClassType | undefined> {
    const [c] = await db.select().from(classes).where(eq(classes.joinCode, code));
    return c;
  }

  async getClassesByTeacher(teacherId: string): Promise<ClassType[]> {
    return db.select().from(classes).where(eq(classes.teacherId, teacherId)).orderBy(desc(classes.createdAt));
  }

  async getClassesByStudent(userId: string): Promise<ClassType[]> {
    const members = await db.select({ classId: classMembers.classId }).from(classMembers).where(eq(classMembers.userId, userId));
    if (members.length === 0) return [];
    const classIds = members.map(m => m.classId);
    return db.select().from(classes).where(inArray(classes.id, classIds)).orderBy(desc(classes.createdAt));
  }

  async addClassMember(data: InsertClassMember): Promise<ClassMember> {
    const [created] = await db.insert(classMembers).values(data).returning();
    return created;
  }

  async getClassMembers(classId: string): Promise<ClassMember[]> {
    return db.select().from(classMembers).where(eq(classMembers.classId, classId)).orderBy(classMembers.joinedAt);
  }

  async removeClassMember(classId: string, userId: string): Promise<void> {
    await db.delete(classMembers).where(and(eq(classMembers.classId, classId), eq(classMembers.userId, userId)));
  }

  async deleteClass(id: string): Promise<void> {
    await db.delete(classMembers).where(eq(classMembers.classId, id));
    await db.delete(classes).where(eq(classes.id, id));
  }

  async createBankQuestion(data: InsertQuestionBank): Promise<QuestionBankItem> {
    const [created] = await db.insert(questionBank).values(data as any).returning();
    return created;
  }

  async getBankQuestionsByCreator(creatorId: string): Promise<QuestionBankItem[]> {
    return db.select().from(questionBank).where(eq(questionBank.creatorId, creatorId)).orderBy(desc(questionBank.createdAt));
  }

  async getBankQuestion(id: string): Promise<QuestionBankItem | undefined> {
    const [q] = await db.select().from(questionBank).where(eq(questionBank.id, id));
    return q;
  }

  async updateBankQuestion(id: string, data: Partial<InsertQuestionBank>): Promise<QuestionBankItem | undefined> {
    const [updated] = await db.update(questionBank).set(data as any).where(eq(questionBank.id, id)).returning();
    return updated;
  }

  async deleteBankQuestion(id: string): Promise<void> {
    await db.delete(questionBank).where(eq(questionBank.id, id));
  }

  async toggleQuizLike(quizId: string, userId: string): Promise<{ liked: boolean }> {
    const [existing] = await db.select().from(quizLikes).where(and(eq(quizLikes.quizId, quizId), eq(quizLikes.userId, userId)));
    if (existing) {
      await db.delete(quizLikes).where(eq(quizLikes.id, existing.id));
      await db.update(quizzes).set({ totalLikes: sql`GREATEST(${quizzes.totalLikes} - 1, 0)` }).where(eq(quizzes.id, quizId));
      return { liked: false };
    } else {
      await db.insert(quizLikes).values({ quizId, userId });
      await db.update(quizzes).set({ totalLikes: sql`${quizzes.totalLikes} + 1` }).where(eq(quizzes.id, quizId));
      return { liked: true };
    }
  }

  async getQuizLikes(quizId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(quizLikes).where(eq(quizLikes.quizId, quizId));
    return Number(result.count);
  }

  async isQuizLiked(quizId: string, userId: string): Promise<boolean> {
    const [existing] = await db.select().from(quizLikes).where(and(eq(quizLikes.quizId, quizId), eq(quizLikes.userId, userId)));
    return !!existing;
  }

  async createLiveLesson(data: InsertLiveLesson): Promise<LiveLesson> {
    const [created] = await db.insert(liveLessons).values(data).returning();
    return created;
  }

  async getLiveLesson(id: string): Promise<LiveLesson | undefined> {
    const [lesson] = await db.select().from(liveLessons).where(eq(liveLessons.id, id));
    return lesson;
  }

  async getLiveLessonByCode(code: string): Promise<LiveLesson | undefined> {
    const [lesson] = await db.select().from(liveLessons).where(eq(liveLessons.joinCode, code));
    return lesson;
  }

  async getLiveLessonsByTeacher(teacherId: string): Promise<LiveLesson[]> {
    return db.select().from(liveLessons).where(eq(liveLessons.teacherId, teacherId)).orderBy(desc(liveLessons.createdAt));
  }

  async updateLiveLesson(id: string, data: Partial<LiveLesson>): Promise<LiveLesson | undefined> {
    const [updated] = await db.update(liveLessons).set(data).where(eq(liveLessons.id, id)).returning();
    return updated;
  }

  async deleteLiveLesson(id: string): Promise<void> {
    await db.delete(liveLessons).where(eq(liveLessons.id, id));
  }

  async createQuizCategory(data: { name: string; creatorId: string }): Promise<QuizCategory> {
    const [cat] = await db.insert(quizCategories).values(data).returning();
    return cat;
  }

  async getQuizCategoriesByCreator(creatorId: string): Promise<QuizCategory[]> {
    return db.select().from(quizCategories).where(eq(quizCategories.creatorId, creatorId)).orderBy(quizCategories.name);
  }

  async deleteQuizCategory(id: string): Promise<void> {
    await db.delete(quizCategories).where(eq(quizCategories.id, id));
  }

  async getAllQuizCategories(): Promise<QuizCategory[]> {
    return db.select().from(quizCategories).orderBy(quizCategories.name);
  }

  async createQuizFolder(data: InsertQuizFolder): Promise<QuizFolder> {
    const existing = await db.select().from(quizFolders).where(eq(quizFolders.creatorId, data.creatorId));
    const maxOrder = existing.reduce((max, f) => Math.max(max, f.sortOrder || 0), 0);
    const [folder] = await db.insert(quizFolders).values({ ...data, sortOrder: maxOrder + 1 }).returning();
    return folder;
  }

  async getQuizFoldersByCreator(creatorId: string): Promise<QuizFolder[]> {
    return db.select().from(quizFolders).where(eq(quizFolders.creatorId, creatorId)).orderBy(quizFolders.sortOrder);
  }

  async deleteQuizFolder(id: string): Promise<void> {
    await db.update(quizzes).set({ folderId: null, orderInFolder: 0 } as any).where(eq(quizzes.folderId, id));
    await db.delete(quizFolders).where(eq(quizFolders.id, id));
  }

  async updateQuizFolderOrder(id: string, sortOrder: number): Promise<void> {
    await db.update(quizFolders).set({ sortOrder }).where(eq(quizFolders.id, id));
  }

  async updateQuizOrderInFolder(quizId: string, orderInFolder: number): Promise<void> {
    await db.update(quizzes).set({ orderInFolder } as any).where(eq(quizzes.id, quizId));
  }

  async createSharedQuiz(data: InsertSharedQuiz): Promise<SharedQuiz> {
    const [created] = await db.insert(sharedQuizzes).values(data as any).returning();
    return created;
  }

  async getSharedQuizByCode(code: string): Promise<SharedQuiz | undefined> {
    const [sq] = await db.select().from(sharedQuizzes).where(eq(sharedQuizzes.code, code));
    return sq;
  }

  async getSharedQuizzesByCreator(creatorId: string): Promise<SharedQuiz[]> {
    return db.select().from(sharedQuizzes).where(eq(sharedQuizzes.creatorId, creatorId)).orderBy(desc(sharedQuizzes.createdAt));
  }

  async getSharedQuizzesByQuizId(quizId: string): Promise<SharedQuiz[]> {
    return db.select().from(sharedQuizzes).where(eq(sharedQuizzes.quizId, quizId)).orderBy(desc(sharedQuizzes.createdAt));
  }

  async updateSharedQuiz(id: string, data: Partial<SharedQuiz>): Promise<SharedQuiz | undefined> {
    const [updated] = await db.update(sharedQuizzes).set(data as any).where(eq(sharedQuizzes.id, id)).returning();
    return updated;
  }

  async createSharedQuizAttempt(data: InsertSharedQuizAttempt): Promise<SharedQuizAttempt> {
    const [created] = await db.insert(sharedQuizAttempts).values(data as any).returning();
    return created;
  }

  async updateSharedQuizAttempt(id: string, data: Partial<SharedQuizAttempt>): Promise<SharedQuizAttempt | undefined> {
    const [updated] = await db.update(sharedQuizAttempts).set(data as any).where(eq(sharedQuizAttempts.id, id)).returning();
    return updated;
  }

  async getSharedQuizAttempts(sharedQuizId: string): Promise<SharedQuizAttempt[]> {
    return db.select().from(sharedQuizAttempts).where(eq(sharedQuizAttempts.sharedQuizId, sharedQuizId)).orderBy(desc(sharedQuizAttempts.completedAt));
  }

  async getSharedQuizAttempt(id: string): Promise<SharedQuizAttempt | undefined> {
    const [attempt] = await db.select().from(sharedQuizAttempts).where(eq(sharedQuizAttempts.id, id));
    return attempt;
  }
}

export const storage = new DatabaseStorage();
