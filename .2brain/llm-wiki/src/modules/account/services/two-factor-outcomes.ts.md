---
source: src/modules/account/services/two-factor-outcomes.ts
sha256: 38df6b169d24ac8375ebb2a3b2c998abcf3c90bdc2568c6aa60bc8fdd490b789
generated_at: 2026-11-14T18:54:13.932599+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-outcomes.ts

## Purpose

A leaf helper module that builds the **responses** (success, rejection, rate-limit) and **out-of-band side effects** (audit records, notification emails) shared by every two-factor flow. It owns no orchestration logic itself; the challenge, enrollment, and lockout services call into it to produce consistent user-facing outcomes and to keep their refusal/cooldown behaviour in one place.

## Key elements

- **`notifyChange`** – Fire-and-forget email telling the user a factor was added, replaced, or removed. Catches and logs send failures; never throws.
- **`audited`** – Wraps a `Promise<ResponseSuccess | ResponseReject>` so that `recordAudit` fires for both success and failure before the result is returned.
- **`rejectWrongCode`** – Builds the 422 "wrong code" rejection. Persists the user document **only if** `isModified()` (i.e. a delivered code's attempt budget was actually spent); otherwise skips the write to avoid collision between concurrent wrong-code submissions.
- **`rejectLocked`** – Builds a 429 `RATE_LIMITED` response with a `retryAfter` header derived from `mfaLockedUntil`. Falls back to the full lock duration if the timestamp isn't yet visible on the loaded document.
- **`notifyLocked`** – Fire-and-forget email informing the user their 2FA is locked; same pattern as `notifyChange`.
- **`summarize`** – Produces a `TwoFactorMethodSummary` (name, delivery mode, optional target, optional `resendAfter`) suitable for a caller who has only proved a password. Deliberately omits `enrolledAt`.
- **`tooSoon`** – Delegates to the shared `resendTooSoon` builder with this module's private error code and i18n key.
- **`armedEntries`** – Returns the user's enrolled 2FA method entries in registry (not enrollment) order.
- **`deliverArmedCode`** – Shared code-delivery path: validates the method is armed and delivered, enforces per-method cooldown, sends via the handler, persists, and returns a success. Unarmed and unknown methods both yield the same 422 to prevent enumeration.

## Relationships

- **`@infrastructure/http/response`** – All user-facing responses are built via `generateSuccess`, `generateReject`, and `generateRateLimited`.
- **`@infrastructure/i18n`** – Every user-facing message string goes through `t()` for locale resolution.
- **`@infrastructure/observability/audit`** – `audited` calls `recordAudit` to log the method, action, and outcome.
- **`@infrastructure/persistence/versioning`** – `isLostRace` is used in `rejectWrongCode` to distinguish a lost optimistic-concurrency write from a real error.
- **`@infrastructure/adapters/logger`** – Warn-level logs for swallowed email failures and lost-race writes.
- **`src/modules/account/cooldown.ts`** – `resendTooSoon` provides the shared 429 cooldown builder that `tooSoon` wraps.
- **`src/modules/account/emails.ts`** – Supplies the email body builders (`twoFactorChangedEmail`, `twoFactorLockedEmail`) and locale/greeting helpers.
- **`src/modules/account/services/mail.ts`** – `sendAccountMail` is the transport for both fire-and-forget notifications.
- **`src/domain-primitives/time.ts`** – `MINUTE_MS` converts the lock constant into minutes for email copy.
- **`src/modules/account/services/two-factor-challenge.ts`** – Primary caller of `rejectWrongCode`, `summarize`, `deliverArmedCode`, and `tooSoon` during the login challenge step.
- **`src/modules/account/services/two-factor-enrollment.ts`** – Calls `notifyChange`, `audited`, and `summarize` around add/remove/replace operations.
- **`src/modules/account/services/two-factor-lockout.ts`** – Calls `rejectLocked`, `notifyLocked`, and `rejectWrongCode` when the per-account budget is exhausted.
- **`src/modules/account/tests/unit/two-factor-outcomes.test.ts`** – Unit tests covering all exports above.

## Notes

- The module is explicitly **internal**; no HTTP route imports it directly. Flows compose it.
- `RESEND_TOO_SOON_CODE` is module-private (`const`, not `export`). Clients read the code off the response body; they never import this constant.
- `rejectWrongCode` is async even in the no-write path because the persist branch is; callers must `await` or chain.
- `rejectLocked` accepts an optional `now` parameter (defaults to `new Date()`) purely so tests can pin the clock.
- `deliverArmedCode` intentionally does **not** return 404 for an unknown method—it returns the same 422 as an unarmed one, so a probe cannot distinguish "wrong name" from "not enrolled."
- Both notification helpers use `void promise.catch(log)`—a mail-queue outage degrades to a warning, never a user-visible error, because the underlying state change has already committed.
