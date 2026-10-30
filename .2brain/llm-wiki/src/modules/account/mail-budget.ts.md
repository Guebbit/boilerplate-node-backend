---
source: src/modules/account/mail-budget.ts
sha256: 5686cf7d186584f4066dd76d6dde90c8a59c355d7b73b23bc30d7bf5778bdb6f
generated_at: 2026-10-29T02:35:03.490487+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/mail-budget.ts

## Purpose

Enforces a per-recipient mail budget: a hard cap (default 10) on how many mails this app may deliver to a single mailbox in a rolling 24-hour window, regardless of which flow (signup, reset, verification, export, deletion) triggers the send. The budget protects the *recipient* (whoever's inbox is targeted), not the caller, and is keyed on the canonicalised, pseudonymised address so `+tag` or dot tricks cannot create new buckets.

## Key elements

- **`MAIL_RECIPIENT_BUDGET`** (exported const) — the `RateLimitBudget` descriptor (window, max, key description) built from `accountRateLimitData.mailRecipient` in the generated rate-limit table.
- **`chargeMailRecipient`** (module-private) — normalises the address via `canonicalMailbox`, pseudonymises it, and delegates to `chargeBudget`; returns `{ allowed, retryAfterSeconds }`.
- **`mailRecipientRefusal`** (exported) — the *service-side* door. Takes an address + `CallerContext`, charges the budget, and returns either `undefined` (mail may go out) or a pre-built 429 `ResponseReject`. Also records the refusal for auditing.
- **`mailRecipientLimiter`** (exported, Express `RequestHandler`) — the *route-side* door. Reads `email` from the JSON body; if absent, passes through. Otherwise charges the budget and either calls `next()` or answers 429 via the shared `refuseRateLimited` helper.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — provides the generic `chargeBudget` / `recordBudgetRefusal` / `readBodyField` / `refuseRateLimited` primitives that both doors build on.
- **`src/infrastructure/persistence/normalize-email.ts`** — `canonicalMailbox` strips `+tag` and Gmail dots to produce the canonical key.
- **`src/infrastructure/security/pseudonymise.ts`** — hashes the canonical address (context `'rate-limit'`) so raw mailboxes never appear in rate-limit storage.
- **`src/infrastructure/http/response.ts`** — `generateReject` shapes the 429 envelope returned by `mailRecipientRefusal`.
- **`src/infrastructure/i18n/index.ts`** — `t` supplies the human-readable refusal message.
- **`src/modules/account/rate-limits.generated.ts`** — source of the numeric budget values (max, window) and the budget's identity.
- **`src/types/index.ts`** — `CallerContext` and `RateLimitBudget` type definitions.
- **`src/modules/account/routes.ts`** (consumer) — mounts `mailRecipientLimiter` on routes whose request body names a recipient address.
- **`src/modules/account/services/verification.ts`, `export.ts`, `profile.ts`** (consumers) — call `mailRecipientRefusal` when the service itself chose the recipient (e.g. a stored address or a user-requested new address).
- **`src/modules/account/tests/integration/mail-recipient-budget.test.ts`** — integration tests exercising both doors.

## Notes

- The budget is keyed to the **recipient**, not the caller. An attacker rotating their own address still hits the same per-recipient cap.
- `mailRecipientLimiter` passes through silently when the body has no `email` field; downstream validation is expected to reject the request.
- The max (10) and window (24 h) are overridable via `NODE_MAIL_RECIPIENT_RATE_LIMIT_MAX`; the generated file reads the env var at build time.
- Pseudonymisation context is the literal string `'rate-limit'` — distinct from other pseudonymised lookups in the codebase.
