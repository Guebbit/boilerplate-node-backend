---
source: src/modules/payments/services/errors.ts
sha256: 5d9b3f8bf714a832b6f355a11438be74c0dffa021b0770b64dc5cb65cf8c514d
generated_at: 2026-09-27T15:25:53.047773+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/errors.ts

## Purpose

Single-leaf module that produces the canonical 409 "order is no longer payable" rejection. It exists as a leaf (no persistence or service imports) so that every file under `services/` can import it without pulling in additional dependency edges.

## Key elements

- **`notPayable()`** — Returns a `ResponseReject` with HTTP 409, error code `PAYMENT_ORDER_NOT_PAYABLE`, and a message resolved through the i18n key `payments.order-not-payable`. Used for three indistinguishable failure paths: the order failed `isPayable` before any write, a race moved it out from under the check-then-write, or the money bounced back because the order was gone by the time it landed.

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `generateReject` (function) and the `ResponseReject` type to build the 409 response object.
- **`src/infrastructure/i18n/index.ts`** — Imports the `t` function to translate the user-facing message.
- **`src/infrastructure/i18n/context.ts`** — Transitive dependency of the i18n module (no direct import in this file).
- **`src/modules/payments/services/intent.ts`**, **`offline.ts`**, **`settlement.ts`** — Consumers that call `notPayable()` when the target order is no longer payable; this file intentionally has no import of them (one-directional dependency).

## Notes

- The module docblock explicitly states the leaf constraint is deliberate: do not add persistence or other service imports here, or the "free import" guarantee for the rest of `services/` breaks.
- All three "not payable" scenarios share the same code and message by design — clients cannot (and should not need to) distinguish them.
