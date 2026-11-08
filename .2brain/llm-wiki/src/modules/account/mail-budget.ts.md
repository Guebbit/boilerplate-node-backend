---
source: src/modules/account/mail-budget.ts
sha256: 5686cf7d186584f4066dd76d6dde90c8a59c355d7b73b23bc30d7bf5778bdb6f
generated_at: 2026-11-08T04:10:34.814875+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/mail-budget.ts

## Purpose

Enforces a per-recipient mail budget: a hard cap (10 mails / 24 h) on how many outbound messages the app will deliver to a single mailbox, regardless of which account flow (signup, reset, email-change, resend, export, deletion) initiates them. The budget is keyed to the *recipient*, not the caller, so an attacker cannot bypass it by rotating caller identities while targeting the same victim address.

## Key elements

- **`MAIL_RECIPIENT_BUDGET`** (`RateLimitBudget`) — the budget descriptor: 10 per 24 h, keyed by the canonical, pseudonymised mailbox. Sourced from `accountRateLimitData.mailRecipient` (generated) with an explicit `keyedBy` description.
- **`chargeMailRecipient`** *(private)* — spends one unit against a mailbox's budget via `chargeBudget`; returns `{ allowed, retryAfterSeconds }`.
- **`mailRecipientRefusal(address, context)`** — *service-side* door. Calls `chargeMailRecipient`; on success returns `undefined`, on failure records a refusal against the caller and returns a 429 `ResponseReject` with an i18n message and `Retry-After` seconds. Used by services that selected the recipient themselves (resend, stored address) where no request body names it.
- **`mailRecipientLimiter`** (`RequestHandler`) — *route-side* Express middleware. Reads `email` from the JSON body; if absent, calls `next()` immediately. Otherwise charges the budget and either calls `next()` (allowed) or sends a 429 via `refuseRateLimited` with a `Retry-After` header. Mounted before the controller so a refused request never reaches send logic.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — supplies `chargeBudget`, `recordBudgetRefusal`, `readBodyField`, `refuseRateLimited`, and the `BudgetCharge` type that underpin every operation here.
- **`src/infrastructure/persistence/normalize-email.ts`** — `canonicalMailbox` strips `+tag` suffixes and normalises Gmail dots, producing the stable key.
- **`src/infrastructure/security/pseudonymise.ts`** — `pseudonymise('rate-limit', …)` hashes the canonical address so the raw mailbox is never stored as a budget key.
- **`src/infrastructure/http/response.ts`** — `generateReject` builds the structured 429 rejection envelope returned by the service-side door.
- **`src/infrastructure/i18n/index.ts`** / **`context.ts`** — `t('generic.error-rate-limited')` provides the user-facing message.
- **`src/types/rate-limit-budget.ts`** — defines the `RateLimitBudget` shape consumed by `MAIL_RECIPIENT_BUDGET`.
- **`src/types/auth-context.ts`** — `CallerContext` identifies *who* is being audited when a refusal is recorded.
- **`src/modules/account/rate-limits.ts`** — produces the generated data (`rate-limits.generated`) from which the budget numbers are read.
- **`src/modules/account/routes.ts`** — mounts `mailRecipientLimiter` on the relevant mail-sending routes.
- **`src/modules/account/services/verification.ts`**, **`profile.ts`**, **`export.ts`** — call `mailRecipientRefusal` before dispatching a mail to a recipient the service chose.
- **`src/modules/account/tests/integration/mail-recipient-budget.test.ts`** — integration tests exercising both doors.

## Notes

- The window is **24 hours**, deliberately not per-minute, so a slow drip (one mail every few minutes) is also counted and blocked.
- The route-side limiter passes through silently when the body has no `email` field; validation (and a 400) handles that case downstream.
- `mailRecipientRefusal` is `Promise<ResponseReject | undefined>` — callers must check for `undefined` to mean "proceed" rather than a falsy truthiness check.
- The budget keys on the *recipient*, so a single caller sending to 50 different addresses is not limited by this budget (that is the caller's own budget's concern).
- `pseudonymise` is namespaced with `'rate-limit'` to avoid collisions with other pseudonymisation contexts.
