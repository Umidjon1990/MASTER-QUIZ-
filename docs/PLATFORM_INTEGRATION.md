# Master Quiz: unified platform contract

Main portal: https://zamonaviy-talim.up.railway.app. Source database and authoring stay here. PLATFORM_SERVICE_SECRET is a distinct server-only service key shared only with the commerce core's corresponding provider variable. No browser key, user password or grading answer is logged.

Catalog imports are drafts. Admin sets coin price, duration and attempts centrally. Publishing a source item alone never sets a coin price. IDs are provider-qualified; external order UUID is the idempotency key. Grant duration begins at successful delivery. Revoke tombstones prevent late delivery after a refund. Existing owned access survives unpublish; active attempts freeze the source questions, options, timing and grading policy.

API: /api/platform/catalog, /capabilities, /products/:sourceId/demo, POST /grants, POST /grants/:orderId/manage, /users/:userId/library, /owned/:sourceId/view and /history, /native/course-exams/:sourceId/start, /native/course-exam-attempts/:attemptId, /native/assessment-files, scoped /files/:fileId, /admin/exam-attempts and grading. All require the service key. Learning additionally binds x-platform-user and x-platform-order. File upload requires matching sitting/question; learner DTOs contain no answer keys. Audio is private PostgreSQL data capped at 5 MB per response. Production backups must include these tables.

Legacy POST /legacy/link verifies existing credentials; GET /legacy/status/:externalUserId refreshes proven links and imports existing native entitlements without copying balances. No name/email auto-merge. Existing source accounts, author roles and original records remain authoritative. Failed verification is rate-limited and passwords are not stored in bridge tables.

Run npm run check, npm test, npm run build. See platform tests for real PostgreSQL protocol fixtures and ownership, frozen timing, retry, quota, private file and manual-grade checks. Migrations are additive CREATE TABLE IF NOT EXISTS. Do not rotate SESSION_SECRET/JWT_SECRET for this integration: unrelated private PDFs, sessions and native records depend on existing keys.
