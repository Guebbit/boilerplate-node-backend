---
source: src/modules/payments/providers/registry.ts
sha256: e009528dc26fe4a149d45956a2344539ce78c86ceef6edd147b8ab87b9f781bb
generated_at: 2026-11-14T21:03:21.998609+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/registry.ts

## Purpose

A standalone payment-provider registry that can be imported in isolation without pulling in the full `./index` module (which loads the payments config chain: config store, `ibantools`). It exists so test doubles can register themselves at preload time without triggering that dependency tree, and so production PSPs can self-register with a single call in their own file.

## Key elements

- **`paymentProviderRegistry`** — A shared registry instance (`createSharedProviderRegistry<PaymentProvider>('payments')`) keyed to the `'payments'` namespace. Shared across module instances so a double registered before a module reset is still visible after it.
- **`registerPaymentProvider(provider: PaymentProvider): void`** — Registers (or, in tests, overrides) a provider under its own `provider.name`. That name is the value `NODE_PAYMENT_PROVIDER` selects and the value persisted on each payment, keeping the two in lockstep.

## Relationships

- **`src/infrastructure/runtime/provider-registry.ts`** — Runtime dependency: provides `createSharedProviderRegistry`, the only runtime import in this file.
- **`src/modules/payments/providers/index.ts`** — Type-only dependency: supplies the `PaymentProvider` interface. Deliberately kept separate from the runtime path so importing this file never loads the config chain that `index` pulls in.
- **`scenarios/support/doubles/payments/register.ts`** — The test-double registration entry point that calls `registerPaymentProvider` to install the `fake` provider without touching production module state.

## Notes

- **No runtime imports beyond the registry helper.** This is intentional; the file's only runtime dependency is `createSharedProviderRegistry`. The `PaymentProvider` import is type-only.
- **Production registers nothing here.** A real PSP adds its own file containing a single `registerPaymentProvider` call. This file never contains a concrete implementation.
- **Idempotent / overridable.** Calling `registerPaymentProvider` twice with the same `name` replaces the prior entry, which is the mechanism tests use to swap the fake in and out.
