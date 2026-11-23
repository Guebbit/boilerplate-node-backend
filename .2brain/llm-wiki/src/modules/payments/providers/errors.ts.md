---
source: src/modules/payments/providers/errors.ts
source_sha256: c99d0bb0c36a733f02d06d348ef8bcadcef04548ffbd94caeaed6c22290a9a56
context_sha256: ea39c1004ffc8a207d41cf240f568d68378f3b5103560aa0bb54c780a8bd31f6
generated_at: 2026-11-22T06:47:13.777669+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/providers/errors.ts

## Purpose
Defines the error types of the payment provider port. They live in their own file, separate from `index.ts`, so an implementation (a real adapter or the fake double) can throw them without importing the port interface file. That file in turn imports the config and the registry the implementation is registered in.

## Key elements
- `PaymentInFlightError` (extends `Error`): a provider's refusal to cancel because the intent already succeeded or is still mid-flight. Only a refund could move the money back. Takes a `message` describing the intent's state. Thrown by `PaymentProvider.cancel` and nowhere else in the port.
- `PaymentProviderError` (extends `Error`): a provider refusing a refund, with the reason already classified. Carries a `readonly code: RefundFailureReason` (the closed reason staff see) and a `message` (the provider's own wording, for the log).

## Relationships
- `src/types/index.ts`: supplies the `RefundFailureReason` type used for the `code` field of `PaymentProviderError`. It is imported with `import type`.
- `src/modules/payments/providers/index.ts`: the port file. This file is split out so implementations don't need to import it.
- `scenarios/support/doubles/payments/fake.ts`: the fake provider double. It is one of the implementations these errors are split out for.
- `src/modules/payments/services/intent.ts`, `offline.ts` and `refunds.ts`: the payment services in the graph that sit alongside this file.
- Tests (`refunds.test.ts`, `timeline.test.ts`, `payments-fake.test.ts`): the integration and unit tests linked to this file in the graph.

## Notes
- An adapter maps its own error vocabulary onto `RefundFailureReason` and throws `PaymentProviderError`. Anything else an adapter throws is stored as `unknown`.
- The `PaymentProviderError` message goes to the log, never the wire. Only the classified `code` is meant to be surfaced.
- Both classes set `this.name` explicitly to their class name.
