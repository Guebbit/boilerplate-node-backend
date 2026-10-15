---
source: src/modules/account/services/profile.ts
sha256: 883f119c7304419eff5b7b91e678f042ec321967cc4c4e7237e98548facada54
generated_at: 2026-10-15T10:02:01.425282+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/profile.ts

## Purpose

Service layer for reading and updating the caller's own profile (`GET`/`PUT`/`PATCH /account`). It orchestrates the update pipeline—email-change routing, cooldown gating, mail-budget check, persistence, and notification—while keeping each concern delegated to a dedicated neighbor module.

## Key elements

- **`getOwnProfile(userId, context)`** — Reads the caller's account via `userService.findByIdWithPendingEmail` so the `pendingEmail` field (normally `select: false`) is visible to the user's own client. Emits a `USER_PROFILE_VIEWED` analytics event scoped to self-views only.
- **`updateProfile(userId, changes, context)`** — Main write entry point. Loads the account via `withOwnAccount`, routes `changes.email` through `applyEmailChangeRequest`, then delegates to `writeProfile`. On success records an audit event and wraps the result in a `200` response.
- **`writeProfile`** *(internal)* — Checks the email-change resend cooldown before anything else; if the cooldown has not elapsed, returns a "too soon" reject immediately (no budget spent). Otherwise calls `saveProfile`.
- **`saveProfile`** *(internal)* — Checks the recipient mailbox's send budget (only when a genuine email change is requested and `pendingEmail` is set), then calls `userService.update` with the remaining fields and fires `notifyEmailChangeRequested` if the change was newly requested.
- **`ProfileFields`** *(type)* — The validated field bag for a profile write: `email`, `username`, `locale`, `phone`, `website`, `analyticsConsent`, plus server-only image fields (`imageUrl`, `thumbnailUrl`, `pendingImageKey`). Deliberately excludes `password`, `admin`, `active`.

## Relationships

- **`./email-change`** — `applyEmailChangeRequest` decides whether the email field is a genuine change, a no-op, or a conflict; `notifyEmailChangeRequested` sends the confirmation mail after the write.
- **`./caller`** — `withOwnAccount` loads the user and asserts ownership before any write logic runs.
- **`../cooldown`** — `resendTooSoon` produces the standard 429-shaped reject when the per-account email-change cooldown has not elapsed.
- **`../mail-budget`** — `mailRecipientRefusal` gates the write on the recipient mailbox's send budget before anything is persisted.
- **`../analytics` / `../audit`** — Supply the typed event/action constants (`accountAnalyticsEvents`, `accountAuditActions`) used in the analytics and audit emissions.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` + `buildAnalyticsBase` record the self-profile-view event.
- **`@infrastructure/observability/audit`** — `recordAudit` logs a successful profile update.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape the HTTP envelope returned to the controller.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` converts unexpected DB/infra errors into a standard reject.
- **`@infrastructure/i18n`** — `t` localises user-facing messages (conflict, too-soon, success).

## Notes

- `email` is **never** passed to `userService.update` directly. `applyEmailChangeRequest` writes `pendingEmail` (and `verified` stays untouched), so a pending change does not flip the account's current verification state.
- Cooldown is evaluated **before** the mail-budget check, meaning a paced request costs zero sends.
- `getOwnProfile` intentionally emits its analytics event outside of `userService.getById`; an unconditional emit there would conflate admin `get-user-item` lookups with the user's own views.
- `imageUrl` / `thumbnailUrl` / `pendingImageKey` originate from the controller's own `readUploadedImage` call—they are server-produced and must not be trusted from the wire body.
- The file does **not** import a logger or the database runtime directly; those are reached transitively through `userService` and the HTTP-error helpers.
