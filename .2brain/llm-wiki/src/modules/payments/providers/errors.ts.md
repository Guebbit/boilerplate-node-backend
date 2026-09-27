---
source: src/modules/payments/providers/errors.ts
sha256: a62ddda66c68e11f097d7ab7f8623ae8bb60d56b48a5203a80cca36e364df093
generated_at: 2026-09-27T15:24:15.989860+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/errors.ts

## Purpose

Houses the error type(s) thrown by the payment provider port, isolated into their own module so implementations can import and throw them without pulling in `index.ts` (the port interface), which itself imports every implementation. This split exists specifically to break a circular-dependency cycle that previously arose when the error lived inside `index.ts`.

## Key elements

- **`PaymentInFlightError`** (exported class, extends `Error`) — Thrown exclusively by `PaymentProvider.cancel` when the payment intent has already succeeded or is still mid-flight on the provider side, meaning there is nothing open left to close and only a refund could return the funds. Constructor accepts a single `message: string` and sets `name` to `'PaymentInFlightError'`.

## Relationships

- **`src/modules/payments/providers/index.ts`** — The port-interface module this file was split out of. `index.ts` imports all provider implementations; keeping the error type here (rather than in `index.ts`) lets implementations import the error without creating the cycle `index.ts → impl → index.ts`.
- **`src/modules/payments/providers/fake.ts`** — The in-repo implementation that throws `PaymentInFlightError` from its `cancel` method, importing it from this module.

## Notes

- The module-level doc comment is load-bearing: it records *why* the split exists. Merging the class back into `index.ts` will re-introduce the circular import.
- `PaymentInFlightError` is documented as thrown "nowhere else in this port" — if other port methods begin throwing it, that contract breaks.
