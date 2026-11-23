---
source: src/modules/account/mail-budget.ts
generated_at: 2026-11-22T03:30:20.523281+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/mail-budget.ts

## Purpose
Defines the per-recipient daily mail budget: how many mails the app will send to a single mailbox, regardless of which flow triggers them. Signup, password reset, email change, both resends and a data export can all be aimed at a stranger's address. A budget on the caller would not protect the victim, and `+tag` variants would defeat it. The account-deletion mail is deliberately not charged, since it goes to the caller's own address behind fresh auth.

## Key elements
- `MAIL_RECIPIENT_BUDGET` — a `RateLimitBudget` built from `accountRateLimitData.mailRecipient` (imported from `./rate-limits.generated`), plus a `keyedBy` description. The header documents a 24-hour window and a max of 10 (`NODE_MAIL_RECIPIENT_RATE_LIMIT_MAX`).
- `mailRecipientRefusal(address, context)` — the service-side door. It charges one mail against `address`. It returns `undefined` if the mail fits. Otherwise it records the refusal against the caller's `CallerContext` and returns a 429 `ResponseReject` with `details.policy` set to the budget namespace.
- `mailRecipientLimiter` — the route-side Express middleware. It reads `email` from the request body and charges it. If the body names no address, it calls `next()` and leaves validation to answer. If the budget is spent, it answers 429 through `refuseRateLimited`.
- `chargeMailRecipient` (private) — the shared step. It canonicalises the address with `canonicalMailbox`, pseudonymises it under the `'rate-limit'` purpose, and calls `chargeBudget`.

## Relationships
- `src/infrastructure/http/middlewares/rate-limit.ts` — supplies `chargeBudget`, `recordBudgetRefusal`, `readBodyField`, `refuseRateLimited` and the `BudgetCharge` type.
- `src/infrastructure/persistence/normalize-email.ts` — `canonicalMailbox` provides the key. It strips `+tag`, and strips dots for Gmail.
- `src/infrastructure/security/pseudonymise.ts` — `pseudonymise` keeps raw addresses out of the budget key.
- `src/infrastructure/http/response.ts` — `generateRateLimited` and the `ResponseReject` type build the service-side 429.
- `src/types/auth-context.ts`, `src/types/rate-limit-budget.ts` (via `@types`, re-exported from `src/types/index.ts`) — `CallerContext` and `RateLimitBudget`.
- `src/modules/account/rate-limits.ts` — related to the budget's configuration data, which this file reads from `./rate-limits.generated`.
- `src/modules/account/routes.ts` — per the header, `mailRecipientLimiter` is mounted on routes whose body names the address (signup, reset).
- `src/modules/account/services/email-change.ts`, `src/modules/account/services/export.ts` and `src/modules/account/services/verification.ts` — per the header, services that pick the recipient themselves use `mailRecipientRefusal`.
- `src/modules/account/tests/integration/mail-recipient-budget.test.ts` — integration test for this budget.

## Notes
- The window is 24 hours on purpose, because a per-minute window lets a slow drip through.
- The limiter should be mounted before the controller and after the route's other human-challenge-free limiters. A refused request then never reaches the code that sends.
- A refusal is counted and audited against the caller. The budget key itself is the recipient, not the caller.
- The header points to a "the rate-limit budgets" section in a security doc for further detail.
