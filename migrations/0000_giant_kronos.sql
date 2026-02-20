CREATE TABLE "active_games" (
	"id" varchar PRIMARY KEY NOT NULL,
	"quiz_id" varchar NOT NULL,
	"code" varchar(10) NOT NULL,
	"host_socket_id" varchar NOT NULL,
	"host_player_id" varchar NOT NULL,
	"status" varchar(20) DEFAULT 'playing' NOT NULL,
	"current_question_index" integer DEFAULT 0 NOT NULL,
	"question_start_time" varchar NOT NULL,
	"current_effective_time_limit" integer DEFAULT 30 NOT NULL,
	"players" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quiz_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"answered_this_question" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"phase" varchar(20) DEFAULT 'question' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assignment_attempts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"correct_answers" integer DEFAULT 0 NOT NULL,
	"total_questions" integer DEFAULT 0 NOT NULL,
	"answers" jsonb,
	"completed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" varchar NOT NULL,
	"creator_id" varchar NOT NULL,
	"title" varchar(255) NOT NULL,
	"class_id" varchar,
	"deadline" timestamp,
	"attempts_limit" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "class_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"teacher_id" varchar NOT NULL,
	"join_code" varchar(8) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "classes_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "live_lessons" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" varchar NOT NULL,
	"title" varchar(255) NOT NULL,
	"lesson_type" varchar(20) DEFAULT 'pdf' NOT NULL,
	"pdf_url" text,
	"pdf_file_name" varchar(255),
	"join_code" varchar(6) NOT NULL,
	"require_code" boolean DEFAULT true NOT NULL,
	"status" varchar(20) DEFAULT 'waiting' NOT NULL,
	"current_page" integer DEFAULT 1 NOT NULL,
	"total_pages" integer DEFAULT 0 NOT NULL,
	"participant_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "live_lessons_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "live_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" varchar NOT NULL,
	"host_id" varchar NOT NULL,
	"join_code" varchar(6) NOT NULL,
	"password" varchar(100),
	"status" varchar(20) DEFAULT 'waiting' NOT NULL,
	"current_question_index" integer DEFAULT -1 NOT NULL,
	"participant_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "live_sessions_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "question_bank" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" varchar NOT NULL,
	"category" varchar(100),
	"tags" text,
	"type" varchar(30) DEFAULT 'multiple_choice' NOT NULL,
	"question_text" text NOT NULL,
	"options" jsonb,
	"correct_answer" text NOT NULL,
	"points" integer DEFAULT 100 NOT NULL,
	"time_limit" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" varchar NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"type" varchar(30) DEFAULT 'multiple_choice' NOT NULL,
	"question_text" text NOT NULL,
	"media_type" varchar(20),
	"media_url" text,
	"options" jsonb,
	"correct_answer" text NOT NULL,
	"points" integer DEFAULT 100 NOT NULL,
	"time_limit" integer DEFAULT 30 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"creator_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quiz_likes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quiz_results" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"quiz_id" varchar NOT NULL,
	"participant_id" varchar NOT NULL,
	"user_id" varchar,
	"guest_name" varchar,
	"total_score" integer DEFAULT 0 NOT NULL,
	"correct_answers" integer DEFAULT 0 NOT NULL,
	"total_questions" integer DEFAULT 0 NOT NULL,
	"rank" integer,
	"completed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100),
	"cover_image" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"creator_id" varchar NOT NULL,
	"timer_enabled" boolean DEFAULT true NOT NULL,
	"time_per_question" integer DEFAULT 30 NOT NULL,
	"shuffle_questions" boolean DEFAULT false NOT NULL,
	"shuffle_options" boolean DEFAULT false NOT NULL,
	"show_correct_answers" boolean DEFAULT true NOT NULL,
	"total_questions" integer DEFAULT 0 NOT NULL,
	"total_plays" integer DEFAULT 0 NOT NULL,
	"total_likes" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp,
	"scheduled_status" varchar(20),
	"scheduled_code" varchar(10),
	"scheduled_room_code" varchar(10),
	"scheduled_require_code" boolean DEFAULT true NOT NULL,
	"scheduled_telegram_chat_id" varchar(100),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session_answers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"participant_id" varchar NOT NULL,
	"question_id" varchar NOT NULL,
	"answer" text,
	"is_correct" boolean DEFAULT false NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"time_spent" integer DEFAULT 0 NOT NULL,
	"answered_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session_participants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"user_id" varchar,
	"guest_name" varchar(100),
	"score" integer DEFAULT 0 NOT NULL,
	"correct_answers" integer DEFAULT 0 NOT NULL,
	"total_answered" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar(20) DEFAULT 'student' NOT NULL,
	"display_name" varchar,
	"plan" varchar(20) DEFAULT 'free' NOT NULL,
	"quiz_limit" integer DEFAULT 5 NOT NULL,
	"bio" text,
	"telegram_bot_token" text,
	"telegram_chat_id" text,
	"telegram_chats" jsonb DEFAULT '[]'::jsonb,
	"subscription_expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"password" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");