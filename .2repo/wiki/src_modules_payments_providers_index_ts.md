# src/modules/payments/providers/index.ts

## Purpose

Defines the `PaymentProvider` port (interface) and the env-driven factory that resolves which concrete implementation the payments service talks to. This file is the single seam between the domain service and any real payment service provider (PSP); swapping implementations is a one-line registry addition plus an env var change, with no service- or frontend-facing changes.

## Key elements

- **`ChargeOutcome`** (type) — `'succeeded' | 'declined'`. A decline is a valid *answer*; only transport-level failures are thrown.
- **`PaymentProvider`** (interface) — the port contract: `name`, `charge(charge, card)`, and `refund(charge)`. The service depends on this shape and nothing else.
- **`PROVIDERS`** (module-local record) — the registry of implementations available to this build. Currently only `fake`. Adding a real PSP means adding one key here.
- **`resolvePaymentProvider()`** (exported function) — memoised factory that reads `NODE_PAYMENT_PROVIDER` (default `'fake'`) on first call, looks it up in `PROVIDERS`, and throws on an unknown name. No `reset` function exists by design: one build, one provider, for the lifetime of the process.
- **Re-exports from `./card`** — `cardLastFour` and the `CardDetails` type are re-exported so consumers can `import { CardDetails }` from this barrel.

## Relationships

- **`./card`** — source of the `CardDetails` type and `cardLastFour` helper, both re-exported here.
- **`./fake`** — provides `fakePaymentProvider`, the sole entry in the `PROVIDERS` registry.
- **`../service`** — the payments service calls `resolvePaymentProvider()` and then uses the returned `PaymentProvider` for all charge/refund operations.
- **`../tests/unit/providers.test.ts`** — unit-tests the registry resolution, the env-var default, and the throw-on-unknown-name path.

## Notes

- **Memoisation without reset.** Unlike the analogous `ImageStore` or mailer transport patterns, there is deliberately no `reset` seam. Tests that need a different provider vary `NODE_PAYMENT_PROVIDER` *before* the first `resolvePaymentProvider()` call in a fresh module registry (e.g., `jest.resetModules()`).
- **Loud failure on bad env.** An unrecognised `NODE_PAYMENT_PROVIDER` value throws at the first payment attempt rather than silently falling back to `fake`. This is intentional: silent fake charges in a production-like environment would mask a misconfiguration.
- **Idempotency split.** `refund` is documented as idempotent at the provider side; the *caller* (service) is responsible for only refunding `succeeded` payments.
