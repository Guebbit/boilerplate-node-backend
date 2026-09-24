---
source: src/modules/feedback/service.ts
sha256: e921b534bffbef63d415b94648b975dbbc94c4afe10400ffd2bba44204b902e1
generated_at: 2026-09-23T18:41:19.068321+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/service.ts

## Purpose

Service layer for the feedback (contact-request) module. Owns the business logic for creating tickets (including anti-bot screening and operator email notification), paginated search, status/notes updates, hard deletion, and per-caller data export. Controllers in `./controllers` are thin wrappers that validate input and hand the payload to these functions.

## Key elements

- **`create(payload)`** — Persists a new feedback ticket. Checks the honeypot field (`payload.website`) and calls `checkEmailPolicy` (disposable-domain check, off by default). If either signals spam, the row is stored with `status: spam` and **no** notification email is sent. The caller still receives a `201` in both cases. For legitimate submissions, enqueues an operator notification email built in `getDefaultLocale()` (the operator's language, not the submitter's).
- **`toFeedbackStatus(status?)`** — Defensively narrows an arbitrary string onto the closed `FeedbackRequestStatus` enum. Redundant at the HTTP boundary (Zod already rejects with 422), but protects `updateStatus` against non-HTTP callers.
- **`notifyMailbox()`** — Resolves the operator notification address at call time from `NODE_CONTACT_NOTIFY_EMAIL` → `NODE_SMTP_SENDER` → `''`. Read per invocation so the value can change without a restart.
- **`search(filters, context?)`** — Paginated query by status, email fragment, or free-text. Emits `ADMIN_FEEDBACK_VIEWED` audit event only when `context` is provided. `page`/`pageSize` are widened to `string | number` because they arrive from a query string.
- **`updateStatus(feedback, payload)`** — Patches `status` and/or `adminNotes` on an already-loaded document and saves. Stamps `respondedAt` only on the _first_ transition to `resolved`; re-resolving does not move the timestamp.
- **`updateStatusById(id, payload, context?)`** — Loads by id (404 if absent), delegates to `updateStatus`, then emits `ADMIN_FEEDBACK_STATUS_UPDATED` on success.
- **`remove(id, context?)`** — Loads by id (404 if absent), hard-deletes the document, emits `ADMIN_FEEDBACK_DELETED`. No soft-delete tier exists in this module.
- **`findOwnTickets(email)`** — Paginated exact-match read for a caller's data export. Uses `findAll` with a raw `{ email }` filter (not the `search` email spec, which is a regex). Intended to sit behind `NODE_EXPORT_INCLUDE_FEEDBACK`; the caller decides whether to invoke it.
- **`feedbackRequest`** (barrel export, truncated in source) — The object controllers import; bundles the above functions under a single namespace.

## Relationships

| Neighbor                                        | Interaction                                                                                                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@infrastructure/adapters/antibot`              | `create` calls `checkEmailPolicy(email)` to screen disposable domains.                                                                                                            |
| `@infrastructure/adapters/mailer`               | `create` calls `enqueueEmail` to send the operator notification (fire-and-forget with `.catch` → `logger.error`).                                                                 |
| `@infrastructure/adapters/logger`               | Logs a structured error if the notification email job rejects.                                                                                                                    |
| `@infrastructure/http/response`                 | `generateSuccess` / `generateReject` shape every `updateStatus*` and `remove` return; `ResponseSuccess` / `ResponseReject` are the union types.                                   |
| `@infrastructure/i18n` (`catalog`, `context`)   | `t('generic.error-not-found')` for 404 messages; `getDefaultLocale()` for the operator email locale.                                                                              |
| `@infrastructure/observability/audit`           | `recordAudit` emits events in `search`, `updateStatusById`, and `remove` when a `context` is present.                                                                             |
| `@infrastructure/persistence/search`            | `readAll` + `MAX_CONFIGURED_PAGE_SIZE` drive `findOwnTickets` pagination; `PaginatedMeta` is the meta shape in `search`.                                                          |
| `@infrastructure/persistence/create-repository` | `Lean` type used in `findOwnTickets` return.                                                                                                                                      |
| `modules/feedback/audit`                        | `feedbackAuditActions` supplies the action constants for every `recordAudit` call.                                                                                                |
| `modules/feedback/controllers/*`                | All four controllers (`post-feedback-contact`, `get-feedback`, `put-feedback-status`, `delete-feedback`) import the `feedbackRequest` barrel and delegate to the functions above. |

## Notes

- **Honeypot field is ephemeral.** `payload.website` is validated by the Zod contract but is neither persisted in `FeedbackRequestDocument` nor ever read back. A non-empty value silently flips the ticket to `spam`; the bot still gets `201`.
- **Operator email locale is pinned.** `contactRequestEmail` is called with `getDefaultLocale()` explicitly, _not_ with the caller's `CallerContext`. The submitter's `subject`/`message` pass through verbatim.
- **`context` is an audit gate, not a permission gate.** Passing `undefined` skips `recordAudit` but does not block the operation. This is the mechanism that lets tests and internal callers use the same functions without emitting events.
- **No soft delete.** Unlike the `orders` module, there is no `hardDelete` flag; `remove` is always a hard delete.
- **`findOwnTickets` is exact-match by design.** The `search` endpoint's `email` filter is a regex for staff; reusing it here would risk leaking another user's ticket whose address is a superstring.
- **Stryker mutation-testing suppression** wraps the `logger.error` fallback in `create`; the surrounding `void enqueueEmail(...).catch(...)` is intentionally untested for mutation.
