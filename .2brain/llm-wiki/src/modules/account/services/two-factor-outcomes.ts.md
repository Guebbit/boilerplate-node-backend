---
source: src/modules/account/services/two-factor-outcomes.ts
sha256: 44e09922e0c608dcfd2603272abb1a29a7d76d54eedb3f1cc82cb483c750aa8e
generated_at: 2026-10-29T02:46:28.901512+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-outcomes.ts

## Purpose

Shared "response construction" layer for two-factor authentication flows. It builds the rejections, successes, out-of-band email notices, and public method summaries that 2FA operations return to callers. It owns no flow itself—every two-factor endpoint (challenge, enrollment, reauth, lockout) reaches in here to shape its answers so that wording, status codes, audit logging, and cooldown semantics stay consistent across call sites.

## Key elements

- **`notifyChange`** – Fire-and-forget email sent when an account's 2FA factors are added, replaced, or removed. Catches and logs queue failures so a mail outage never turns a completed change into an error.
- **`audited`** – Wraps any `Promise<ResponseSuccess | ResponseReject>` to record an audit entry (action, success/failure, method) while passing the result through untouched. Used for enrollment, disable, and other method-scoped actions.
- **`rejectWrongCode(user)`** – Returns a 422 rejection for a wrong/replayed code. If the user document was modified (e.g., an attempt budget was decremented), it persists first; a lost optimistic-concurrency race is logged as a warning, not rethrown.
- **`rejectLocked()`** – Returns a 429 rejection with the `RATE_LIMITED` error code for a locked account.
- **`notifyLocked`** – Fire-and-forget email informing the holder their 2FA checks are locked, including the lock duration in minutes.
- **`summarize(handler, user)`** – Builds a `TwoFactorMethodSummary` for one method. Deliberately omits `enrolledAt` so a login-stage caller cannot learn when a factor was armed.
- **`tooSoon(seconds)`** – Returns a 429 resend-cooldown rejection using the flow-specific error code and localized copy.
- **`armedEntries(user)`** – Returns the user's enrolled 2FA methods in the registry's canonical order (not enrollment order).
- **`deliverArmedCode(user, method, context)`** – Delivers a code for one armed, delivered method. Returns 422 for unknown/unarmed methods, a cooldown rejection if recently used, or the delivery result after persisting. Enforces its own cooldown rather than relying on a route-level limiter.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** – Emits `logger.warn` for fire-and-forget mail failures and for lost-race persistence errors.
- **`src/infrastructure/http/response.ts`** – Uses `generateReject` / `generateSuccess` and the `ResponseReject` / `ResponseSuccess` types to construct every return value.
- **`src/infrastructure/i18n/index.ts`** – Calls `t(...)` for all user-facing messages (wrong-code, locked, resend-too-soon, not-delivered).
- **`src/infrastructure/observability/audit.ts`** – Calls `recordAudit` inside `audited` to log every 2FA action with its outcome.
- **`src/infrastructure/persistence/versioning.ts`** – Uses `isLostRace` to distinguish a benign "account already deleted" race from a real persistence error in `rejectWrongCode`.
- **`src/modules/account/cooldown.ts`** – Calls `resendTooSoon` (via the `tooSoon` helper) to build the standardized cooldown rejection.
- **`src/modules/account/emails.ts`** – Pulls `twoFactorChangedEmail`, `twoFactorLockedEmail`, `recipientLocale`, `greetableName`, and the `TwoFactorChange` type to compose notification bodies.
- **`src/modules/account/services/mail.ts`** – Calls `sendAccountMail` for both `notifyChange` and `notifyLocked`.
- **`src/modules/account/two-factor/index.ts`** – Imports `DELIVERED_CODE_RESEND_SECONDS`, `MFA_LOCK_MS`, `deliveryCooldownRemaining`, `orderedEntries`, and the `TwoFactorMethodHandler` type.

## Notes

- `RESEND_TOO_SOON_CODE` is module-private by design: clients identify the condition from the response payload, not from an exported constant.
- `notifyChange` and `notifyLocked` are intentionally fire-and-forget (`.catch` swallows the rejection). The underlying state change/lock is already committed; a transient mail-queue outage must not surface as an API error.
- `rejectWrongCode` only persists when `user.isModified()` is true. A pure wrong-code guess (no budget spent) writes nothing, so a burst of misses cannot produce optimistic-concurrency collisions.
- `deliverArmedCode` enforces the delivery cooldown itself (not just the route limiter) because it sends outbound mail on the caller's say-so; the route limiter alone would be insufficient.
- `summarize` is the *login-stage* view. The authenticated owner's richer view (including `enrolledAt`) is provided by a different function (`twoFactorStatus`), keeping the two audiences' information boundaries separate.
