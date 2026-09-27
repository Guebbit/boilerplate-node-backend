---
source: src/modules/feedback/service.ts
sha256: fd250a3f6655ba8b19b95ece1414e45bfd836edb6fad478c674ff9de478edaba
generated_at: 2026-09-27T14:53:52.424731+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/service.ts

## Purpose

Business-logic service for the feedback (contact-request) module. It owns the full lifecycle of a feedback ticket — creation with operator notification, paginated search, status/notes triage, hard deletion, and a caller-scoped data export — and is the single place where the "one event" of a customer reaching out (persist + notify) stays atomic. Controllers above it handle HTTP concerns; the repository below handles persistence.

## Key elements

- **`toFeedbackStatus(status?: string)`** — Narrows a string to the closed `FeedbackRequestStatus` enum. Defensive: the generated Zod schema already rejects invalid values with 422 at the HTTP layer; this exists so `updateStatus` holds a typed value even if called from a non-HTTP path.
- **`notifyMailbox()`** — Resolves the support notification address from `NODE_CONTACT_NOTIFY_EMAIL` → `NODE_SMTP_SENDER` → `''`. Read per call (not captured at import) so deployments can rotate the address without a restart.
- **`create(payload)`** — Normalizes email, evaluates honeypot (`payload.website`) and `checkEmailPolicy` disposable-domain verdict. Files the row as `spam` (skipping notification) or `new` (enqueueing an operator email built in `NODE_DEFAULT_LOCALE`). Always resolves; never rejects to the caller.
- **`search(filters, context?)`** — Paginated query with optional `status` scope. Emits `ADMIN_FEEDBACK_VIEWED` audit event only when a `CallerContext` is supplied (omitted context ⇒ internal/test call, no event).
- **`updateStatus(feedback, payload)`** — Mutates an already-loaded document: sets `status`, clears/sets `adminNotes` via `clearedOrValue`, stamps `respondedAt` the first time status becomes `resolved`. Persists and returns `ResponseSuccess`. No reject branch.
- **`updateStatusById(id, payload, context?)`** — Loads by id (404 if absent), delegates to `updateStatus`, then emits `ADMIN_FEEDBACK_STATUS_UPDATED`.
- **`remove(id, context?)`** — Loads by id (404 if absent), hard-deletes the document, emits `ADMIN_FEEDBACK_DELETED`. No soft-delete tier.
- **(truncated) export helper** — `findAll` with an **exact** email filter (not the regex spec used by `search`) for a caller's own data export, gated behind `NODE_EXPORT_INCLUDE_FEEDBACK`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `infrastructure/adapters/antibot.ts` | Calls `checkEmailPolicy(email)` in `create` to detect disposable-inbox domains. |
| `infrastructure/adapters/logger.ts` | Calls `logger.error` when the operator notification email enqueue fails. |
| `infrastructure/adapters/mailer.ts` | Calls `enqueueEmail` to deliver the operator contact-request notification. |
| `infrastructure/http/response.ts` | Uses `generateSuccess` / `generateReject` to build the `ResponseSuccess` / `ResponseReject` unions returned by `updateStatusById`, `remove`. |
| `infrastructure/i18n/index.ts` | Imports `getDefaultLocale` (operator email locale) and `t` (404 message strings). |
| `infrastructure/persistence/search.ts` | Imports `PaginatedMeta` type and `MAX_CONFIGURED_PAGE_SIZE` for the paginated search contract. |
| `infrastructure/persistence/create-repository.ts` | Imports the `Lean` type used in repository generic signatures. |
| `infrastructure/persistence/changes.ts` | Imports `clearedOrValue` to distinguish "clear field" from "set to empty string" on `adminNotes`. |
| `infrastructure/persistence/normalize-email.ts` | Calls `normalizeEmail` at the top of `create`. |
| `infrastructure/observability/audit.ts` | Calls `recordAudit` in `search`, `updateStatusById`, and `remove`. |
| `modules/feedback/audit.ts` | Imports `feedbackAuditActions` enum members used as audit action identifiers. |
| `modules/feedback/controllers/delete-feedback.ts` | Consumes `remove` (and likely `updateStatusById`) as its service call. |
| `modules/feedback/controllers/get-feedback.ts` | Consumes `search` (and/or a single-get path) as its service call. |

## Notes

- **Operator email locale is pinned.** The notification email is built with `getDefaultLocale()` (i.e. `NODE_DEFAULT_LOCALE`), never the submitter's locale. The function intentionally takes no `CallerContext`. Customer-supplied text (`subject`, `message`) passes through unchanged.
- **Spam is invisible to the bot.** Both honeypot and disposable-domain hits return HTTP 201; the only difference is the `spam` status and the suppressed notification. A visible 4xx would teach a spam script which signal fired.
- **`payload.website` (honeypot) is never persisted.** It exists in the request contract solely for the `Boolean(payload.website?.trim())` check in `create`.
- **`respondedAt` is write-once.** Re-resolving an already-resolved ticket does not update the timestamp.
- **No soft-delete.** Unlike the `orders` module, `remove` is a hard delete with no `hardDelete` flag.
- **Export uses exact match, not regex.** The search spec's `email` field is a regex for staff free-text queries; the export helper deliberately uses an equality filter to avoid leaking tickets whose address merely contains the caller's as a substring.
- **Audit is context-gated.** Passing `undefined` for `context` suppresses the audit event — the convention for non-HTTP callers (tests, internal reuse).
