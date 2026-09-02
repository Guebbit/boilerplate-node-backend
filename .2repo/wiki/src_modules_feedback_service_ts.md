# src/modules/feedback/service.ts

## Purpose

Domain service for feedback tickets: creates contact requests (with an operator notification email), searches them with pagination, triages status, and supports deletion and account data-export retrieval. It is the single place where the feedback write-path, read-path, and audit emissions live, so controllers stay thin.

## Key elements

- **`toFeedbackStatus`** – Maps a raw string to the closed `FeedbackRequestStatus` enum; returns `undefined` for any value outside the enum. Used by both `search` (narrows to no match) and `updateStatus` (no-op if invalid).
- **`notifyMailbox`** – Resolves the operator notification address from `NODE_CONTACT_NOTIFY_EMAIL` → `NODE_SMTP_SENDER` → `''`, read per call to allow runtime changes.
- **`create(payload)`** – Persists a new ticket. If `payload.website` (honeypot) is non-empty, stores it as `spam` and skips the notification email. Otherwise enqueues a contact-request email to the operator mailbox, built in `NODE_DEFAULT_LOCALE` (not the caller's locale).
- **`search(filters?, context?)`** – Paginated search by status, email, or free text. Emits `ADMIN_FEEDBACK_VIEWED` audit event when a `CallerContext` is supplied.
- **`updateStatus(feedback, payload)`** – Applies a status/notes patch to an already-loaded document; stamps `respondedAt` only the first time a ticket reaches `resolved`.
- **`updateStatusById(id, payload, context?)`** – Loads by id (404 if missing), delegates to `updateStatus`, emits `ADMIN_FEEDBACK_STATUS_UPDATED` on success.
- **`remove(id, context?)`** – Hard-deletes a ticket by id (no soft-delete tier); emits `ADMIN_FEEDBACK_DELETED` on success.
- **`findOwnTickets(email)`** – Exact-match `findAll` (not the regex `search` email spec) capped at 100 k rows; used by the account export path.
- **`feedbackRequestService`** – Barrel object bundling the above for controller imports.

## Relationships

- **`./repository`** – All persistence goes through `feedbackRequestRepository` (`create`, `search`, `findById`, `save`, `deleteOne`, `findAll`).
- **`./model`** – `FeedbackRequestDocument` type used throughout.
- **`./audit`** – `feedbackAuditActions` provides the action identifiers for `buildAuditEvent`.
- **`./emails`** – `contactRequestEmail` builds the operator notification template.
- **`@infrastructure/http/response`** – `generateSuccess` / `generateReject` shape the HTTP envelope returned by `updateStatusById` and `remove`.
- **`@infrastructure/http/request`** – `CallerContext` type carried by audit-emitting functions.
- **`@infrastructure/i18n`** – `getDefaultLocale` (operator email locale) and `t` (404 error message).
- **`@infrastructure/adapters/mailer`** – `enqueueEmail` dispatches the operator notification.
- **`@infrastructure/adapters/logger`** – `logger.error` for notification-failure logging.
- **`@infrastructure/observability/audit`** – `emitAuditEvent` / `buildAuditEvent` for all audit emissions.
- **`@infrastructure/persistence/search`** – `PaginatedMeta` type in the `search` return shape.
- **Controllers (`post-feedback-contact`, `get-feedback`, `put-feedback-status`, `delete-feedback`)** – Import `feedbackRequestService` and delegate to the functions above.
- **`../account/services/export`** – Calls `findOwnTickets` for the user's data-export bundle.

## Notes

- **Honeypot:** `payload.website` is declared in the request contract but never persisted; a non-empty value silently marks the ticket `spam` and suppresses the notification email. The bot still receives a `201`.
- **Invalid status on READ vs WRITE:** On read, an unrecognized status string resolves to `undefined` scope, which matches no documents (narrowing-to-nothing). On write, the generated Zod enum rejects the value with a 422 before `toFeedbackStatus` is ever called — the undefined path is unreachable on the write side.
- **Operator email language:** The notification is deliberately built in `NODE_DEFAULT_LOCALE`, not the submitter's locale, and takes no `CallerContext`. The customer's own words pass through untouched.
- **`findOwnTickets` vs `search`:** The account-export path uses an exact-match `findAll` to avoid leaking tickets whose email merely *contains* the caller's address as a substring.
- **No soft-delete:** Unlike `orders`, this module has no `hardDelete` flag; `remove` is always a permanent `deleteOne`.
- **Audit emission is optional:** Every `context?` parameter, when omitted, suppresses the audit event — intended for tests and potential internal reuse as a plain query helper.
