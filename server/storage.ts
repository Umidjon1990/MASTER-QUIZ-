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
  type ClassLesson, type InsertClassLesson,
  type TaskColumn, type InsertTaskColumn,
  type LessonTask, type InsertLessonTask,
  type TaskSubmission, type InsertTaskSubmission,
  type ClassAssistant, type InsertClassAssistant,
  type AiClass, type InsertAiClass,
  type AiClassTask, type InsertAiClassTask,
  type AiStudent, type InsertAiStudent,
  type AiSubmission, type InsertAiSubmission,
  userProfiles, quizzes, questions, liveSessions,
  sessionParticipants, sessionAnswers, quizResults,
  assignments, assignmentAttempts, classes, classMembers, questionBank, quizLikes,
  liveLessons, quizCategories, quizFolders, sharedQuizzes, sharedQuizAttempts,
  classLessons, taskColumns, lessonTasks, taskSubmissions, classAssistants,
  aiClasses, aiClassTasks, aiStudents, aiSubmissions,
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
  deleteResult(id: string): Promise<void>;

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
  deleteSharedQuizAttempt(id: string): Promise<void>;

  createClassLesson(data: InsertClassLesson): Promise<ClassLesson>;
  getClassLesson(id: string): Promise<ClassLesson | undefined>;
  getLessonsByClass(classId: string): Promise<ClassLesson[]>;
  updateClassLesson(id: string, data: Partial<InsertClassLesson>): Promise<ClassLesson | undefined>;
  deleteClassLesson(id: string): Promise<void>;
  generateLessonsForClass(classId: string, startDate: Date, scheduleType: string, scheduleDays: string[], totalLessons: number): Promise<ClassLesson[]>;

  createTaskColumn(data: InsertTaskColumn): Promise<TaskColumn>;
  getTaskColumnsByClass(classId: string): Promise<TaskColumn[]>;
  updateTaskColumn(id: string, data: Partial<InsertTaskColumn>): Promise<TaskColumn | undefined>;
  deleteTaskColumn(id: string): Promise<void>;

  createLessonTask(data: InsertLessonTask): Promise<LessonTask>;
  getLessonTasksByClass(classId: string): Promise<LessonTask[]>;
  deleteLessonTask(id: string): Promise<void>;

  createOrUpdateSubmission(data: InsertTaskSubmission): Promise<TaskSubmission>;
  getSubmissionsByClass(classId: string): Promise<TaskSubmission[]>;
  getDebtors(classId: string): Promise<{ studentId: string; lessonTaskId: string; taskTitle: string; lessonNo: number; dueDate: Date | null }[]>;

  createClassAssistant(data: InsertClassAssistant): Promise<ClassAssistant>;
  getClassAssistants(classId: string): Promise<ClassAssistant[]>;
  getClassAssistantByCode(code: string): Promise<ClassAssistant | undefined>;
  getClassAssistantByUserId(classId: string, userId: string): Promise<ClassAssistant | undefined>;
  updateClassAssistant(id: string, data: Partial<InsertClassAssistant>): Promise<ClassAssistant | undefined>;
  deleteClassAssistant(id: string): Promise<void>;
  getAssistantClasses(userId: string): Promise<ClassAssistant[]>;

  createAiClass(data: InsertAiClass): Promise<AiClass>;
  getAiClasses(teacherId: string): Promise<AiClass[]>;
  getAllActiveAiClasses(): Promise<AiClass[]>;
  getAiClass(id: string): Promise<AiClass | undefined>;
  updateAiClass(id: string, data: Partial<InsertAiClass>): Promise<AiClass | undefined>;
  deleteAiClass(id: string): Promise<void>;

  createAiTask(data: InsertAiClassTask): Promise<AiClassTask>;
  getAiTasks(aiClassId: string): Promise<AiClassTask[]>;
  updateAiTask(id: string, data: Partial<InsertAiClassTask>): Promise<AiClassTask | undefined>;
  deleteAiTask(id: string): Promise<void>;

  createAiStudent(data: InsertAiStudent): Promise<AiStudent>;
  getAiStudents(aiClassId: string): Promise<AiStudent[]>;
  getAiStudentByPhone(aiClassId: string, phone: string): Promise<AiStudent | undefined>;
  getAiStudentByTelegramChatId(chatId: string): Promise<AiStudent | undefined>;
  updateAiStudent(id: string, data: Partial<InsertAiStudent>): Promise<AiStudent | undefined>;
  deleteAiStudent(id: string): Promise<void>;

  createAiSubmission(data: InsertAiSubmission): Promise<AiSubmission>;
  getAiSubmissions(aiStudentId: string): Promise<AiSubmission[]>;
  getAiSubmissionsByClass(aiClassId: string): Promise<AiSubmission[]>;
  getAiSubmissionByStudentAndTask(aiStudentId: string, aiTaskId: string): Promise<AiSubmission | undefined>;
  updateAiSubmission(id: string, data: Partial<InsertAiSubmission>): Promise<AiSubmission | undefined>;
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

  async deleteResult(id: string): Promise<void> {
    await db.delete(quizResults).where(eq(quizResults.id, id));
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

  async deleteSharedQuizAttempt(id: string): Promise<void> {
    await db.delete(sharedQuizAttempts).where(eq(sharedQuizAttempts.id, id));
  }

  async createClassLesson(data: InsertClassLesson): Promise<ClassLesson> {
    const [created] = await db.insert(classLessons).values(data as any).returning();
    return created;
  }

  async getClassLesson(id: string): Promise<ClassLesson | undefined> {
    const [lesson] = await db.select().from(classLessons).where(eq(classLessons.id, id));
    return lesson;
  }

  async getLessonsByClass(classId: string): Promise<ClassLesson[]> {
    return db.select().from(classLessons).where(eq(classLessons.classId, classId)).orderBy(classLessons.lessonNo);
  }

  async updateClassLesson(id: string, data: Partial<InsertClassLesson>): Promise<ClassLesson | undefined> {
    const [updated] = await db.update(classLessons).set(data as any).where(eq(classLessons.id, id)).returning();
    return updated;
  }

  async deleteClassLesson(id: string): Promise<void> {
    await db.delete(taskSubmissions).where(
      inArray(taskSubmissions.lessonTaskId, db.select({ id: lessonTasks.id }).from(lessonTasks).where(eq(lessonTasks.lessonId, id)))
    );
    await db.delete(lessonTasks).where(eq(lessonTasks.lessonId, id));
    await db.delete(classLessons).where(eq(classLessons.id, id));
  }

  async generateLessonsForClass(classId: string, startDate: Date, scheduleType: string, scheduleDays: string[], totalLessons: number): Promise<ClassLesson[]> {
    const dayMap: Record<string, number> = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
    const created: ClassLesson[] = [];
    let currentDate = new Date(startDate);
    let lessonCount = 0;

    if (scheduleType === "every_other_day") {
      while (lessonCount < totalLessons) {
        lessonCount++;
        const [lesson] = await db.insert(classLessons).values({
          classId,
          lessonNo: lessonCount,
          date: new Date(currentDate),
          title: `Dars ${lessonCount}`,
        } as any).returning();
        created.push(lesson);
        currentDate.setDate(currentDate.getDate() + 2);
      }
    } else {
      const targetDays = scheduleDays.map(d => dayMap[d.toLowerCase()]).filter(d => d !== undefined);
      if (targetDays.length === 0) return created;
      while (lessonCount < totalLessons) {
        const dayOfWeek = currentDate.getDay();
        if (targetDays.includes(dayOfWeek)) {
          lessonCount++;
          const [lesson] = await db.insert(classLessons).values({
            classId,
            lessonNo: lessonCount,
            date: new Date(currentDate),
            title: `Dars ${lessonCount}`,
          } as any).returning();
          created.push(lesson);
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    return created;
  }

  async createTaskColumn(data: InsertTaskColumn): Promise<TaskColumn> {
    const [created] = await db.insert(taskColumns).values(data as any).returning();
    return created;
  }

  async getTaskColumnsByClass(classId: string): Promise<TaskColumn[]> {
    return db.select().from(taskColumns).where(eq(taskColumns.classId, classId)).orderBy(taskColumns.sortOrder);
  }

  async updateTaskColumn(id: string, data: Partial<InsertTaskColumn>): Promise<TaskColumn | undefined> {
    const [updated] = await db.update(taskColumns).set(data as any).where(eq(taskColumns.id, id)).returning();
    return updated;
  }

  async deleteTaskColumn(id: string): Promise<void> {
    const tasks = await db.select().from(lessonTasks).where(eq(lessonTasks.taskColumnId, id));
    for (const t of tasks) {
      await db.delete(taskSubmissions).where(eq(taskSubmissions.lessonTaskId, t.id));
    }
    await db.delete(lessonTasks).where(eq(lessonTasks.taskColumnId, id));
    await db.delete(taskColumns).where(eq(taskColumns.id, id));
  }

  async createLessonTask(data: InsertLessonTask): Promise<LessonTask> {
    const [created] = await db.insert(lessonTasks).values(data as any).returning();
    return created;
  }

  async getLessonTasksByClass(classId: string): Promise<LessonTask[]> {
    const lessons = await this.getLessonsByClass(classId);
    if (lessons.length === 0) return [];
    const lessonIds = lessons.map(l => l.id);
    return db.select().from(lessonTasks).where(inArray(lessonTasks.lessonId, lessonIds));
  }

  async deleteLessonTask(id: string): Promise<void> {
    await db.delete(taskSubmissions).where(eq(taskSubmissions.lessonTaskId, id));
    await db.delete(lessonTasks).where(eq(lessonTasks.id, id));
  }

  async createOrUpdateSubmission(data: InsertTaskSubmission): Promise<TaskSubmission> {
    const existing = await db.select().from(taskSubmissions)
      .where(and(eq(taskSubmissions.studentId, data.studentId), eq(taskSubmissions.lessonTaskId, data.lessonTaskId)));
    if (existing.length > 0) {
      const [updated] = await db.update(taskSubmissions)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(eq(taskSubmissions.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(taskSubmissions).values({ ...data, updatedAt: new Date() } as any).returning();
    return created;
  }

  async getSubmissionsByClass(classId: string): Promise<TaskSubmission[]> {
    const allLessonTasks = await this.getLessonTasksByClass(classId);
    if (allLessonTasks.length === 0) return [];
    const ltIds = allLessonTasks.map(lt => lt.id);
    return db.select().from(taskSubmissions).where(inArray(taskSubmissions.lessonTaskId, ltIds));
  }

  async getDebtors(classId: string): Promise<{ studentId: string; lessonTaskId: string; taskTitle: string; lessonNo: number; dueDate: Date | null }[]> {
    const lessons = await this.getLessonsByClass(classId);
    const allLessonTasks = await this.getLessonTasksByClass(classId);
    const columns = await this.getTaskColumnsByClass(classId);
    const submissions = await this.getSubmissionsByClass(classId);
    const members = await this.getClassMembers(classId);
    const now = new Date();

    const submissionMap = new Map<string, TaskSubmission>();
    for (const s of submissions) {
      submissionMap.set(`${s.studentId}_${s.lessonTaskId}`, s);
    }

    const columnMap = new Map(columns.map(c => [c.id, c.title]));
    const lessonMap = new Map(lessons.map(l => [l.id, l.lessonNo]));

    const debtors: { studentId: string; lessonTaskId: string; taskTitle: string; lessonNo: number; dueDate: Date | null }[] = [];

    for (const lt of allLessonTasks) {
      const dueDate = lt.dueDate;
      if (dueDate && new Date(dueDate) > now) continue;

      for (const member of members) {
        const key = `${member.userId}_${lt.id}`;
        const sub = submissionMap.get(key);
        if (!sub || sub.status !== "submitted") {
          debtors.push({
            studentId: member.userId,
            lessonTaskId: lt.id,
            taskTitle: columnMap.get(lt.taskColumnId) || "Vazifa",
            lessonNo: lessonMap.get(lt.lessonId) || 0,
            dueDate: dueDate,
          });
        }
      }
    }

    return debtors;
  }

  async createClassAssistant(data: InsertClassAssistant): Promise<ClassAssistant> {
    const [created] = await db.insert(classAssistants).values(data as any).returning();
    return created;
  }

  async getClassAssistants(classId: string): Promise<ClassAssistant[]> {
    return db.select().from(classAssistants).where(eq(classAssistants.classId, classId));
  }

  async getClassAssistantByCode(code: string): Promise<ClassAssistant | undefined> {
    const [found] = await db.select().from(classAssistants).where(eq(classAssistants.inviteCode, code));
    return found;
  }

  async getClassAssistantByUserId(classId: string, userId: string): Promise<ClassAssistant | undefined> {
    const [found] = await db.select().from(classAssistants)
      .where(and(eq(classAssistants.classId, classId), eq(classAssistants.userId, userId)));
    return found;
  }

  async updateClassAssistant(id: string, data: Partial<InsertClassAssistant>): Promise<ClassAssistant | undefined> {
    const [updated] = await db.update(classAssistants).set(data as any).where(eq(classAssistants.id, id)).returning();
    return updated;
  }

  async deleteClassAssistant(id: string): Promise<void> {
    await db.delete(classAssistants).where(eq(classAssistants.id, id));
  }

  async getAssistantClasses(userId: string): Promise<ClassAssistant[]> {
    return db.select().from(classAssistants)
      .where(and(eq(classAssistants.userId, userId), eq(classAssistants.status, "active")));
  }

  async createAiClass(data: InsertAiClass): Promise<AiClass> {
    const [created] = await db.insert(aiClasses).values(data as any).returning();
    return created;
  }

  async getAiClasses(teacherId: string): Promise<AiClass[]> {
    return db.select().from(aiClasses).where(eq(aiClasses.teacherId, teacherId)).orderBy(desc(aiClasses.createdAt));
  }

  async getAllActiveAiClasses(): Promise<AiClass[]> {
    return db.select().from(aiClasses).where(eq(aiClasses.status, "active"));
  }

  async getAiClass(id: string): Promise<AiClass | undefined> {
    const [found] = await db.select().from(aiClasses).where(eq(aiClasses.id, id));
    return found;
  }

  async updateAiClass(id: string, data: Partial<InsertAiClass>): Promise<AiClass | undefined> {
    const [updated] = await db.update(aiClasses).set(data as any).where(eq(aiClasses.id, id)).returning();
    return updated;
  }

  async deleteAiClass(id: string): Promise<void> {
    await db.delete(aiSubmissions).where(
      inArray(aiSubmissions.aiStudentId, db.select({ id: aiStudents.id }).from(aiStudents).where(eq(aiStudents.aiClassId, id)))
    );
    await db.delete(aiStudents).where(eq(aiStudents.aiClassId, id));
    await db.delete(aiClassTasks).where(eq(aiClassTasks.aiClassId, id));
    await db.delete(aiClasses).where(eq(aiClasses.id, id));
  }

  async createAiTask(data: InsertAiClassTask): Promise<AiClassTask> {
    const [created] = await db.insert(aiClassTasks).values(data as any).returning();
    return created;
  }

  async getAiTasks(aiClassId: string): Promise<AiClassTask[]> {
    return db.select().from(aiClassTasks).where(eq(aiClassTasks.aiClassId, aiClassId)).orderBy(aiClassTasks.orderIndex);
  }

  async updateAiTask(id: string, data: Partial<InsertAiClassTask>): Promise<AiClassTask | undefined> {
    const [updated] = await db.update(aiClassTasks).set(data as any).where(eq(aiClassTasks.id, id)).returning();
    return updated;
  }

  async deleteAiTask(id: string): Promise<void> {
    await db.delete(aiSubmissions).where(eq(aiSubmissions.aiTaskId, id));
    await db.delete(aiClassTasks).where(eq(aiClassTasks.id, id));
  }

  async createAiStudent(data: InsertAiStudent): Promise<AiStudent> {
    const [created] = await db.insert(aiStudents).values(data as any).returning();
    return created;
  }

  async getAiStudents(aiClassId: string): Promise<AiStudent[]> {
    return db.select().from(aiStudents).where(eq(aiStudents.aiClassId, aiClassId)).orderBy(aiStudents.createdAt);
  }

  async getAiStudentByPhone(aiClassId: string, phone: string): Promise<AiStudent | undefined> {
    const [found] = await db.select().from(aiStudents)
      .where(and(eq(aiStudents.aiClassId, aiClassId), eq(aiStudents.phone, phone)));
    return found;
  }

  async getAiStudentByTelegramChatId(chatId: string): Promise<AiStudent | undefined> {
    const [found] = await db.select().from(aiStudents).where(eq(aiStudents.telegramChatId, chatId));
    return found;
  }

  async updateAiStudent(id: string, data: Partial<InsertAiStudent>): Promise<AiStudent | undefined> {
    const [updated] = await db.update(aiStudents).set(data as any).where(eq(aiStudents.id, id)).returning();
    return updated;
  }

  async deleteAiStudent(id: string): Promise<void> {
    await db.delete(aiSubmissions).where(eq(aiSubmissions.aiStudentId, id));
    await db.delete(aiStudents).where(eq(aiStudents.id, id));
  }

  async createAiSubmission(data: InsertAiSubmission): Promise<AiSubmission> {
    const [created] = await db.insert(aiSubmissions).values(data as any).returning();
    return created;
  }

  async getAiSubmissions(aiStudentId: string): Promise<AiSubmission[]> {
    return db.select().from(aiSubmissions).where(eq(aiSubmissions.aiStudentId, aiStudentId)).orderBy(desc(aiSubmissions.submittedAt));
  }

  async getAiSubmissionsByClass(aiClassId: string): Promise<AiSubmission[]> {
    return db.select().from(aiSubmissions)
      .where(inArray(aiSubmissions.aiStudentId, db.select({ id: aiStudents.id }).from(aiStudents).where(eq(aiStudents.aiClassId, aiClassId))))
      .orderBy(desc(aiSubmissions.submittedAt));
  }

  async getAiSubmissionByStudentAndTask(aiStudentId: string, aiTaskId: string): Promise<AiSubmission | undefined> {
    const [found] = await db.select().from(aiSubmissions)
      .where(and(eq(aiSubmissions.aiStudentId, aiStudentId), eq(aiSubmissions.aiTaskId, aiTaskId)))
      .orderBy(desc(aiSubmissions.submittedAt))
      .limit(1);
    return found;
  }

  async updateAiSubmission(id: string, data: Partial<InsertAiSubmission>): Promise<AiSubmission | undefined> {
    const [updated] = await db.update(aiSubmissions).set(data as any).where(eq(aiSubmissions.id, id)).returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
