---
source: src/modules/account/services/two-factor-outcomes.ts
source_sha256: b167437f63cb8844f6ae4e715b8433466fb35680a49019e8a2c9db6c2ea5af3d
context_sha256: 739ea975b4e36ece0b25a58ce2a71633b384b3e516e91f7511176e1526da9e89
generated_at: 2026-11-22T03:43:57.856863+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/two-factor-outcomes.ts

## Purpose
Internal helper module holding what the two-factor flows say back to callers: audited outcomes, refusal responses, out-of-band email notices, and a method's public summary. It has no flow of its own; the challenge, enrollment, lockout and reauth services share it so their refusals, cooldowns and notices stay consistent.

## Key elements
- `notifyChange(user, change, method, context)` — fire-and-forget email that an account's second factors changed. Queue failures are only logged as warnings.
- `audited(outcome, context, action, method)` — wraps a response promise, calls `recordAudit` with `success` or `failure` plus `{ method }`, and returns the result unchanged.
- `rejectWrongCode(user)` — returns a 422 "wrong code" rejection. If the user document `isModified()`, it first persists the two-factor methods via `accountUserService.persistTwoFactorMethods`, so spent delivered-code attempts are saved. A lost race (account gone) is logged and swallowed; other errors are rethrown.
- `rejectLocked(user, now = new Date())` — returns a 429 via `generateRateLimited`. The retry-after is the remaining time on `user.mfaLockedUntil` (at least 1 second). If the lock is missing or expired on the loaded document, it falls back to the full `MFA_LOCK_MS`.
- `notifyLocked(user, context)` — fire-and-forget email telling the holder that wrong codes locked their 2FA checks. It states the lock length in minutes (`MFA_LOCK_MS / MINUTE_MS`).
- `summarize(handler, user)` — builds a `TwoFactorMethodSummary`: `method`, `delivers`, optional `target`, and `resendAfter` (`DELIVERED_CODE_RESEND_SECONDS`) for delivered methods. It deliberately omits `enrolledAt`.
- `tooSoon(seconds)` — binds this flow's error code (`TWO_FACTOR_RESEND_TOO_SOON`) and copy onto `resendTooSoon`, so clients can render a resend countdown.
- `armedEntries(user)` — the user's enrolled factors (those with `enrolledAt`), in the registry's order from `orderedEntries`.
- `deliverArmedCode(user, method, context)` — shared send path for the login challenge and signed-in endpoints:
  - An unarmed or unknown method, or one with no `send`, gives a 422.
  - A method still in its cooldown gives `tooSoon`.
  - Otherwise it sends the code, persists the methods, and returns a success carrying the delivery.

## Relationships
- `../two-factor` (the registry, not in the neighbor list) supplies `orderedEntries`, `deliveryCooldownRemaining`, `TwoFactorMethodHandler` and the constants `DELIVERED_CODE_RESEND_SECONDS` and `MFA_LOCK_MS`.
- `../emails` builds the notice content (`twoFactorChangedEmail`, `twoFactorLockedEmail`) and the locale and name helpers. `./mail` (`sendAccountMail`) queues the messages.
- `../cooldown` supplies `resendTooSoon`.
- `@infrastructure/http/response` provides `generateReject`, `generateRateLimited` and `generateSuccess`, plus the response types.
- `@infrastructure/observability/audit` provides `recordAudit`. `@infrastructure/persistence/versioning` provides `isLostRace`. `@infrastructure/adapters/logger` provides `logger`.
- `@infrastructure/i18n` provides `t` for the localized messages.
- `@domain-primitives/time` provides `MINUTE_MS`.
- `@modules/users/friends/account` (`accountUserService`) persists the two-factor methods.
- The sibling services (`two-factor-challenge`, `two-factor-enrollment`, `two-factor-lockout`, `reauth`) are the likely callers. The file itself only states that it is shared by the two-factor flows. The unit tests are in `src/modules/account/tests/unit/two-factor-outcomes.test.ts`.

## Notes
- Persisting in `rejectWrongCode` only when the document is modified is intentional. Dropping the write would turn the attempt ceiling into no ceiling, while writing on every miss would let bursts of wrong TOTPs collide with the one right code.
- `rejectLocked` takes `now` as a parameter so tests can pin the clock.
- Unarmed and unknown methods return the same 422 in `deliverArmedCode`, so a wrong guess reveals nothing. An armed method in its cooldown does reveal that it is armed.
- The cooldown is enforced here, not only by the route limiter, because these endpoints send mail on the caller's say-so.
- `RESEND_TOO_SOON_CODE` is deliberately module-private.
