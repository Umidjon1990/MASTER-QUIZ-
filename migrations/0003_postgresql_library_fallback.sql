CREATE TABLE IF NOT EXISTS "library_file_blobs" (
  "storage_key" text PRIMARY KEY NOT NULL,
  "encrypted_content" bytea NOT NULL,
  "encrypted_size" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
