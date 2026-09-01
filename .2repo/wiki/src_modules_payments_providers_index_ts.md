# src/modules/payments/providers/index.ts

## Purpose

Defines the `PaymentProvider` port (interface), the `ChargeOutcome` type, and a memoised, env-driven resolver that selects which concrete provider implementation answers at runtime. It is the single seam a real PSP (e.g. Stripe) plugs into without touching the rest of the payments module.

## Key elements

- **`ChargeOutcome`** — union type `'succeeded' | 'declined'`; the only non-throwing results a `charge()` call can return.
- **`PaymentProvider`** — the interface every provider must satisfy: a `name` string, a `charge(charge, card)` async method, and a `refund(charge)` async method.
- **`PROVIDERS`** — a `Record<string, PaymentProvider>` registry; currently maps `"fake"` → `fakePaymentProvider`. Adding a live provider means dropping a new file here and adding one line.
- **`provider`** (module-level) — memoised cache slot; `undefined` until first resolution.
- **`resolvePaymentProvider()`** — reads `NODE_PAYMENT_PROVIDER` (default `"fake"`), looks up the registry, caches the result, and returns the instance.
- **Re-exports** — `cardLastFour` and the `CardDetails` type are re-exported from `./card` so consumers can import them from this barrel.

## Relationships

- **`providers/card.ts`** — source of the `CardDetails` type and `cardLastFour` helper re-exported here; `CardDetails` is also the parameter type on `PaymentProvider.charge`.
- **`providers/fake.ts`** — supplies `fakePaymentProvider`, the default entry in the `PROVIDERS` registry.
- **`service.ts`** — the primary consumer; calls `resolvePaymentProvider()` to obtain the active instance before delegating `charge`/`refund`.
- **`tests/unit/providers.test.ts`** — exercises the provider contract (likely against the fake) and the resolution logic.

## Notes

- **Memoisation is one-shot.** `resolvePaymentProvider()` caches on first call; mutating `NODE_PAYMENT_PROVIDER` in a test after the first invocation has no effect. Reset requires a page reload or a test helper that clears the module.
- **Silent misconfiguration.** A typo in `NODE_PAYMENT_PROVIDER` resolves to `undefined`; the failure surfaces as a thrown TypeError on the first `.charge()` call rather than a descriptive "unknown provider" message.
- **`declined` is a return, not a throw.** Only transport/infrastructure failures throw. Callers must branch on the `ChargeOutcome` value to handle declines.
- **`refund` idempotency is the provider's contract.** The caller's guard is solely "only refund payments whose status is `succeeded`."
