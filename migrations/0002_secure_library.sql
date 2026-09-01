CREATE TABLE IF NOT EXISTS "library_books" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(255) NOT NULL,
  "author" varchar(255), "description" text, "category" varchar(120), "subject" varchar(120),
  "level" varchar(50), "language" varchar(50) DEFAULT 'uz' NOT NULL, "cover_url" text,
  "storage_key" text NOT NULL UNIQUE, "original_file_name" varchar(255) NOT NULL,
  "mime_type" varchar(100) DEFAULT 'application/pdf' NOT NULL, "file_size" integer NOT NULL,
  "page_count" integer NOT NULL, "checksum_sha256" varchar(64) NOT NULL,
  "copyright_owner" varchar(255), "license_note" text, "licensed_until" timestamp,
  "status" varchar(20) DEFAULT 'active' NOT NULL, "version" integer DEFAULT 1 NOT NULL,
  "uploaded_by" varchar NOT NULL, "created_at" timestamp DEFAULT now(), "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_assignments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "teacher_id" varchar NOT NULL,
  "book_id" varchar NOT NULL, "max_opens" integer, "used_opens" integer DEFAULT 0 NOT NULL,
  "max_concurrent_sessions" integer DEFAULT 1 NOT NULL, "starts_at" timestamp, "expires_at" timestamp,
  "status" varchar(20) DEFAULT 'active' NOT NULL, "assigned_by" varchar NOT NULL,
  "created_at" timestamp DEFAULT now(), "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_view_sessions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "assignment_id" varchar NOT NULL,
  "teacher_id" varchar NOT NULL, "book_id" varchar NOT NULL, "token_hash" varchar(64) NOT NULL UNIQUE,
  "status" varchar(20) DEFAULT 'pending' NOT NULL, "count_consumed" boolean DEFAULT false NOT NULL,
  "ip_hash" varchar(64), "user_agent_hash" varchar(64), "opened_at" timestamp DEFAULT now(),
  "activated_at" timestamp, "expires_at" timestamp NOT NULL, "last_seen_at" timestamp DEFAULT now(),
  "last_page" integer DEFAULT 1 NOT NULL, "revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_audit_logs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "actor_id" varchar NOT NULL,
  "actor_role" varchar(20) NOT NULL, "action" varchar(60) NOT NULL, "book_id" varchar,
  "teacher_id" varchar, "assignment_id" varchar, "session_id" varchar,
  "result" varchar(20) DEFAULT 'success' NOT NULL, "reason" text, "metadata" jsonb DEFAULT '{}'::jsonb,
  "ip_hash" varchar(64), "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_books_status_idx" ON "library_books" ("status");
CREATE INDEX IF NOT EXISTS "library_books_category_idx" ON "library_books" ("category");
CREATE INDEX IF NOT EXISTS "library_books_checksum_idx" ON "library_books" ("checksum_sha256");
CREATE UNIQUE INDEX IF NOT EXISTS "library_assignments_teacher_book_unique" ON "library_assignments" ("teacher_id", "book_id");
CREATE INDEX IF NOT EXISTS "library_assignments_teacher_idx" ON "library_assignments" ("teacher_id");
CREATE INDEX IF NOT EXISTS "library_assignments_book_idx" ON "library_assignments" ("book_id");
CREATE INDEX IF NOT EXISTS "library_view_sessions_teacher_idx" ON "library_view_sessions" ("teacher_id");
CREATE INDEX IF NOT EXISTS "library_view_sessions_assignment_idx" ON "library_view_sessions" ("assignment_id");
CREATE INDEX IF NOT EXISTS "library_view_sessions_expiry_idx" ON "library_view_sessions" ("expires_at");
CREATE INDEX IF NOT EXISTS "library_audit_created_idx" ON "library_audit_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "library_audit_book_idx" ON "library_audit_logs" ("book_id");
CREATE INDEX IF NOT EXISTS "library_audit_teacher_idx" ON "library_audit_logs" ("teacher_id");
