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

export const quizCategories = pgTable("quiz_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  creatorId: varchar("creator_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type QuizCategory = typeof quizCategories.$inferSelect;

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
  showCorrectAnswers: boolean("show_correct_answers").notNull().default(true),
  totalQuestions: integer("total_questions").notNull().default(0),
  totalPlays: integer("total_plays").notNull().default(0),
  totalLikes: integer("total_likes").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at"),
  scheduledStatus: varchar("scheduled_status", { length: 20 }),
  scheduledCode: varchar("scheduled_code", { length: 10 }),
  scheduledRoomCode: varchar("scheduled_room_code", { length: 10 }),
  scheduledRequireCode: boolean("scheduled_require_code").notNull().default(true),
  scheduledTelegramChatId: varchar("scheduled_telegram_chat_id", { length: 100 }),
  scheduledTelegramQuizChatId: varchar("scheduled_telegram_quiz_chat_id", { length: 100 }),
  practiceMode: boolean("practice_mode").notNull().default(false),
  allowReplay: boolean("allow_replay").notNull().default(false),
  folderId: varchar("folder_id"),
  orderInFolder: integer("order_in_folder").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const quizFolders = pgTable("quiz_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  creatorId: varchar("creator_id").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
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
  level: varchar("level", { length: 20 }),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  scheduleType: varchar("schedule_type", { length: 20 }),
  scheduleDays: jsonb("schedule_days").$type<string[]>(),
  totalLessons: integer("total_lessons"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const classMembers = pgTable("class_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  classId: varchar("class_id").notNull(),
  userId: varchar("user_id").notNull(),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const classLessons = pgTable("class_lessons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  classId: varchar("class_id").notNull(),
  lessonNo: integer("lesson_no").notNull(),
  date: timestamp("date").notNull(),
  title: varchar("title", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const taskColumns = pgTable("task_columns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  classId: varchar("class_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const lessonTasks = pgTable("lesson_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lessonId: varchar("lesson_id").notNull(),
  taskColumnId: varchar("task_column_id").notNull(),
  dueDate: timestamp("due_date"),
});

export const taskSubmissions = pgTable("task_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").notNull(),
  lessonTaskId: varchar("lesson_task_id").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  score: integer("score"),
  feedback: text("feedback"),
  updatedAt: timestamp("updated_at").defaultNow(),
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
  lessonType: varchar("lesson_type", { length: 20 }).notNull().default("pdf"),
  pdfUrl: text("pdf_url"),
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
export const insertClassLessonSchema = createInsertSchema(classLessons).omit({ id: true, createdAt: true });
export const insertTaskColumnSchema = createInsertSchema(taskColumns).omit({ id: true, createdAt: true });
export const insertLessonTaskSchema = createInsertSchema(lessonTasks).omit({ id: true });
export const insertTaskSubmissionSchema = createInsertSchema(taskSubmissions).omit({ id: true, updatedAt: true });
export const insertQuestionBankSchema = createInsertSchema(questionBank).omit({ id: true, createdAt: true });
export const insertQuizLikeSchema = createInsertSchema(quizLikes).omit({ id: true, createdAt: true });
export const insertLiveLessonSchema = createInsertSchema(liveLessons).omit({ id: true, createdAt: true, participantCount: true, currentPage: true });
export const insertQuizFolderSchema = createInsertSchema(quizFolders).omit({ id: true, createdAt: true });

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
export type InsertClassLesson = z.infer<typeof insertClassLessonSchema>;
export type ClassLesson = typeof classLessons.$inferSelect;
export type InsertTaskColumn = z.infer<typeof insertTaskColumnSchema>;
export type TaskColumn = typeof taskColumns.$inferSelect;
export type InsertLessonTask = z.infer<typeof insertLessonTaskSchema>;
export type LessonTask = typeof lessonTasks.$inferSelect;
export type InsertTaskSubmission = z.infer<typeof insertTaskSubmissionSchema>;
export type TaskSubmission = typeof taskSubmissions.$inferSelect;
export type InsertQuestionBank = z.infer<typeof insertQuestionBankSchema>;
export type QuestionBankItem = typeof questionBank.$inferSelect;
export type InsertQuizLike = z.infer<typeof insertQuizLikeSchema>;
export type QuizLike = typeof quizLikes.$inferSelect;
export type InsertLiveLesson = z.infer<typeof insertLiveLessonSchema>;
export type LiveLesson = typeof liveLessons.$inferSelect;
export type InsertQuizFolder = z.infer<typeof insertQuizFolderSchema>;
export type QuizFolder = typeof quizFolders.$inferSelect;

export const sharedQuizzes = pgTable("shared_quizzes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quizId: varchar("quiz_id").notNull(),
  creatorId: varchar("creator_id").notNull(),
  code: varchar("code", { length: 10 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sharedQuizAttempts = pgTable("shared_quiz_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sharedQuizId: varchar("shared_quiz_id").notNull(),
  playerName: varchar("player_name", { length: 100 }).notNull(),
  score: integer("score").notNull().default(0),
  correctAnswers: integer("correct_answers").notNull().default(0),
  totalQuestions: integer("total_questions").notNull().default(0),
  answers: jsonb("answers").$type<Record<string, { answer: string | string[]; isCorrect: boolean; points: number; timeSpent: number }>>(),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertSharedQuizSchema = createInsertSchema(sharedQuizzes).omit({ id: true, createdAt: true });
export const insertSharedQuizAttemptSchema = createInsertSchema(sharedQuizAttempts).omit({ id: true, startedAt: true });

export type InsertSharedQuiz = z.infer<typeof insertSharedQuizSchema>;
export type SharedQuiz = typeof sharedQuizzes.$inferSelect;
export type InsertSharedQuizAttempt = z.infer<typeof insertSharedQuizAttemptSchema>;
export type SharedQuizAttempt = typeof sharedQuizAttempts.$inferSelect;

export const activeGames = pgTable("active_games", {
  id: varchar("id").primaryKey(),
  quizId: varchar("quiz_id").notNull(),
  code: varchar("code", { length: 10 }).notNull(),
  hostSocketId: varchar("host_socket_id").notNull(),
  hostPlayerId: varchar("host_player_id").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("playing"),
  currentQuestionIndex: integer("current_question_index").notNull().default(0),
  questionStartTime: varchar("question_start_time").notNull(),
  currentEffectiveTimeLimit: integer("current_effective_time_limit").notNull().default(30),
  players: jsonb("players").notNull().default([]),
  questions: jsonb("questions").notNull().default([]),
  quizData: jsonb("quiz_data").notNull().default({}),
  answeredThisQuestion: jsonb("answered_this_question").notNull().default([]),
  phase: varchar("phase", { length: 20 }).notNull().default("question"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ActiveGame = typeof activeGames.$inferSelect;

export type AssistantPermissions = {
  canMarkTasks: boolean;
  canSendTelegram: boolean;
  canEditLessons: boolean;
  canViewTracker: boolean;
};

export const classAssistants = pgTable("class_assistants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  classId: varchar("class_id").notNull(),
  userId: varchar("user_id"),
  inviteCode: varchar("invite_code", { length: 12 }).notNull().unique(),
  password: varchar("password", { length: 255 }),
  permissions: jsonb("permissions").$type<AssistantPermissions>().notNull().default({
    canMarkTasks: true,
    canSendTelegram: false,
    canEditLessons: false,
    canViewTracker: true,
  }),
  invitedBy: varchar("invited_by").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertClassAssistantSchema = createInsertSchema(classAssistants).omit({ id: true, createdAt: true });
export type InsertClassAssistant = z.infer<typeof insertClassAssistantSchema>;
export type ClassAssistant = typeof classAssistants.$inferSelect;

export const aiClasses = pgTable("ai_classes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  teacherId: varchar("teacher_id").notNull(),
  telegramBotToken: varchar("telegram_bot_token", { length: 255 }),
  instructions: text("instructions"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAiClassSchema = createInsertSchema(aiClasses).omit({ id: true, createdAt: true });
export type InsertAiClass = z.infer<typeof insertAiClassSchema>;
export type AiClass = typeof aiClasses.$inferSelect;

export const aiClassTasks = pgTable("ai_class_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  aiClassId: varchar("ai_class_id").notNull(),
  lessonNumber: integer("lesson_number").notNull().default(1),
  title: varchar("title", { length: 255 }).notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  prompt: text("prompt"),
  referenceText: text("reference_text"),
  type: varchar("type", { length: 20 }).notNull().default("audio"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAiClassTaskSchema = createInsertSchema(aiClassTasks).omit({ id: true, createdAt: true });
export type InsertAiClassTask = z.infer<typeof insertAiClassTaskSchema>;
export type AiClassTask = typeof aiClassTasks.$inferSelect;

export const aiStudents = pgTable("ai_students", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  aiClassId: varchar("ai_class_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  telegramChatId: varchar("telegram_chat_id"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAiStudentSchema = createInsertSchema(aiStudents).omit({ id: true, createdAt: true });
export type InsertAiStudent = z.infer<typeof insertAiStudentSchema>;
export type AiStudent = typeof aiStudents.$inferSelect;

export const aiSubmissions = pgTable("ai_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  aiStudentId: varchar("ai_student_id").notNull(),
  aiTaskId: varchar("ai_task_id").notNull(),
  submissionType: varchar("submission_type", { length: 10 }).notNull().default("audio"),
  audioFileId: varchar("audio_file_id"),
  imageFileId: varchar("image_file_id"),
  ocrText: text("ocr_text"),
  transcription: text("transcription"),
  aiResponse: text("ai_response"),
  score: integer("score"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  gradedAt: timestamp("graded_at"),
});

export const insertAiSubmissionSchema = createInsertSchema(aiSubmissions).omit({ id: true, submittedAt: true, gradedAt: true });
export type InsertAiSubmission = z.infer<typeof insertAiSubmissionSchema>;
export type AiSubmission = typeof aiSubmissions.$inferSelect;
