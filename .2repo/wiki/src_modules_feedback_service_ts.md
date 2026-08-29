# src/modules/feedback/service.ts

## Purpose

Domain service for feedback-request lifecycle: creating contact submissions, searching/filtering them, and updating their status. It sits between the HTTP controllers and the repository, owning the rules for status mapping, operator notification email, and audit emission so that no controller duplicates that logic.

## Key elements

- **`STATUS_MAP`** — closed-string → `FeedbackRequestStatus` enum lookup. Adding a status means one entry here; no other branch to touch.
- **`toFeedbackStatus(status?)`** — maps a raw query/body string to the enum, returning `undefined` for anything not in the map. The "narrow-to-nothing, never fall-through" guard for the read path.
- **`notifyMailbox()`** — resolves the operator notification address from `NODE_CONTACT_NOTIFY_EMAIL` → `NODE_SMTP_SENDER` → `''`, read at call time so deployments can rotate it without restart.
- **`create(payload)`** — trims/normalizes the payload, persists via `feedbackRequestRepository.create`, then enqueues a single notification email to the support mailbox (built in `NODE_DEFAULT_LOCALE`, *not* the submitter's locale). Email failure is logged, never thrown.
- **`search(filters?, context?)`** — paginated query. Maps `status` through `toFeedbackStatus` into a scope object. If a `CallerContext` is supplied, emits an `ADMIN_FEEDBACK_VIEWED` audit event.
- **`updateStatus(feedback, payload)`** — mutates `status`, `adminNotes`, and sets `respondedAt` on first transition to `resolved`. Saves and wraps in `ResponseSuccess`.
- **`updateStatusById(id, payload, context?)`** — `findById` → `updateStatus` → `404` reject on miss → `ADMIN_FEEDBACK_STATUS_UPDATED` audit event (with `target_id` and the new status in metadata).
- **`feedbackRequestService`** — aggregated export object (`{ create, search, updateStatus, updateStatusById }`) for convenience import.

## Relationships

- **`./model`** — types `FeedbackRequestDocument` used as the persistence shape throughout.
- **`./repository`** — `feedbackRequestRepository` is the sole data-access dependency (create, search, save, findById).
- **`./emails`** — `contactRequestEmail` builds the operator notification template.
- **`./audit`** — `feedbackAuditActions` supplies the action constants for audit events.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape the controller-facing return values.
- **`@infrastructure/i18n`** — `getDefaultLocale` and `t` (for the 404 message).
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` fires the notification without blocking the response.
- **`@infrastructure/adapters/logger`** — `logger.error` on email-queue failure.
- **`@infrastructure/observability/audit`** — `emitAuditEvent` / `buildAuditEvent` for the two admin actions.
- **`@infrastructure/persistence/search`** — `PaginatedMeta` type for the search result shape.
- **`@infrastructure/http/request`** — `CallerContext` type threaded through `search` and `updateStatusById`.
- **Controllers** (`get-feedback.ts`, `post-feedback-contact.ts`, `put-feedback-status.ts`) — the only producers of calls into this module; they pass `CallerContext` and receive the typed responses.

## Notes

- `STATUS_MAP` is intentionally **lowercase-only**. Uppercase aliases would accept values the OpenAPI contract forbids; the Zod-generated schema 422s them before they reach `updateStatusById`, but the unguarded `search` path would silently fall through if an alias existed.
- The notification email in `create` is built in `getDefaultLocale()` (the operator's language), **not** the submitter's locale. It deliberately takes no `CallerContext`.
- `search` accepts `page`/`pageSize` as `string | number` because they arrive from a query string; the repository's `normalizePagination` handles coercion and bounds.
- `context` is optional on both `search` and `updateStatusById`; omitting it (e.g. in tests or internal reuse) suppresses audit emission entirely.
- The module re-exports the four functions both individually and as `feedbackRequestService`—import either way; they are the same references.
