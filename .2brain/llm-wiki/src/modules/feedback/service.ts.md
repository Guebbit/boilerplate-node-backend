---
source: src/modules/feedback/service.ts
sha256: cb6cd18082aaceef7a75f8c2d2fff3cb652ea34cd6bbae13305dced66f8936b4
generated_at: 2026-10-14T15:51:22.685059+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/service.ts

## Purpose

Write-path service for the feedback module: creates contact requests (with anti-spam gating and operator notification), searches tickets, triages status, and handles deletion. Domain rules (status narrowing, initial status, `respondedAt` stamping) live in `./domain`; this file orchestrates persistence, side-effects (email, audit), and HTTP response shaping around them.

## Key elements

- **`create(payload)`** — Normalises the email, checks honeypot (`payload.website`) and disposable-inbox policy (`checkEmailPolicy`). Suspected spam is persisted with `spam` status and skips notification; the caller still receives a `201`. Legitimate requests trigger an `enqueueEmail` to the support mailbox, built in `NODE_DEFAULT_LOCALE` (not the caller's locale).
- **`search(filters, context?)`** — Paginated query by status, email fragment, or free text. `page`/`pageSize` accept `string | number` (query-string origin). Emits `ADMIN_FEEDBACK_VIEWED` audit when a `CallerContext` is supplied; omitted context means no emit.
- **`updateStatus(feedback, payload)`** — Mutates an already-loaded document: applies new status, clears or sets `adminNotes` via `clearedOrValue`, stamps `respondedAt` on first transition to `resolved`. Always resolves `ResponseSuccess`; a failed `save` rejects the promise.
- **`updateStatusById(id, payload, context?)`** — Loads by id (404 `ResponseReject` if missing), delegates to `updateStatus`, then emits `ADMIN_FEEDBACK_STATUS_UPDATED`.
- **`remove(id, context?)`** — Loads by id (404 if missing), performs a hard `deleteOne`, emits `ADMIN_FEEDBACK_DELETED`. No soft-delete tier exists in this module.
- **`findOwnTickets(email)`** — Exact-match `findAll` (not the regex `search` spec) used for the account data-export path. Paginated via `readAll` with `MAX_CONFIGURED_PAGE_SIZE`.
- **`toExportTicket`** *(truncated in source)* — Projects a document into `ExportFeedbackTicket`, dropping `adminNotes` (GDPR Art. 15(4): protects the note-author).
- **`notifyMailbox()`** *(module-private)* — Resolves the operator notification address: `feedbackConfig().NODE_CONTACT_NOTIFY_EMAIL` → `mailConfig().NODE_SMTP_SENDER` → `''`. Read per call, not captured at import, so tests can vary it.

## Relationships

- **`src/infrastructure/adapters/antibot.ts`** — `checkEmailPolicy(email)` gate in `create`; a `'refused'` verdict marks the row `spam`.
- **`src/infrastructure/adapters/config.ts`** — `mailConfig()` provides the fallback SMTP sender address in `notifyMailbox()`.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` on failed notification email (non-blocking).
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` sends the operator notification; failure is caught and logged, not propagated.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape the return values of `updateStatusById`, `remove`.
- **`src/infrastructure/i18n/index.ts`** — `t()` for the 404 error message; `getDefaultLocale()` for the operator notification email locale.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` in `search`, `updateStatusById`, `remove`.
- **`src/infrastructure/persistence/changes.ts`** — `clearedOrValue` to distinguish "set to null" from "leave unchanged" on `adminNotes`.
- **`src/infrastructure/persistence/create-repository.ts`** — `Lean` type used by `findOwnTickets` return.
- **`src/infrastructure/persistence/normalize-email.ts`** — `normalizeEmail` applied to the submitter address before persistence and policy check.
- **`src/infrastructure/persistence/search.ts`** — `readAll`, `MAX_CONFIGURED_PAGE_SIZE`, `PaginatedMeta` used by `findOwnTickets` and `search`.
- **`src/modules/feedback/audit.ts`** — `feedbackAuditActions` enum values passed to `recordAudit`.
- **`src/modules/feedback/config.ts`** — `feedbackConfig()` for the contact-notify email override.

## Notes

- **No visible spam refusal.** Honeypot-fill and disposable-inbox hits both return `201` with a `spam` row. A `4xx` would signal to the bot which heuristic fired.
- **Operator email locale is fixed.** `contactRequestEmail` is called with `getDefaultLocale()` explicitly, not the caller's locale. The customer's `subject`/`message` pass through verbatim.
- **`search` widens pagination params.** `page`/`pageSize` are `string | number` at the signature level because they originate from a query string; `normalizePagination` (inside the repository layer) coerces and bounds them.
- **`findOwnTickets` is exact-match, not regex.** The `search` email spec is a substring/regex match intended for staff; reusing it here would leak tickets whose address merely contains the queried address.
- **`updateStatus` has no reject path.** Only `updateStatusById` can produce a `ResponseReject` (404). Once the document is loaded, the operation is unconditional.
- **No soft-delete.** Unlike the `orders` module, there is no `hardDelete` flag; `remove` is permanent.
