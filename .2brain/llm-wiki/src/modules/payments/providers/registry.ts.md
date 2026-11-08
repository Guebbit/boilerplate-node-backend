---
source: src/modules/payments/providers/registry.ts
sha256: e5958cd2cd8625afdf7244bfbf2b7b049523110f0a8b9df51d2626d3626626bc
generated_at: 2026-11-08T07:23:46.595847+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/registry.ts

## Purpose

Provides a single, process-wide registry of payment provider implementations. It exists as an isolated module (importing only the registry helper and a type) so that test doubles can register themselves at preload without pulling in the full provider stack (config, orders, etc.) that `./index` would otherwise load.

## Key elements

- **`paymentProviderRegistry`** — A `SharedProviderRegistry<PaymentProvider>` instance scoped to `'payments'`. Shared across module instances so a double registered before a test resets modules still resolves correctly.
- **`registerPaymentProvider(provider)`** — Registers (or overrides, in tests) a `PaymentProvider` under its own `provider.name`. That name is the same value selected by the `NODE_PAYMENT_PROVIDER` env var and persisted on each payment record, guaranteeing lookup and persistence always agree.

## Relationships

- **`src/infrastructure/runtime/provider-registry.ts`** — Supplies `createSharedProviderRegistry`, the generic registry factory this file wraps.
- **`src/modules/payments/providers/index.ts`** — Source of the `PaymentProvider` interface (imported type-only here). Production PSP implementations are registered via `registerPaymentProvider` from their own files; `./index` re-exports the public surface.
- **`scenarios/support/doubles/payments/register.ts`** — The test double for the `fake` provider; calls `registerPaymentProvider` at preload so tests get a working provider without the production module graph.
- **`src/modules/payments/services/refunds.ts`, `external-refunds.ts`, `refund-sync.ts`, `controllers/post-payment-webhook.ts`** — Consumers that resolve a concrete provider from `paymentProviderRegistry` by name to dispatch webhook processing or refund operations.
- **`src/modules/payments/repository.ts`** — Persists the provider name alongside each payment; the registry is the runtime counterpart that maps that name back to an implementation.
- **`src/modules/payments/tests/contract/api.contract.test.ts`** — Contract tests that rely on a registered (likely `fake`) provider being resolvable from the registry.

## Notes

- **Registration is additive and name-keyed.** A production PSP ships its own file containing exactly one `registerPaymentProvider` call. There is no central "provider list" to edit — adding or swapping a PSP never touches this file.
- **Test override semantics.** In tests, calling `registerPaymentProvider` with the same `name` replaces the prior entry, enabling per-test substitution without monkey-patching.
- **Shared-instance guarantee.** Because the registry is created via `createSharedProviderRegistry`, it survives Jest/Vitest module resets. A double registered in a global setup or preload hook remains available even after individual test files re-import modules.
