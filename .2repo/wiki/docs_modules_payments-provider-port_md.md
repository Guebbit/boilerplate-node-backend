# docs/modules/payments-provider-port.md

## Purpose

Defines the `PaymentProvider` interface — the single contract the payments service calls for charges and refunds — so that which real provider is wired in is a deployment decision (env variable), not a code path. Shipped with one in-process `fake` implementation; a real PSP plugs in as one additional file.

## Key elements

- **`PaymentProvider` interface** — three members: `name` (persisted on payment docs), `charge(charge, card)` (returns `succeeded` or `declined`; only transport failures throw), `refund(charge)` (idempotent).
- **`resolvePaymentProvider`** — reads `NODE_PAYMENT_PROVIDER`, looks up the `PROVIDERS` registry, throws (listing valid options) if the name is unknown. Lazy + memoised, with a `reset` seam for tests.
- **`PROVIDERS` registry** — maps provider name → implementation. Currently only `fake`.
- **`fake.ts`** — the shipped implementation. `4000000000000002` → declined; any other card → succeeded; refunds always succeed. Logs each call (last-4 digits only, never the full card).
- **`NODE_PAYMENT_PROVIDER`** — env variable selecting the active provider. Default: `fake`.

## Relationships

- **`docs/modules/payments.md`** — the module that consumes this port. Its service (`payments/service.ts`) is the sole caller of the `PaymentProvider` interface; all amounts, card operations, and refunds flow through it.

## Notes

- A decline is a **valid return value**, not an exception. Only transport-level failures throw.
- The fake is intentionally honest: it mirrors real PSP test-mode semantics (magic decline card, all-else-succeeds) so e2e and demo exercise the decline path realistically.
- The log line in the fake substitutes for the external trail (dashboard, webhook log) a real PSP would leave. Without it, "charged" and "never reached the provider" are indistinguishable externally.
- Card number is logged as last-4-only — same rule as the payment document. This is called out as a discipline easy to drop in a stub.
- Adding a real provider is three steps: implement the interface in a new file, add one line to `PROVIDERS`, change the env variable. No other code changes.
- The lazy/memoised/reset pattern is borrowed from the mailer transport selection; the overall shape matches `ImageStore` in `@infrastructure/adapters/image-store`.
