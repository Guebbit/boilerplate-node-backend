---
source: src/modules/payments/globals.d.ts
source_sha256: 1e19743af497afedd403ce276c8c769571bec2c6076ad516d36225ac5db27a42
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T06:45:16.527032+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/globals.d.ts

## Purpose
Type-only declaration file that augments Express's `Request` interface with a field used solely by the `payments` module. Infrastructure's `src/globals.d.ts` must not name a module, so this payments-specific field lives here and is merged onto the same interface through declaration merging.

## Key elements
- `export {}`: makes the file a module rather than a global script (see Notes).
- `declare module 'express-serve-static-core'` augmenting `Request` with:
  - `paymentConfirmDeclined?: boolean`: whether `POST /payments/:id/confirm` settled as `PAYMENT_DECLINED`. Set by the confirm controller and read by the decline-budget limiter `paymentConfirmDeclineLimiter` in `rate-limits.ts`. That limiter uses it to tell a genuine decline apart from the route's other 409, `PAYMENT_ORDER_NOT_PAYABLE` (a race, not a decline), which must not spend the same budget.

## Relationships
No graph neighbors are listed, so there are no tracked dependencies on other files. The doc comments only say that the confirm controller sets the flag and that `paymentConfirmDeclineLimiter` reads it.

## Notes
- The empty `export {}` is required. Without a top-level import or export, the file is a global script. In that case `declare module` redeclares the module from scratch instead of augmenting it. That silently erases every property Express's own types declare on `Request`, `Response` and `Express` across the whole program.
- The property is optional, so it is `undefined` unless the confirm controller sets it.
