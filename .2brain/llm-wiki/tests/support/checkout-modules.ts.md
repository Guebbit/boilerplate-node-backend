---
source: tests/support/checkout-modules.ts
sha256: 82d3f1a3ec4057db5e518e667d74c2f40ce7ed0236f5ea2503896f46e00b45dc
generated_at: 2026-11-08T09:52:24.338705+00:00
model: ollama:qwen3.8:27b
---

# tests/support/checkout-modules.ts

## Purpose

Shared test helper that registers the core set of modules required by every checkout-flow integration test in one call. It exists so each test file does not repeat the same seven-module registration list, and so a test can opt into additional modules (e.g. `paymentsModule`) without forcing unrelated suites to subscribe to events they never assert on.

## Key elements

- **`registerCheckoutModules(extra?: AppModule[]): void`** — the sole export. Calls `registerModules` with a fixed array (account, delivery, products, users, inventory, orders, cart) appended with any caller-supplied `extra` modules. No return value.

## Relationships

- **`src/kernel/registry.ts`** — source of `registerModules` (called) and the `AppModule` type (used as the parameter type).
- **`src/modules/account/module.ts`**, **`src/modules/cart/module.ts`**, and the other five module files (delivery, products, users, inventory, orders) — imported and passed into the fixed registration array.
- **Account integration tests** (`erasure-ledger`, `purge-deletions`, `staff-restore`) and **cart integration tests** (`backorder`, `checkout-interleavings`, `checkout-stock-divergence`, `line-availability`, `merge`, `preorder`, `product-removal-protects-orders`, `product-restored-meanwhile`, `service`) — consumers that import `registerCheckoutModules` to set up their module environment before running assertions.

## Notes

- The doc comment explicitly calls out that `paymentsModule` is *not* in the fixed set by design. If a test exercises payment logic, it must pass the module via the `extra` parameter; forgetting to do so means payment events/subscriptions are silently absent.
- The fixed array order (account → delivery → products → users → inventory → orders → cart) is the registration order passed to `registerModules`; if module initialization has ordering dependencies, this sequence matters.
