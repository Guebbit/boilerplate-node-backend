---
source: src/modules/invoicing/rate-limits.ts
sha256: ced7502a8d1d62e6f9e9258186318c9336d340409770ad9586e9d2b58bb36f3d
generated_at: 2026-10-14T16:08:06.878661+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/rate-limits.ts

## Purpose

Declares the invoicing module's rate-limit budget for its two PDF-render endpoints (`GET /orders/:id/invoice` and `GET /orders/:id/credit-notes/:creditNoteId`). Both endpoints spawn a Chromium launch, so they share a single per-account budget rather than having separate ones. The budget object is fed through the shared `buildRateLimiter` factory to produce an Express middleware.

## Key elements

- **`INVOICING_RENDER_BUDGET`** (module-private) — The `RateLimitBudget` literal. Keyed by authenticated account (`accountIdOf`), `defaultMax: 20`, `windowMs: 'shared'`, overridable via `NODE_INVOICING_RATE_LIMIT_MAX`, marked `audited: true`.
- **`invoicingLimiter`** (exported, `RequestHandler`) — The ready-to-mount Express middleware produced by `buildRateLimiter(INVOICING_RENDER_BUDGET)`. Applied to both render routes.
- **`invoicingRateLimits`** (exported, `readonly RateLimitBudget[]`) — A single-element array wrapping the budget for registration in the module's `rateLimits` list.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Source of `buildRateLimiter`, `accountIdOf`, and `KEYED_BY_AUTHENTICATED_ACCOUNT`. This file is a pure consumer of that factory; it adds no rate-limit logic of its own.
- **`src/types/index.ts` / `src/types/rate-limit-budget.ts`** — Provides the `RateLimitBudget` type used to shape `INVOICING_RENDER_BUDGET`.
- **`src/modules/invoicing/module.ts`** — Consumes the `invoicingRateLimits` export to register the budget in the module's `rateLimits` declaration.
- **`src/modules/invoicing/routes.ts`** — Mounts `invoicingLimiter` on the two invoice/credit-note render routes the budget is scoped to.

## Notes

- One budget covers **two** endpoints intentionally: both trigger the same expensive Chromium `renderHtmlToPdf` call, so splitting them would double the effective ceiling without adding protection.
- Keying is by **account**, not IP/address, because an address-keyed budget would let one account behind a shared egress address starve every other caller (see `bounds` string).
- `windowMs: 'shared'` is a sentinel value handled by `buildRateLimiter`; it does not mean a fixed millisecond count.
- The file contains no route definitions or HTTP logic — only the budget declaration and the two exports.
