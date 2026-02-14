import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export { users, sessions } from "./models/auth";
export type { User, UpsertUser } from "./models/auth";

export type TelegramChat = {
  chatId: string;
  title: string;
  type: "group" | "supergroup" | "channel";
  username?: string;
};

export const userProfiles = pgTable("user_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  role: varchar("role", { length: 20 }).notNull().default("student"),
  displayName: varchar("display_name"),
  plan: varchar("plan", { length: 20 }).notNull().default("free"),
  quizLimit: integer("quiz_limit").notNull().default(5),
  bio: text("bio"),
  telegramBotToken: text("telegram_bot_token"),
  telegramChatId: text("telegram_chat_id"),
  telegramChats: jsonb("telegram_chats").$type<TelegramChat[]>().default([]),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const quizzes = pgTable("quizzes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  coverImage: text("cover_image"),
  isPublic: boolean("is_public").notNull().default(false),
  creatorId: varchar("creator_id").notNull(),
  timerEnabled: boolean("timer_enabled").notNull().default(true),
  timePerQuestion: integer("time_per_question").notNull().default(30),
  shuffleQuestions: boolean("shuffle_questions").notNull().default(false),
  shuffleOptions: boolean("shuffle_options").notNull().default(false),
  totalQuestions: integer("total_questions").notNull().default(0),
  totalPlays: integer("total_plays").notNull().default(0),
  totalLikes: integer("total_likes").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const assignments = pgTable("assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quizId: varchar("quiz_id").notNull(),
  creatorId: varchar("creator_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  classId: varchar("class_id"),
  deadline: timestamp("deadline"),
  attemptsLimit: integer("attempts_limit").notNull().default(1),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const assignmentAttempts = pgTable("assignment_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assignmentId: varchar("assignment_id").notNull(),
  userId: varchar("user_id").notNull(),
  score: integer("score").notNull().default(0),
  correctAnswers: integer("correct_answers").notNull().default(0),
  totalQuestions: integer("total_questions").notNull().default(0),
  answers: jsonb("answers").$type<Record<string, { answer: string | string[]; isCorrect: boolean; points: number }>>(),
  completedAt: timestamp("completed_at").defaultNow(),
});

export const classes = pgTable("classes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  teacherId: varchar("teacher_id").notNull(),
  joinCode: varchar("join_code", { length: 8 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const classMembers = pgTable("class_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  classId: varchar("class_id").notNull(),
  userId: varchar("user_id").notNull(),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const quizLikes = pgTable("quiz_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quizId: varchar("quiz_id").notNull(),
  userId: varchar("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const questionBank = pgTable("question_bank", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id").notNull(),
  category: varchar("category", { length: 100 }),
  tags: text("tags"),
  type: varchar("type", { length: 30 }).notNull().default("multiple_choice"),
  questionText: text("question_text").notNull(),
  options: jsonb("options").$type<string[]>(),
  correctAnswer: text("correct_answer").notNull(),
  points: integer("points").notNull().default(100),
  timeLimit: integer("time_limit").notNull().default(30),
  createdAt: timestamp("created_at").defaultNow(),
});

export const questions = pgTable("questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quizId: varchar("quiz_id").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  type: varchar("type", { length: 30 }).notNull().default("multiple_choice"),
  questionText: text("question_text").notNull(),
  mediaType: varchar("media_type", { length: 20 }),
  mediaUrl: text("media_url"),
  options: jsonb("options").$type<string[]>(),
  correctAnswer: text("correct_answer").notNull(),
  points: integer("points").notNull().default(100),
  timeLimit: integer("time_limit").notNull().default(30),
});

export const liveSessions = pgTable("live_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quizId: varchar("quiz_id").notNull(),
  hostId: varchar("host_id").notNull(),
  joinCode: varchar("join_code", { length: 6 }).notNull().unique(),
  password: varchar("password", { length: 100 }),
  status: varchar("status", { length: 20 }).notNull().default("waiting"),
  currentQuestionIndex: integer("current_question_index").notNull().default(-1),
  participantCount: integer("participant_count").notNull().default(0),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessionParticipants = pgTable("session_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  userId: varchar("user_id"),
  guestName: varchar("guest_name", { length: 100 }),
  score: integer("score").notNull().default(0),
  correctAnswers: integer("correct_answers").notNull().default(0),
  totalAnswered: integer("total_answered").notNull().default(0),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const sessionAnswers = pgTable("session_answers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  participantId: varchar("participant_id").notNull(),
  questionId: varchar("question_id").notNull(),
  answer: text("answer"),
  isCorrect: boolean("is_correct").notNull().default(false),
  points: integer("points").notNull().default(0),
  timeSpent: integer("time_spent").notNull().default(0),
  answeredAt: timestamp("answered_at").defaultNow(),
});

export const quizResults = pgTable("quiz_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  quizId: varchar("quiz_id").notNull(),
  participantId: varchar("participant_id").notNull(),
  userId: varchar("user_id"),
  guestName: varchar("guest_name"),
  totalScore: integer("total_score").notNull().default(0),
  correctAnswers: integer("correct_answers").notNull().default(0),
  totalQuestions: integer("total_questions").notNull().default(0),
  rank: integer("rank"),
  completedAt: timestamp("completed_at").defaultNow(),
});

export const liveLessons = pgTable("live_lessons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teacherId: varchar("teacher_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  pdfUrl: text("pdf_url").notNull(),
  pdfFileName: varchar("pdf_file_name", { length: 255 }),
  joinCode: varchar("join_code", { length: 6 }).notNull().unique(),
  requireCode: boolean("require_code").notNull().default(true),
  status: varchar("status", { length: 20 }).notNull().default("waiting"),
  currentPage: integer("current_page").notNull().default(1),
  totalPages: integer("total_pages").notNull().default(0),
  participantCount: integer("participant_count").notNull().default(0),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({ id: true, createdAt: true });
export const insertQuizSchema = createInsertSchema(quizzes).omit({ id: true, createdAt: true, updatedAt: true, totalQuestions: true, totalPlays: true, totalLikes: true });
export const insertQuestionSchema = createInsertSchema(questions).omit({ id: true });
export const insertLiveSessionSchema = createInsertSchema(liveSessions).omit({ id: true, createdAt: true, participantCount: true, currentQuestionIndex: true });
export const insertSessionParticipantSchema = createInsertSchema(sessionParticipants).omit({ id: true, joinedAt: true, score: true, correctAnswers: true, totalAnswered: true });
export const insertSessionAnswerSchema = createInsertSchema(sessionAnswers).omit({ id: true, answeredAt: true });
export const insertQuizResultSchema = createInsertSchema(quizResults).omit({ id: true, completedAt: true });
export const insertAssignmentSchema = createInsertSchema(assignments).omit({ id: true, createdAt: true });
export const insertAssignmentAttemptSchema = createInsertSchema(assignmentAttempts).omit({ id: true, completedAt: true });
export const insertClassSchema = createInsertSchema(classes).omit({ id: true, createdAt: true });
export const insertClassMemberSchema = createInsertSchema(classMembers).omit({ id: true, joinedAt: true });
export const insertQuestionBankSchema = createInsertSchema(questionBank).omit({ id: true, createdAt: true });
export const insertQuizLikeSchema = createInsertSchema(quizLikes).omit({ id: true, createdAt: true });
export const insertLiveLessonSchema = createInsertSchema(liveLessons).omit({ id: true, createdAt: true, participantCount: true, currentPage: true });

export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertQuiz = z.infer<typeof insertQuizSchema>;
export type Quiz = typeof quizzes.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questions.$inferSelect;
export type InsertLiveSession = z.infer<typeof insertLiveSessionSchema>;
export type LiveSession = typeof liveSessions.$inferSelect;
export type InsertSessionParticipant = z.infer<typeof insertSessionParticipantSchema>;
export type SessionParticipant = typeof sessionParticipants.$inferSelect;
export type InsertSessionAnswer = z.infer<typeof insertSessionAnswerSchema>;
export type SessionAnswer = typeof sessionAnswers.$inferSelect;
export type InsertQuizResult = z.infer<typeof insertQuizResultSchema>;
export type QuizResult = typeof quizResults.$inferSelect;
export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;
export type Assignment = typeof assignments.$inferSelect;
export type InsertAssignmentAttempt = z.infer<typeof insertAssignmentAttemptSchema>;
export type AssignmentAttempt = typeof assignmentAttempts.$inferSelect;
export type InsertClass = z.infer<typeof insertClassSchema>;
export type Class = typeof classes.$inferSelect;
export type InsertClassMember = z.infer<typeof insertClassMemberSchema>;
export type ClassMember = typeof classMembers.$inferSelect;
export type InsertQuestionBank = z.infer<typeof insertQuestionBankSchema>;
export type QuestionBankItem = typeof questionBank.$inferSelect;
export type InsertQuizLike = z.infer<typeof insertQuizLikeSchema>;
export type QuizLike = typeof quizLikes.$inferSelect;
export type InsertLiveLesson = z.infer<typeof insertLiveLessonSchema>;
export type LiveLesson = typeof liveLessons.$inferSelect;
