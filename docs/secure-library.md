# Secure teacher library

The library is optional. Teachers without active book assignments retain the existing dashboard and do not see the library menu.

## Railway production setup

1. Create a private Railway Storage Bucket in the same environment as the application.
2. Add variable references from the bucket to the application service:
   - `BUCKET`
   - `ENDPOINT`
   - `ACCESS_KEY_ID`
   - `SECRET_ACCESS_KEY`
   - `REGION`
3. Generate a 32-byte encryption key and store it as `LIBRARY_ENCRYPTION_KEY` (base64 or 64-character hex). Never reuse `SESSION_SECRET` in production.
4. Redeploy. `/api/admin/library/books` reports `storage.configured: true` when private storage and encryption are ready.

Older Railway buckets that explicitly require path-style URLs can set `LIBRARY_S3_FORCE_PATH_STYLE=true`. New buckets use virtual-hosted style by default.

Optional controls:

- `LIBRARY_MAX_PDF_MB` — upload size limit, default `100`.
- `LIBRARY_MAX_PAGES` — page limit, default `2500`.
- `LIBRARY_SESSION_HOURS` — viewer session lifetime, default `2`.
- `LIBRARY_AUDIT_SALT` — dedicated random value used to hash IP addresses in audit records.

## Security model

- Only admins can upload and change books or teacher assignments.
- Files are validated as PDFs, password-protected/corrupt files are rejected, duplicates are detected by SHA-256, and PDFs containing JavaScript, embedded files, launch actions, or automatic actions are rejected.
- Original PDFs are encrypted with AES-256-GCM before private-bucket upload. The stored object is not a readable PDF.
- The browser never receives a storage URL or the original PDF.
- On first successful view, one quota unit is consumed transactionally and a teacher-specific PDF is generated with repeated permanent watermarks on every page.
- Viewer tokens are random, short-lived, stored only as SHA-256 hashes on the server, and bound to the authenticated teacher.
- Removing an assignment or archiving a book revokes active viewer sessions.
- PDF responses use private/no-store cache headers, same-origin framing, request throttling, and range serving.
- Audit records store admin/teacher actions and hashed IP information, never PDF contents, credentials, or raw viewer tokens.

Browser screenshot prevention cannot be absolute. Permanent personalized watermarks provide attribution and deterrence even when a teacher intentionally shares the screen during an online lesson.
