---
source: src/modules/account/mail-budget.ts
sha256: 501659fa3e195a642fa15811308ddb8e3d18719b330ec0b6d61103544dd16324
generated_at: 2026-11-14T18:36:54.713695+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/mail-budget.ts

## Purpose

Per-recipient mail budget that caps how many mails the app will deliver to a single mailbox within a 24-hour window (default 10), regardless of which flow (signup, reset, email-change, export) triggered the send. It protects the *victim's* inbox from being turned into a weapon by a caller who can point arbitrary flows at stranger addresses.

## Key elements

- **`MAIL_RECIPIENT_BUDGET`** (`RateLimitBudget`) — The budget descriptor. Spread from `accountRateLimitData.mailRecipient` (generated data) with an explicit `keyedBy` string describing the key shape: lowercased, `+tag` stripped, Gmail dots stripped, pseudonymised.
- **`chargeMailRecipient(address)`** (internal) — Single point where the budget is actually charged: normalises via `canonicalMailbox`, pseudonymises with prefix `'rate-limit'`, then calls `chargeBudget`.
- **`mailRecipientRefusal(address, context)`** (exported) — *Service-side* door. Returns a `ResponseReject` (429 envelope) or `undefined` (allowed). Also records the refusal against the caller's `CallerContext` for auditing. Used by services that picked the recipient themselves (resend, new-address change, export).
- **`mailRecipientLimiter`** (exported, `RequestHandler`) — *Route-side* door. Reads `email` from the JSON body; if absent, calls `next()` (validation will reject). If present, charges the budget and either `next()`s or answers the shared 429 envelope via `refuseRateLimited`.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Supplies `chargeBudget`, `recordBudgetRefusal`, `readBodyField`, `refuseRateLimited`, and the `BudgetCharge` type that underpin all budget logic here.
- **`src/infrastructure/persistence/normalize-email.ts`** — `canonicalMailbox` produces the stable key (strips `+tag`, collapses Gmail dots, lowercases).
- **`src/infrastructure/security/pseudonymise.ts`** — `pseudonymise('rate-limit', …)` ensures the raw mailbox never appears as a stored key.
- **`src/infrastructure/http/response.ts`** — `generateRateLimited` builds the 429 `ResponseReject` envelope.
- **`src/modules/account/rate-limits.ts`** — Source of the numeric budget values (`max`, `windowMs`) spread into `MAIL_RECIPIENT_BUDGET`.
- **`src/types/auth-context.ts`** — `CallerContext` type used when recording refusals.
- **`src/types/rate-limit-budget.ts`** — `RateLimitBudget` type that `MAIL_RECIPIENT_BUDGET` conforms to.
- **`src/modules/account/routes.ts`** — Mounts `mailRecipientLimiter` on routes whose body names a recipient address (signup, reset).
- **`src/modules/account/services/email-change.ts`**, **`src/modules/account/services/verification.ts`**, **`src/modules/account/services/export.ts`** — Call `mailRecipientRefusal` when the service (not the body) chose the recipient.
- **`src/modules/account/tests/integration/mail-recipient-budget.test.ts`** — Integration test exercising both doors.

## Notes

- **Account-deletion mail is intentionally NOT charged** against this budget; it goes to the caller's own address behind fresh auth and is excluded by design.
- The key is *pseudonymised*, so the rate-limit store never holds a raw email address.
- Gmail normalisation (dot collapsing, `+tag` stripping) means `User+spam@gmail.com` and `u.s.e.r@gmail.com` share one budget slot.
- `mailRecipientLimiter` is a pass-through when the body has no `email` field — it does *not* reject; downstream validation handles that.
- The 24-hour window is deliberate: a per-minute window would let a slow drip (1 mail/min) send ~1 440 mails/day.
