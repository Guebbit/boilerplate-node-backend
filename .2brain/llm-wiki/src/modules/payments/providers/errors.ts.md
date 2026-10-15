---
source: src/modules/payments/providers/errors.ts
sha256: c99d0bb0c36a733f02d06d348ef8bcadcef04548ffbd94caeaed6c22290a9a56
generated_at: 2026-10-15T11:27:13.965141+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/errors.ts

## Purpose

Defines the two error classes that a payment provider adapter (real or fake) throws when it refuses a cancel or a refund. It is split out of `providers/index.ts` so that an implementation can import only these error types without pulling in the port interface, the config, or the registry that the adapter itself is registered in — avoiding a circular import.

## Key elements

- **`PaymentInFlightError`** — extends `Error`. Thrown exclusively by `PaymentProvider.cancel` when the intent already succeeded or is still mid-flight on the provider side and there is nothing open left to close. Carries a `message` describing the intent's state.
- **`PaymentProviderError`** — extends `Error`. Thrown by an adapter when it refuses a refund. Exposes a readonly `code: RefundFailureReason` (the closed reason shown to staff) and a `message` containing the provider's own wording (log-only, never sent to the wire).
- **Import** — `RefundFailureReason` from `@types`, used as the closed-set enum for `PaymentProviderError.code`.

## Relationships

- **`src/types/index.ts`** — provides the `RefundFailureReason` type used by `PaymentProviderError`.
- **`src/modules/payments/providers/index.ts`** — the port interface this file was extracted from; adapters import the errors from here instead of from the port to avoid importing the registry/config.
- **`scenarios/support/doubles/payments/fake.ts`** — the test double that throws these errors to simulate provider rejections without importing the port file.
- **`src/modules/payments/services/refunds.ts`** — catches `PaymentProviderError` to classify the refund outcome.
- **`src/modules/payments/services/intent.ts`** / **`src/modules/payments/services/offline.ts`** — catch `PaymentInFlightError` from cancel calls.
- **`src/modules/payments/tests/integration/refunds.test.ts`** / **`timeline.test.ts`** — exercise code paths that produce or handle these errors.
- **`tests/unit/scenarios/payments-fake.test.ts`** — asserts the fake double throws the correct error classes.

## Notes

- The module doc block explicitly states the split is an import-cycle mitigation; do not re-merge these classes into `index.ts` without reconsidering the dependency graph.
- `PaymentProviderError.message` is contractually log-only. If a caller surfaces it to an API response, that is a bug.
- Any adapter error that is *not* wrapped in one of these two classes is treated by callers as `unknown`, not as a classified failure.
