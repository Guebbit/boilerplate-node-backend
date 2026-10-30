---
source: src/modules/payments/providers/registry.ts
sha256: e5958cd2cd8625afdf7244bfbf2b7b049523110f0a8b9df51d2626d3626626bc
generated_at: 2026-10-29T05:08:13.487865+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/registry.ts

## Purpose

Standalone registry for payment provider implementations. It exists as its own module (importing only the registry helper and a *type* from `./index`) so that test doubles can register themselves at preload without pulling in the full provider barrel—config, orders, and all transitive dependencies.

## Key elements

- **`paymentProviderRegistry`** — A shared `PaymentProvider` registry instance created via `createSharedProviderRegistry('payments')`. Shared across module instances so a double registered before a module reset remains available after it.
- **`registerPaymentProvider(provider: PaymentProvider): void`** — Registers (or overrides, in tests) one provider implementation under its own `provider.name`. That name is the same value selected by `NODE_PAYMENT_PROVIDER` and persisted on each payment record, preventing the two from diverging.

## Relationships

- **`src/infrastructure/runtime/provider-registry.ts`** — Provides `createSharedProviderRegistry`, the generic shared-registry factory this file calls.
- **`src/modules/payments/providers/index.ts`** — Source of the `PaymentProvider` type (imported as a type-only import; no runtime coupling).
- **`scenarios/support/doubles/payments/register.ts`** — The `fake` test double that calls `registerPaymentProvider` to insert itself into the registry.
- **`src/modules/payments/services/refunds.ts`**, **`refund-sync.ts`**, **`external-refunds.ts`**, **`post-payment-webhook.ts`** — Consumer modules that resolve a provider from this registry at runtime to execute PSP-specific operations.
- **`src/modules/payments/tests/contract/api.contract.test.ts`** — Registers a double to exercise contract-level assertions.

## Notes

- **Production registers nothing in this file.** A real PSP ships its own file that makes a single `registerPaymentProvider` call; this module only provides the mechanism.
- **Type-only import from `./index`.** Deliberate: importing a value from that barrel would drag in config, orders, and their dependencies at runtime, defeating the isolation this file exists to provide.
- **`provider.name` is the single source of truth** for both environment-variable selection (`NODE_PAYMENT_PROVIDER`) and the value stored on payment records. Do not introduce a separate identifier.
