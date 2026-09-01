ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "practice_mode" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "allow_replay" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "question_sections" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "folder_id" varchar;
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "order_in_folder" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "config" jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quiz_folders" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "creator_id" varchar NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_quiz_assignments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_quiz_id" varchar NOT NULL,
  "source_teacher_id" varchar NOT NULL,
  "target_quiz_id" varchar NOT NULL,
  "target_teacher_id" varchar NOT NULL,
  "assigned_by" varchar NOT NULL,
  "source_title" varchar(255) NOT NULL,
  "source_folder_name" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_quiz_assignments_source_target_unique" ON "admin_quiz_assignments" ("source_quiz_id", "target_teacher_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_quiz_assignments_target_quiz_unique" ON "admin_quiz_assignments" ("target_quiz_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_quiz_assignments_target_teacher_idx" ON "admin_quiz_assignments" ("target_teacher_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_quiz_assignments_created_idx" ON "admin_quiz_assignments" ("created_at");
