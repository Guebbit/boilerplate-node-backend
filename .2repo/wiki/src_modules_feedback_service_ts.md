# src/modules/feedback/service.ts

## Purpose

Domain service for feedback (contact) tickets: creating a ticket with operator notification, paginated search, and status triage. Sits between the thin HTTP controllers and the repository, owning the one non-trivial mapping rule (raw string → closed `FeedbackRequestStatus` enum) and the "create + notify" pairing that used to be split across layers.

## Key elements

- **`toFeedbackStatus(status?)`** (internal) — Maps a raw string to a `FeedbackRequestStatus` member or `undefined`. An invalid value on a READ narrows the search to zero results (`{ status: undefined }` matches nothing); on a WRITE it is unreachable because the generated Zod enum rejects it with 422 first.
- **`notifyMailbox()`** (internal) — Resolves the operator notification address from `NODE_CONTACT_NOTIFY_EMAIL` → `NODE_SMTP_SENDER` → `''`. Read per call (not captured at import) so a deployment can change it without a restart.
- **`create(payload)`** — Persists a new ticket (status `new`, trimmed/lowercased fields) and fires a best-effort operator email via `enqueueEmail`. The email is built in `getDefaultLocale()` (operator's language), not the caller's locale.
- **`search(filters?, context?)`** — Paginated query with optional status/email/free-text filters. Emits `ADMIN_FEEDBACK_VIEWED` audit event only when a `CallerContext` is supplied.
- **`updateStatus(feedback, payload)`** — Mutates an already-loaded document: applies new status/adminNotes, stamps `respondedAt` once on first `resolved`, then saves.
- **`updateStatusById(id, payload, context?)`** — Loads by id (404 reject if missing), delegates to `updateStatus`, emits `ADMIN_FEEDBACK_STATUS_UPDATED` on success when context is present.
- **`feedbackRequestService`** — Barrel object re-exporting the four functions above; this is what the controllers import.

## Relationships

| Neighbor | Interaction |
|---|---|
| `./repository` | All persistence (`create`, `search`, `findById`, `save`) goes through `feedbackRequestRepository`. |
| `./model` | Imports `FeedbackRequestDocument` type used as the read/write shape. |
| `./emails` | `contactRequestEmail` builds the operator notification template (locale + payload). |
| `./audit` | `feedbackAuditActions` provides the named action constants for audit events. |
| `@infrastructure/http/response` | `generateSuccess` / `generateReject` shape the HTTP response objects returned by `updateStatus` / `updateStatusById`. |
| `@infrastructure/http/request` | `CallerContext` type parameterises `search` and `updateStatusById` for audit correlation. |
| `@infrastructure/i18n` | `t()` for the 404 message; `getDefaultLocale()` for the operator email locale. |
| `@infrastructure/adapters/mailer` | `enqueueEmail` queues the operator notification. |
| `@infrastructure/adapters/logger` | `logger.error` logs a failed email enqueue (fire-and-forget, does not reject the `create` promise). |
| `@infrastructure/observability/audit` | `emitAuditEvent` / `buildAuditEvent` publish view and status-change events. |
| `@infrastructure/persistence/search` | `PaginatedMeta` type in the `search` return shape. |
| `controllers/get-feedback.ts` | Calls `feedbackRequestService.search`. |
| `controllers/post-feedback-contact.ts` | Calls `feedbackRequestService.create`. |
| `controllers/put-feedback-status.ts` | Calls `feedbackRequestService.updateStatusById`; its Zod schema guarantees a valid enum before the service sees the value. |

## Notes

- **Invalid-status semantics are asymmetric by design.** On a READ, an unparseable status silently narrows to zero rows. On a WRITE, the caller never reaches `toFeedbackStatus` because the controller's Zod enum rejects it with 422. The service never "falls through to return everything."
- **Operator email is deliberately caller-agnostic.** It uses `getDefaultLocale()` (server/operator locale), not the submitter's `CallerContext`. The customer's own text (`subject`, `message`) passes through verbatim.
- **`respondedAt` is idempotent.** It is stamped only when the ticket first transitions to `resolved`; re-resolving does not move the timestamp.
- **Audit emission is opt-in per call.** A `undefined` `context` suppresses the audit event entirely (intended for tests or future non-HTTP callers).
- **Email failure is non-fatal.** A failed `enqueueEmail` is caught and logged; `create` still resolves with the created document.
