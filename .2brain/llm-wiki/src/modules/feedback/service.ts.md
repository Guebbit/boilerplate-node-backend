---
source: src/modules/feedback/service.ts
sha256: 0af65487901e08cf6ede576b779b4cda72f6398407505d43052499cae7a245bb
generated_at: 2026-10-15T10:32:41.231050+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/service.ts

## Purpose

Write-path service for the feedback module: creating contact requests (with operator notification and anti-spam gating), searching tickets, and applying status/notes updates or deletion. Business rules for initial status and `respondedAt` stamping live in `./domain`; this file orchestrates persistence, side-effects (email, audit), and HTTP response shaping around them.

## Key elements

- **`create(payload)`** — Normalises email, checks honeypot (`payload.website`) and disposable-domain policy via `checkEmailPolicy`. Suspected spam is persisted as `spam` and skipped from notification; the caller still receives a `201`. Clean submissions enqueue an operator notification email (built in the server default locale, not the caller's). Returns the created document.
- **`search(filters?, context?)`** — Paginated query by status scope, email fragment, or free text. Emits `ADMIN_FEEDBACK_VIEWED` audit when a `CallerContext` is supplied. `page`/`pageSize` accept `string | number` (query-string coercion).
- **`updateStatus(feedback, payload)`** — Mutates an already-loaded document: sets `status`, sets/clears `adminNotes` (via `clearedOrValue`), stamps `respondedAt` only on the *first* transition to `resolved`. No validation branch; a failed save rejects the promise.
- **`updateStatusById(id, payload, context?)`** — `findById` → 404 `ResponseReject` or delegates to `updateStatus` → emits `ADMIN_FEEDBACK_STATUS_UPDATED`.
- **`remove(id, context?)`** — Hard delete (no soft-delete tier). `findById` → 404 or `deleteOne` → emits `ADMIN_FEEDBACK_DELETED`.
- **`findOwnTickets(email)`** — Exact-email `findAll` (not the regex `search` spec) for the caller's own data export; uses `readAll` pagination.
- **`notifyMailbox()`** (private) — Resolves the operator notification address: `feedbackConfig().NODE_CONTACT_NOTIFY_EMAIL` → `mailConfig().NODE_SMTP_SENDER` → `''`. Read per call, not captured at import.

## Relationships

- **`./domain`** — imports `initialFeedbackStatus` and `shouldStampRespondedAt`; the only place those rules are applied.
- **`./repository`** — all reads/writes go through `feedbackRequestRepository` (`create`, `search`, `save`, `findById`, `deleteOne`, `findAll`).
- **`./config`** — `feedbackConfig()` supplies the notification mailbox override.
- **`./audit`** — `feedbackAuditActions` enum values for `recordAudit` calls.
- **`./emails`** — `contactRequestEmail` builds the operator notification template.
- **`@infrastructure/adapters/antibot`** — `checkEmailPolicy` gates disposable domains.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` sends the operator notification (fire-and-forget; failures logged, not surfaced).
- **`@infrastructure/adapters/config`** — `mailConfig()` provides the SMTP sender fallback for `notifyMailbox`.
- **`@infrastructure/adapters/logger`** — error logging for failed email enqueue.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape HTTP-layer return values.
- **`@infrastructure/i18n`** — `t` (404 error message), `getDefaultLocale` (operator email language).
- **`@infrastructure/observability/audit`** — `recordAudit` for admin action events.
- **`@infrastructure/persistence/search`** — `readAll`, `MAX_CONFIGURED_PAGE_SIZE`, `PaginatedMeta`.
- **`@infrastructure/persistence/changes`** — `clearedOrValue` for nullable `adminNotes`.
- **`@infrastructure/persistence/normalize-email`** — `normalizeEmail` on incoming address.
- **`@infrastructure/persistence/create-repository`** — `Lean` type for `findOwnTickets` return.

## Notes

- **Operator email locale is deliberately fixed.** `contactRequestEmail` receives `getDefaultLocale()` (the operator's language), not the submitter's. The function takes no `CallerContext` by design.
- **Spam is invisible to the spammer.** Both honeypot and disposable-domain hits return `201` with a `spam`-status row; no distinct error is emitted.
- **`respondedAt` is monotonic.** Once set, re-resolving a ticket does not move it (`shouldStampRespondedAt` guards this).
- **`findOwnTickets` uses exact match, not regex.** The `search` email spec is a substring/regex for staff; reusing it here would leak tickets belonging to addresses that merely *contain* the caller's.
- **`adminNotes` is excluded from export.** It is staff's internal assessment, not the submitter's data (GDPR Art. 15(4) — protects the rights of the note-writer as well).
- **`updateStatus` has no failure branch.** It assumes the document is already loaded and valid; `updateStatusById` is the only entry point that can produce a `ResponseReject`.
- **No soft-delete.** Unlike `orders`, this module has no `hardDelete` flag or recovery tier; `remove` is permanent.
- **`notifyMailbox` is a function, not a const.** Intentional per-call read so tests can vary the config; a deployment change requires a restart.
