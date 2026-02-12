import {
  type UserProfile, type InsertUserProfile,
  type Quiz, type InsertQuiz,
  type Question, type InsertQuestion,
  type LiveSession, type InsertLiveSession,
  type SessionParticipant, type InsertSessionParticipant,
  type SessionAnswer, type InsertSessionAnswer,
  type QuizResult, type InsertQuizResult,
  userProfiles, quizzes, questions, liveSessions,
  sessionParticipants, sessionAnswers, quizResults,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, ilike } from "drizzle-orm";

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

  getDashboardStats(): Promise<{ totalUsers: number; totalQuizzes: number; totalSessions: number; totalPlays: number }>;
}

export class DatabaseStorage implements IStorage {
  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return profile;
  }

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const [created] = await db.insert(userProfiles).values(profile).returning();
    return created;
  }

  async updateUserProfile(userId: string, data: Partial<InsertUserProfile>): Promise<UserProfile | undefined> {
    const [updated] = await db.update(userProfiles).set(data).where(eq(userProfiles.userId, userId)).returning();
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
}

export const storage = new DatabaseStorage();
