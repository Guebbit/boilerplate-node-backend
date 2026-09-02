# docs/modules/feedback.md

## Purpose

Documents the contact-request (feedback) module: an open form anyone can submit (the only unauthenticated write in the app) and the admin triage workflow around it. Exists as a reference page so readers understand the status lifecycle, honeypot mechanics, and retention policy without opening the source.

## Key elements

- **Status enum** (`new → in_progress → resolved`, plus `spam`) — the triage workflow; `spam` is the terminal exit that is neither resolved nor in-progress.
- **`POST /feedback/contact`** — public write route; requires an email address, not a user reference.
- **`website` (honeypot)** — declared in the API contract so real browsers don't 422, but never persisted or returned. A non-empty value writes the row as `spam` and suppresses operator notification; the caller still receives `201`.
- **`submissionLimiter`** — rate-limit budget spent on each successful post.
- **`adminNotes` / `respondedAt`** — operator-side fields, never served back to the filer.
- **Index `status: 1, createdAt: -1`** — the admin queue sort.
- **TTL index on `createdAt`** — governed by `NODE_FEEDBACK_RETENTION_DAYS` (default 730); auto-expires rows.
- **`email` field** — deliberately unindexed; the only query is case-insensitive and unanchored, so a B-tree index would not help.
- **GDPR erasure path** — `GET /feedback?email=` / `POST /feedback/search` to locate rows, then `DELETE /feedback/{id}` per row.

## Relationships

- **docs/modules/index.md** — lists feedback as a zero-dependency, zero-dependent leaf; pairs it with wishlist as the "no coupling" reading pair.
- **docs/modules/users.md** — explicitly *not* a dependency; feedback stores a raw email, so account deletion leaves feedback intact.
- **docs/modules/wishlist.md** — the other leaf module; read together to see the module system without coupling.
- **docs/modules/audit-logs.md** — shares the identical TTL + `collMod` migration caveat.
- **docs/tools/email-and-rendering.md** — the acknowledgement (to filer) and triage notification (to support mailbox) flows.
- **docs/tools/security.md** — documents the three rate-limit budgets, including this module's `submissionLimiter`.
- **docs/tools/winston.md** — what a triage status-change action records in audit logs.
- **docs/reference/ops.md** — the retention window and why changing it requires a `collMod` migration on a live database.
- **docs/api/endpoints.md** — the public `POST /feedback/contact` and admin search/delete routes are catalogued here.
- **docs/demo-ecommerce/support.md** — the demo app's support page exercises this module's public form.

## Notes

- The honeypot trades an *email* amplifier for a *storage* amplifier; `submissionLimiter` bounds the volume and the TTL index expires the noise.
- Changing `NODE_FEEDBACK_RETENTION_DAYS` on a live database is a `collMod` migration, not a config restart.
- `adminNotes` and `respondedAt` must never appear in any response served to the filer.
- Because the form is unauthenticated and user-free, this module has no foreign-key or join path into `users`; treat it as fully independent of the account lifecycle.
