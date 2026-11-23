---
source: src/modules/returns/rate-limits.ts
source_sha256: c0bdc2490a99a89934772c14a90f9a1fc151151a127db798ef628df2fa94d4ef
context_sha256: 567b4f99de9808934a0c793b88a8f7d55d0b1f378d2cd695bb023ab9506f0524
generated_at: 2026-11-22T07:26:54.423819+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/rate-limits.ts

## Purpose
Defines the returns module's own rate-limit budget: a limiter for `POST /returns`. The budget is plain data (`RateLimitBudget`) that is turned into Express middleware by `buildRateLimiter`, the same factory all other modules' budgets use. Each opened return costs staff a row to read and the shop a mail to send, so the limit is set well above a real customer's handful of returns and well below the global brake.

## Key elements
- `RETURNS_WRITE_BUDGET` (not exported): a `RateLimitBudget` that spreads `returnsRateLimitData.returnsWrite` (imported from `./rate-limits.generated`) and adds `keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT` and `keyGenerator: accountIdOf`. It counts returns opened per window, per account.
- `returnsWriteLimiter`: the `RequestHandler` built from that budget with `buildRateLimiter`. It is the middleware for `POST /returns`.
- `returnsRateLimits`: a readonly array holding the module's declared budgets (currently just `RETURNS_WRITE_BUDGET`).

## Relationships
- `src/infrastructure/http/middlewares/rate-limit.ts`: supplies `buildRateLimiter`, `accountIdOf` and `KEYED_BY_AUTHENTICATED_ACCOUNT`, which this file uses.
- `src/modules/returns/module.ts`: declares `returnsRateLimits` as its `rateLimits`.
- `src/modules/returns/routes.ts`: the route layer. The `returnsWriteLimiter` middleware is intended for `POST /returns`.
- `src/types/index.ts` and `src/types/rate-limit-budget.ts`: the `RateLimitBudget` type, imported via the `@types` alias.

## Notes
- The numeric limits (window and max) are not in this file. They come from the generated `./rate-limits.generated` module, so change them at their source, not here.
- Keying is per authenticated account, not per IP.
- The same `RETURNS_WRITE_BUDGET` object feeds both the live limiter and the exported budget list, so the two cannot drift apart.
