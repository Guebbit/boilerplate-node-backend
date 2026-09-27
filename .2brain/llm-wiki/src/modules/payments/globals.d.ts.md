---
source: src/modules/payments/globals.d.ts
sha256: 1b8b17552bb4ee8fc36ed470b6dc0002f7e265e6ed4b3793b2896d91883d10dc
generated_at: 2026-09-27T15:23:16.221714+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/globals.d.ts

## Purpose

Augments Express's `Request` interface with a payments-specific boolean flag via declaration merging. It exists as a separate file (rather than living in infrastructure's `src/globals.d.ts`) because the project's layering rules (`docs/theory/layers.md`) forbid infrastructure's global types file from naming a module, so payments-local fields live here.

## Key elements

- **`export {}`** — Marks the file as an ES module. Without it the file is a global *script*, and `declare module 'express-serve-static-core'` would *redeclare* the module from scratch, silently erasing every property Express's own types declare on `Request`/`Response`/`Express` across the program. The eslint-disable comment documents this.
- **`declare module 'express-serve-static-core'` → `interface Request`** — Adds a single optional property:
  - **`paymentConfirmDeclined?: boolean`** — Set by the `POST /payments/:id/confirm` controller when the settlement result is `PAYMENT_DECLINED`. Read by `rate-limits.ts`'s `paymentConfirmDeclineLimiter` to distinguish a genuine decline (which spends decline budget) from the other 409 response, `PAYMENT_ORDER_NOT_PAYABLE` (a race condition that must not spend the same budget).

## Relationships

No graph neighbors are recorded for this file.

## Notes

- **`export {}` is load-bearing, not decorative.** Removing it (or converting it to a bare comment) turns the file into a global script and causes the `declare module` block to *replace* rather than *augment* Express's types, breaking `req.query`, `req.params`, and everything else program-wide. The lint-disable on that line is intentional and should not be "cleaned up."
- The property is optional (`?:`) and is only meaningful within the lifecycle of a single confirm request; it is not a persistent state.
- This file must remain in the `payments` module scope. Moving its content into a shared/infrastructure globals file would violate the layering constraint described in `docs/theory/layers.md`.
