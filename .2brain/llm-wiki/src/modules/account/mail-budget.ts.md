---
source: src/modules/account/mail-budget.ts
sha256: 1c7fb6f860597bd7e84b6325e60ca5d35f1dfbcc32d3616cd2dc858f1d4cbb8c
generated_at: 2026-10-14T08:40:39.630492+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/mail-budget.ts

## Purpose

Defines and enforces a per-recipient daily mail budget (default 10 mails / 24 h) so that no single mailbox can be flooded regardless of how many distinct callers target it. It exists because caller-side rate limits bound the attacker, not the victim; this budget bounds the mailbox that would receive the mail.

## Key elements

- **`MAIL_RECIPIENT_BUDGET`** (`RateLimitBudget`) — the budget descriptor: 24 h window, max 10, namespace `mail-recipient`, audited. The key is the canonical, pseudonymised mailbox address.
- **`chargeMailRecipient(address)`** — low-level primitive; normalises the address (`canonicalMailbox`), pseudonymises it, and calls `chargeBudget`. Returns a `BudgetCharge` (`allowed`, `retryAfterSeconds`).
- **`mailRecipientRefusal(address)`** — service-side helper; wraps `chargeMailRecipient` and returns a `ResponseReject` (429 envelope) when the budget is exhausted, or `undefined` when the mail may proceed. Used by services that chose the recipient themselves (resend, email-change, export).
- **`mailRecipientLimiter`** (`RequestHandler`) — route-side Express middleware; reads `email` from the JSON body, charges the budget, and either calls `next()` or answers 429 with a `Retry-After` header. Passes through when the body names no address.

## Relationships

- **`@infrastructure/http/middlewares/rate-limit`** — provides `chargeBudget`, `readBodyField`, `refuseRateLimited`, and the `BudgetCharge` type; the budget is *defined* here but *enforced* through those helpers.
- **`@infrastructure/persistence/normalize-email`** — `canonicalMailbox` strips `+tags` and Gmail dots before pseudonymisation, so `foo+spam@gmail.com` and `f.o.o@gmail.com` share one budget slot.
- **`@infrastructure/security/pseudonymise`** — hashes the canonical address with the `rate-limit` purpose so raw mailboxes never appear as Redis/cache keys.
- **`@infrastructure/http/response`** — `generateReject` builds the 429 response envelope returned by `mailRecipientRefusal`.
- **`@infrastructure/i18n`** — `t` supplies the localised "rate-limited" message in the 429 body.
- **`@types` / `src/types/rate-limit-budget`** — the `RateLimitBudget` interface that `MAIL_RECIPIENT_BUDGET` satisfies.
- **`src/modules/account/routes.ts`** — mounts `mailRecipientLimiter` in the Express chain (after challenge-free limiters, before controllers) for signup and password-reset routes.
- **`src/modules/account/services/verification.ts`**, **`services/profile.ts`**, **`services/export.ts`** — call `mailRecipientRefusal` when the recipient is chosen by the service (resend, email change, data-export notification) rather than named in the request body.
- **`src/modules/account/rate-limits.ts`** — sibling file that holds the *caller-side* budgets; this file is complementary, binding the recipient dimension.
- **`src/modules/account/tests/integration/mail-recipient-budget.test.ts`** — integration tests exercising both doors against a real budget store.

## Notes

- The budget is keyed on the **recipient**, not the caller. A single account hitting 100 different addresses is unconstrained by this budget; a single address targeted by 100 accounts is.
- `+tag` and Gmail-dot normalisation means `user+x@gmail.com` and `user@gmail.com` count as the **same** mailbox.
- `mailRecipientLimiter` silently passes when the body has no `email` field; it is not a validation gate—subsequent middleware or the controller handles that.
- The budget is marked `audited: true`, so every charge is logged for security review (see `docs/tools/security.md#the-rate-limit-budgets`).
