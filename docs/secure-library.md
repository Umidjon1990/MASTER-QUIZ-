# Secure teacher library

The library is optional. Teachers without active book assignments retain the existing dashboard and do not see the library menu.

## Railway production setup

No additional Railway service or variable is required. When no bucket is configured, PDFs are encrypted by the application and stored automatically in the existing PostgreSQL database.

An optional private Railway Storage Bucket can be added later. When all of the following variable references are present, new uploads use S3 automatically:

   - `BUCKET`
   - `ENDPOINT`
   - `ACCESS_KEY_ID`
   - `SECRET_ACCESS_KEY`
   - `REGION`

`LIBRARY_ENCRYPTION_KEY` remains optional. When it is absent, the application derives a 32-byte file-encryption key from the existing required `SESSION_SECRET`. If it is supplied, it must be base64 or 64-character hex and decode to exactly 32 bytes.

`/api/admin/library/books` reports the active provider as `postgresql-encrypted` or `private-s3`. PostgreSQL files remain readable if a Bucket is enabled later.

Older Railway buckets that explicitly require path-style URLs can set `LIBRARY_S3_FORCE_PATH_STYLE=true`. New buckets use virtual-hosted style by default.

Optional controls:

- `LIBRARY_MAX_PDF_MB` — upload size limit, default `25`; the hard safety ceiling is `50` MB.
- `LIBRARY_MAX_PAGES` — page limit, default `1500`; the hard safety ceiling is `2500` pages.
- `LIBRARY_SESSION_HOURS` — viewer session lifetime, default `2`.
- `LIBRARY_AUDIT_SALT` — dedicated random value used to hash IP addresses in audit records.

## Security model

- Only admins can upload and change books or teacher assignments.
- Files are validated as PDFs, password-protected/corrupt files are rejected, duplicates are detected by SHA-256, and PDFs containing JavaScript, embedded files, launch actions, or automatic actions are rejected.
- Original PDFs are encrypted with AES-256-GCM before PostgreSQL or private-bucket storage. The stored object is not a readable PDF.
- The browser never receives a storage URL or the original PDF.
- On first successful view, one quota unit is consumed transactionally and a teacher-specific PDF is generated with repeated permanent watermarks on every page.
- Viewer tokens are random, short-lived, stored only as SHA-256 hashes on the server, and bound to the authenticated teacher.
- Removing an assignment or archiving a book revokes active viewer sessions.
- PDF responses use private/no-store cache headers, same-origin framing, request throttling, and range serving.
- Audit records store admin/teacher actions and hashed IP information, never PDF contents, credentials, or raw viewer tokens.

Browser screenshot prevention cannot be absolute. Permanent personalized watermarks provide attribution and deterrence even when a teacher intentionally shares the screen during an online lesson.
