---
source: src/modules/payments/providers/errors.ts
sha256: c99d0bb0c36a733f02d06d348ef8bcadcef04548ffbd94caeaed6c22290a9a56
generated_at: 2026-11-08T07:23:12.797280+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/errors.ts

## Purpose

Defines the error types that payment provider implementations can throw. Split out of `providers/index.ts` so that an adapter (real or fake) can import and throw these errors without pulling in the port interface file, which itself imports the config and the registry the implementation is registered in — avoiding a circular dependency.

## Key elements

- **`PaymentInFlightError`** — Thrown exclusively by `PaymentProvider.cancel` when the intent has already succeeded or is still mid-flight at the provider, leaving nothing open to close. Carries only a free-form `message` describing the provider's state.
- **`PaymentProviderError`** — Thrown by an adapter when a refund is refused. Carries a `code: RefundFailureReason` (the closed classification surfaced to staff) and a `message` (the provider's own wording, intended for logs only, never sent to the wire).

## Relationships

- **`src/modules/payments/providers/index.ts`** — The port interface file from which these errors were extracted. The interface's `cancel` contract references `PaymentInFlightError`; adapters implement against the interface while importing only this file for the error types.
- **`scenarios/support/doubles/payments/fake.ts`** — The fake payment provider; throws these same error types to exercise downstream error-handling paths.
- **`src/modules/payments/services/refunds.ts`** — Catches `PaymentProviderError` to surface the classified `code` to callers.
- **`src/modules/payments/services/intent.ts`** — Catches `PaymentInFlightError` during cancel flows.
- **`src/modules/payments/services/offline.ts`** — Consumes provider errors in offline/queue contexts.
- **`src/types/index.ts`** — Source of the `RefundFailureReason` type used as `PaymentProviderError`'s `code`.
- **`src/modules/payments/tests/integration/refunds.test.ts`**, **`timeline.test.ts`** — Integration tests that assert on these error types being thrown with expected codes/messages.
- **`tests/unit/scenarios/payments-fake.test.ts`** — Verifies the fake double throws these errors with correct payloads.

## Notes

- The module docstring states the split exists specifically to break the import cycle: adapter → errors file (leaf) vs. adapter → port interface → config + registry → adapter.
- `PaymentInFlightError` is documented as thrown "nowhere else in this port" — only `cancel` may raise it.
- `PaymentProviderError.code` is typed as the closed `RefundFailureReason` union; anything an adapter throws *outside* this class is treated as `unknown` downstream (per the docstring).
- The `message` on `PaymentProviderError` is explicitly log-only, not wire-safe.
