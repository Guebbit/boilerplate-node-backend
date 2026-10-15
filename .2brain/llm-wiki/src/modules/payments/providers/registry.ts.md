---
source: src/modules/payments/providers/registry.ts
sha256: 638e810fb125fc3dbcc71dd2c6123063147d845a21462beac5e11e09a2ec55c8
generated_at: 2026-10-15T11:27:42.994154+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/registry.ts

## Purpose

A lightweight, runtime-import-minimal file that exposes a shared payment-provider registry. It exists in isolation so that test doubles can call `registerPaymentProvider` without pulling in the full `./index` module (config, orders, and their transitive dependencies).

## Key elements

- **`paymentProviderRegistry`** — A `SharedProviderRegistry<PaymentProvider>` instance keyed under `'payments'`. Created via `createSharedProviderRegistry`, which guarantees the registry is the same object across all module instances in the process, so a registration made at preload survives subsequent module resets.
- **`registerPaymentProvider(name, provider)`** — Registers (or, in tests, overrides) a single `PaymentProvider` implementation by the name `NODE_PAYMENT_PROVIDER` would select. Thin wrapper around `paymentProviderRegistry.register`.

## Relationships

- **`src/infrastructure/runtime/provider-registry.ts`** — Provides `createSharedProviderRegistry`, the factory used to instantiate the shared registry. This is the only runtime import in the file.
- **`src/modules/payments/providers/index.ts`** — Source of the `PaymentProvider` type (imported as `type` only, no runtime cost). Deliberately *not* loaded at runtime by this file; the module docblock explicitly calls out that `./index` pulls in config, orders, etc.
- **`scenarios/support/doubles/payments/register.ts`** — Consumes `registerPaymentProvider` to install the `fake` payment provider before application code resolves the registry.

## Notes

- Production code does **not** register a provider here. A real PSP is added as its own file that calls `registerPaymentProvider` once; this file simply provides the mechanism.
- The `PaymentProvider` import is type-only (`import type`), so bundlers eliminate it. The sole runtime dependency is the registry helper — this is the file's reason to exist as a separate module rather than living inside `./index`.
- Because the registry is process-wide shared, calling `registerPaymentProvider` in a test mutates state visible to all modules in that process. Tests that override a provider should account for cross-test contamination (or rely on the fact that the registry intentionally supports override semantics for this purpose).
