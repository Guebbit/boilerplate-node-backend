---
source: src/modules/orders/rate-limits.ts
sha256: c4cc943aa2f2b53d84390fb7abe9d01f645657cc87aa88d96ed68decf44c6a37
generated_at: 2026-09-23T19:05:05.945240+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/rate-limits.ts

## Purpose

Declares the orders module's sole rate-limit budget (`INVOICE_RENDER_BUDGET`) for `GET /orders/:id/invoice` and exposes it as a ready-to-use Express middleware (`invoiceLimiter`). It exists because each invoice render spawns a Chromium process (`renderHtmlToPdf`), making the endpoint far more resource-intensive than a typical request handler, and a per-account cap is needed to prevent one signed-in user from exhausting container CPU.

## Key elements

- **`INVOICE_RENDER_BUDGET`** (`RateLimitBudget`) — The budget descriptor: max 20 (overridable via `NODE_INVOICE_RATE_LIMIT_MAX`), shared window, keyed by authenticated account (`accountIdOf`), audited.
- **`invoiceLimiter`** (`RequestHandler`, exported) — The middleware produced by passing the budget through `buildRateLimiter`; attached to the invoice route.
- **`ordersRateLimits`** (`readonly RateLimitBudget[]`, exported) — The module-level list of all declared budgets; consumed by `./module.ts`'s `rateLimits` registration.

## Relationships

- **`@infrastructure/http/middlewares/rate-limit`** — Provides `buildRateLimiter` (budget → middleware), `accountIdOf` (key generator), and the `KEYED_BY_AUTHENTICATED_ACCOUNT` constant used by this file.
- **`src/modules/orders/routes.ts`** — The consumer side; the `GET /orders/:id/invoice` handler is wrapped with `invoiceLimiter`.
- **`src/modules/orders/module.ts`** — Registers `ordersRateLimits` into the module's `rateLimits` array so the budget is discoverable/auditable at startup.
- **`src/types/index.ts` / `src/types/rate-limit-budget.ts`** — Source of the `RateLimitBudget` type shape used to declare `INVOICE_RENDER_BUDGET`.

## Notes

- The budget is keyed by **account**, not IP/address. Rationale (documented inline): a single account behind a shared NAT would otherwise starve every other caller on that address.
- `defaultMax: 20` is deliberately set well above a legitimate session's burst (download → view → re-download) but well below any global cap.
- `audited: true` means this budget is tracked in security audits; the `bounds` string is the human-readable explanation recorded alongside it.
- The module exports a single-element array (`ordersRateLimits`) rather than a bare object so additional budgets can be added without changing the registration contract in `module.ts`.
