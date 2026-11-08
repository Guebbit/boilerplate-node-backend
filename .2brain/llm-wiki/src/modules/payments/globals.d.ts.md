---
source: src/modules/payments/globals.d.ts
sha256: 50884e655f66cad6f55a0dda9040c18df3d7c2b6e0cf9917709219c7801f96c2
generated_at: 2026-11-08T07:21:09.309848+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/globals.d.ts

## Purpose

Augments Express's `Request` interface with a payments-specific flag (`paymentConfirmDeclined`) via TypeScript declaration merging. It exists here — rather than in infrastructure's global `globals.d.ts` — because the architecture rule (`docs/theory/layers.md`) forbids that file from naming a module, so module-local augmentations live in the owning module.

## Key elements

- **`export {}`** — Makes the file a module (not a global script). Without it, `declare module` would *redeclare* `express-serve-static-core` from scratch, silently wiping all properties Express's own type definitions provide on `Request`/`Response`/`Express` across the entire program.
- **`Request.paymentConfirmDeclined?: boolean`** — A transient flag on the Express request object. Set by the `POST /payments/:id/confirm` controller when the outcome is `PAYMENT_DECLINED`; read by `rate-limits.ts`'s `paymentConfirmDeclineLimiter` to distinguish a genuine decline from the other 409 (`PAYMENT_ORDER_NOT_PAYABLE`, a race condition) so only true declines spend the decline-budget.

## Notes

- **`export {}` is load-bearing, not cosmetic.** Removing it (or adding a real top-level export without keeping the empty one) turns the file into a global script and causes the destructive redeclaration described above.
- The field is intentionally optional (`?`) and transient — it exists only for the duration of a single request cycle between the controller and the rate-limiter middleware.
- Naming the augmented module as `'express-serve-static-core'` (not `'express'`) is the correct target for Express 5 / `@types/express-serve-static-core` augmentation.
