---
source: src/modules/account/services/profile.ts
sha256: 698bb317b39c67734924fe3e4552da23f773fbed8cc7aa12ae12e19f34afbf13
generated_at: 2026-11-14T18:48:49.893661+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/profile.ts

## Purpose

Service layer for the caller's own profile read and update (`GET /account`, `PUT`/`PATCH /account`). Handles username, locale, phone, website, image, and analytics consent. Email and password changes are intentionally out of scope and delegated to sibling modules (`./email-change`, `./password`).

## Key elements

- **`getOwnProfile(userId, context)`** — Reads the caller's own profile via `findByIdWithPendingEmail` (so `pendingEmail` is visible to the owner) and emits the `USER_PROFILE_VIEWED` analytics event.
- **`ProfileFields`** (type) — The writable field set for `PUT`/`PATCH`. All optional; absence means "leave unchanged." Includes server-produced image fields (`imageUrl`, `thumbnailUrl`, `pendingImageKey`) that never originate from the client body.
- **`writeProfile(user, fields)`** (internal) — Persists fields via `accountUserService.updateOwnProfile`. Detects an analytics-consent withdrawal (`true → false`) and enqueues an `ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN` outbox event inside the same transaction. Nudges the outbox on success.
- **`updateProfile(userId, changes, context)`** — Public entry point. Wraps the write in `withOwnAccount`, records an `AUTH_PROFILE_UPDATED` audit entry, maps errors through `rejectDatabaseEnvelope`, and shapes the HTTP response via `generateSuccess(…, 200)`.

## Relationships

- **`@modules/users/friends/account`** (`accountUserService`) — performs the actual DB reads (`findByIdWithPendingEmail`), writes (`updateOwnProfile`), and audit-metadata diffing (`userAuditChanges`).
- **`@modules/users/index`** — supplies the `UserDocument` type used throughout.
- **`@types`** — provides `CallerContext` and `UpdateAccountRequest` (from `src/types/auth-context.ts`).
- **`./caller`** (`withOwnAccount`) — loads the authenticated account and binds the session for the write transaction.
- **`@kernel/outbox`** — `enqueueOutboxEvent` commits the consent-withdrawal event atomically with the save; `nudgeOutbox` triggers dispatch.
- **`../analytics` / `../audit` / `../events`** — module-local event-name, action-name, and event-type constants.
- **`@infrastructure/http/response` / `errors`** — response envelope shaping and error normalization.
- **`@infrastructure/observability/analytics` / `audit`** — cross-cutting event emission and audit recording.

## Notes

- `pendingEmail` is `select: false` on the base model; this file deliberately uses `findByIdWithPendingEmail` instead of `getById` so the owner sees their own pending change without leaking it to admin lookups.
- The analytics `USER_PROFILE_VIEWED` event is emitted here (not inside `getById`) to avoid miscounting admin reads as the user's own view.
- Image URLs are always server-decided (from `readUploadedImage` in the controller); a client-supplied string is not a valid value for `imageUrl`.
- Consent withdrawal is only announced when the *stored* value was `true` and the incoming value is `false`; `undefined → false` is a no-op (the user never opted in).
- No credentials (`password`, `email`, `admin`, `active`) are writable through this path; those belong to `/users` or the password-change flow.
