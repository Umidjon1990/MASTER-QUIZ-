# QuizLive - Interactive Quiz Platform

## Overview

QuizLive is a real-time interactive quiz platform (similar to Kahoot) built for the Uzbek education market. It supports three user roles — **admin**, **teacher**, and **student** — with features including quiz creation, live quiz sessions with real-time WebSocket communication, and result tracking. The UI text is primarily in Uzbek. The app follows a monorepo structure with a React frontend, Express backend, PostgreSQL database via Drizzle ORM, and Socket.IO for real-time gameplay.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Monorepo Structure
- **`client/`** — React single-page application (Vite-based)
- **`server/`** — Express.js API server
- **`shared/`** — Shared TypeScript types and Drizzle schema (used by both client and server)
- **`migrations/`** — Drizzle-generated database migrations

### Frontend (`client/src/`)
- **Framework**: React with TypeScript, bundled by Vite
- **Routing**: Wouter (lightweight client-side router)
- **State/Data Fetching**: TanStack React Query for server state management
- **UI Components**: shadcn/ui (new-york style) with Radix UI primitives, Tailwind CSS for styling
- **Theming**: Custom light/dark mode via CSS variables and a ThemeProvider context
- **Real-time**: Socket.IO client for live quiz sessions
- **File Uploads**: Uppy with presigned URL flow (AWS S3-compatible via Google Cloud Storage)
- **Animations**: Framer Motion
- **Path aliases**: `@/` → `client/src/`, `@shared/` → `shared/`

### Pages & Role-Based Routing
- `/` — Public landing page with join-by-code feature
- `/auth` — Email/password login and registration
- `/dashboard` — Redirects to role-specific dashboard (admin/teacher/student)
- `/admin/*` — Admin pages (user management, quiz oversight)
- `/teacher/*` — Teacher pages (quiz CRUD, live session hosting, results, assignments, classes, question bank)
- `/teacher/assignments` — Assignment management (create/delete/view attempts/CSV export)
- `/teacher/classes` — Class management (create/delete/view members/join codes)
- `/teacher/question-bank` — Question bank (add/copy from quiz/copy to quiz)
- `/student/*` — Student pages (join quiz, view results, assignments, classes)
- `/student/assignments` — Student assignment list and self-paced quiz solving
- `/student/classes` — Student class membership and join-by-code
- `/discover` — Public quiz discovery with search, category filter, likes
- `/play/join` — Quiz join page (by 6-digit code)
- `/teacher/lessons` — Live lesson management (create, list, delete)
- `/teacher/lesson/:id` — Live lesson hosting (PDF viewer + pointer + audio/video + zoom sync + recording + device selection)
- `/lesson/join` — Student lesson join page (by code)
- `/lesson/join/:code` — Direct lesson join (codeless)

### Backend (`server/`)
- **Framework**: Express.js with TypeScript, run via `tsx`
- **API Pattern**: RESTful JSON API under `/api/*` prefix
- **Authentication**: Session-based auth using `express-session` with `connect-pg-simple` session store. Custom email/password auth with bcrypt password hashing. No third-party OAuth — sessions stored in the `sessions` PostgreSQL table.
- **Authorization**: Role-based middleware (`requireRole`) checking user profiles for admin/teacher/student roles
- **WebSocket**: Socket.IO on the same HTTP server for real-time live quiz events (host creates session, players join, answer submission, leaderboard updates)
- **File Uploads**: Multer for in-memory file processing (e.g., XLSX import), plus Google Cloud Storage presigned URL flow for object storage
- **Build**: esbuild bundles server to `dist/index.cjs` for production; Vite builds client to `dist/public/`

### Database
- **Database**: PostgreSQL (required via `DATABASE_URL` environment variable)
- **ORM**: Drizzle ORM with `drizzle-orm/node-postgres` driver
- **Schema location**: `shared/schema.ts` and `shared/models/auth.ts`
- **Schema push**: `npm run db:push` (uses `drizzle-kit push`)
- **Key tables**:
  - `users` — Authentication credentials (id, email, password, name, profile image)
  - `sessions` — Express session store (sid, sess JSON, expire)
  - `user_profiles` — Role, plan, quiz limits, subscription info (linked to users via userId)
  - `quizzes` — Quiz metadata (title, description, category, visibility, creator, shuffleQuestions, shuffleOptions, totalLikes)
  - `questions` — Quiz questions (multiple types: multiple_choice, true_false, open_ended, poll, multiple_select; with media support, points, time limits, JSONB options)
  - `live_sessions` — Active live quiz game sessions
  - `session_participants` — Players in a live session
  - `session_answers` — Individual answers submitted during live play
  - `quiz_results` — Aggregated quiz results
  - `assignments` — Homework assignments (quizId, deadline, attemptsLimit, classId)
  - `assignment_attempts` — Student assignment attempt results (answers JSONB, score)
  - `classes` — Teacher classes/groups with join codes
  - `class_members` — Class membership (classId, userId)
  - `question_bank` — Reusable question bank with category/tags
  - `quiz_likes` — Quiz like tracking (quizId, userId)
  - `live_lessons` — Live PDF-based lesson sessions (title, pdfUrl, teacher, status, code, requireCode)

### Storage Layer
- `server/storage.ts` defines an `IStorage` interface with a concrete implementation using Drizzle queries
- `server/replit_integrations/auth/storage.ts` handles user CRUD separately
- Clean separation between auth storage and application data storage

### Development vs Production
- **Dev**: `tsx server/index.ts` with Vite dev server middleware (HMR via `/vite-hmr`)
- **Prod**: `node dist/index.cjs` serves pre-built static files from `dist/public/`
- **Build**: `tsx script/build.ts` runs Vite build then esbuild for server, with dependency allowlist for bundling

## External Dependencies

### Required Services
- **PostgreSQL**: Primary database, connection via `DATABASE_URL` environment variable
- **Google Cloud Storage**: Object/file storage via `@google-cloud/storage`, uses Replit sidecar endpoint (`http://127.0.0.1:1106`) for credentials

### Key Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (required)
- `SESSION_SECRET` — Session encryption key (defaults to hardcoded fallback)
- `PUBLIC_OBJECT_SEARCH_PATHS` — Configures public object storage paths

### Notable NPM Dependencies
- `express`, `express-session`, `connect-pg-simple` — Server and session management
- `drizzle-orm`, `drizzle-kit`, `drizzle-zod` — Database ORM and schema validation
- `socket.io` — Real-time WebSocket communication
- `bcryptjs` — Password hashing
- `multer` — File upload handling
- `xlsx` — Excel file parsing (for bulk quiz/question import)
- `zod` — Runtime schema validation
- `framer-motion` — UI animations
- `wouter` — Client-side routing
- `@tanstack/react-query` — Server state management
- `@uppy/core`, `@uppy/dashboard`, `@uppy/aws-s3` — File upload UI and S3-compatible uploads
- `recharts` — Charts/data visualization
- `stripe` — Payment processing (listed in build dependencies)
- `openai`, `@google/generative-ai` — AI integrations (listed in build dependencies)
- `nodemailer` — Email sending
- `node-telegram-bot-api` — Telegram bot integration for sending quizzes as anonymous polls to Telegram groups/channels

### Telegram Integration
- Teachers have a dedicated Telegram Bot Settings page (`/teacher/telegram`)
- Bot token saved server-side only; client receives masked version (`****...`) via `hasTelegramBot` flag
- Multiple Telegram chats (groups/channels) stored in `telegramChats` JSONB field on userProfiles
- API endpoints:
  - POST /api/telegram/save-token — validate & store bot token
  - DELETE /api/telegram/token — remove bot token and all linked chats
  - POST /api/telegram/add-chat — add a group/channel by chat ID or @username
  - DELETE /api/telegram/chats/:chatId — remove a linked chat
  - POST /api/telegram/send-quiz — send quiz to selected chat (uses server-stored token)
- Quiz list page shows "Telegram" share button per quiz; dialog shows saved chats to choose from
- Sends quiz title message first, then each question as Telegram quiz poll (type: "quiz", is_anonymous: true)
- Ownership check: only quiz creator or admin can send