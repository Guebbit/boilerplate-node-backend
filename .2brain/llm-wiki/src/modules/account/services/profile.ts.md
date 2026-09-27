---
source: src/modules/account/services/profile.ts
sha256: 0d13d6e856ac58074ee007103c877b411753f670d5ff289c26a5a50239d5dc77
generated_at: 2026-09-27T14:30:35.669693+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/profile.ts

## Purpose

Service layer for the "maintain my own account" side of the account module: reading the caller's profile, changing the password (via reset link or with current-password verification), and self-deleting the account. It is deliberately split from `./authentication` on the proving-vs-maintaining boundary—authentication answers "who is this," this file answers "change something about the account I'm already in."

## Key elements

- **`validatePasswordChange(password, passwordConfirm)`** — Zod-based check that the two fields match. Returns `ResponseErrorItem[]`. Exported so `reset-confirm` can validate *before* spending a one-time token.
- **`passwordChange(user, password, passwordConfirm, beforeSave?)`** — The single funnel every password write flows through. Validates → checks breached-passwords → optionally runs `beforeSave` → saves → revokes all refresh tokens. Revoke failure is swallowed (defense-in-depth, not a reason to report failure). The `beforeSave` hook guarantees atomic compound writes (e.g. `markVerified` alongside the password).
- **`getOwnProfile(userId, context)`** — Reads the caller's profile via `userService.findByIdWithPendingEmail` (exposes `pendingEmail`, which is `select: false` on the standard read). Emits a `user_profile_viewed` analytics event scoped to the user's own view, not admin lookups.
- **`passwordResetChange(user, password, passwordConfirm, context)`** — Wraps `passwordChange` with `markVerified` as `beforeSave` (the reset token proved mailbox possession). On success: records audit, fires a confirmation email (recipient-locale first, request locale as fallback), both fire-and-forget.
- **`removeOwnAccount(user, context)`** — Hard-deletes the account. Captures `email`, `username`, `locale`, `_id` *before* the write. On success: records audit, emits analytics, sends a goodbye email. Wraps `userService.remove` rather than emitting inside it, so the admin `DELETE /users/:id` path doesn't double-report or misattribute the event.

## Relationships

- **`src/modules/account/services/authentication.ts`** — Imports `verifyOwnPassword` (used by the `passwordChangeWithCurrent` flow, defined elsewhere in the service folder, to gate the "I know my current password" path before calling `passwordChange`).
- **`src/modules/account/emails.ts`** — Imports `resetConfirmEmail`, `deleteConfirmEmail`, `emailChangeNoticeEmail`, and `recipientLocale` to compose outbound mail and resolve the recipient's language.
- **`src/modules/account/roles.ts`** — Imports `isUnrestrictedCaller` to determine the actor's role (`admin` vs `user`) for audit-log entries.
- **`src/modules/account/analytics.ts` / `src/modules/account/audit.ts`** — Provides the canonical event names (`accountAnalyticsEvents`) and action strings (`accountAuditActions`) used in `emitAnalyticsEvent` / `recordAudit` calls.
- **`src/infrastructure/security/breached-passwords/index.ts`** — `assertPasswordNotBreached` is called inside `passwordChange` as a hard gate before any write.
- **`src/infrastructure/http/response.ts`** — All return values are shaped via `generateSuccess` / `generateReject` / `validationErrors` for uniform API envelopes.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseEnvelope` catches DB failures in the `passwordChange` chain.
- **`src/infrastructure/http/schemas.ts`** — Imports `optionalBooleanSchema` (used in the file's schema definitions).
- **`src/infrastructure/i18n/index.ts`** — `t()` localises user-facing validation messages.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` + `buildAnalyticsBase` for all analytics emissions.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` for structured audit-log entries.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` for non-fatal failures (e.g. a failed role lookup during audit).
- **`src/infrastructure/persistence/normalize-email.ts`** — `normalizeEmail` is imported via `@modules/users` and used when comparing or persisting email addresses.

## Notes

- **Emit-in-the-wrapper, not the shared function.** Analytics and audit events live in `passwordResetChange` / `removeOwnAccount`, *not* inside `passwordChange` or `userService.remove`. The admin endpoints (`DELETE /users/:id`, `get-user-item.ts`) share those lower-level functions and would otherwise double-report or misattribute `actor_user_id` / `actor_role`.
- **`beforeSave` ordering is contractual.** The hook runs *after* all validation/breach refusals and *before* `save`. This means a rejected password cannot leave a side-effect (like a role promotion from `markVerified`) on the document.
- **`passwordResetChange` marks the email verified; `passwordChangeWithCurrent` does not.** The reset token was delivered to the mailbox, so it proves possession. Typing a known password does not.
- **Fire-and-forget after the primary write.** Confirmation emails, audit lookups, and analytics in `removeOwnAccount` are all `void` / `.catch`-swallowed after the write succeeds—a queue hiccup or role-lookup failure degrades to a missing mail or audit row, never to a failed user-facing response.
- **`removeOwnAccount` reads fields before deleting.** Because it is a hard delete, `email`, `username`, and `locale` are captured into a local const before `userService.remove` resolves; the goodbye mail is composed from that snapshot.
