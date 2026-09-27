---
source: tests/support/checkout-modules.ts
sha256: 82d3f1a3ec4057db5e518e667d74c2f40ce7ed0236f5ea2503896f46e00b45dc
generated_at: 2026-09-27T15:59:12.774876+00:00
model: ollama:qwen3.8:27b
---

# tests/support/checkout-modules.ts

## Purpose

Provides a single helper, `registerCheckoutModules`, that registers the fixed set of modules required by every checkout-flow integration test. It exists so that test files don't each repeat the same import-and-register boilerplate and so that the module set stays consistent across suites.

## Key elements

- **`registerCheckoutModules(extra?: AppModule[])`** — Registers a fixed list of modules (`accountModule`, `deliveryModule`, `productsModule`, `usersModule`, `inventoryModule`, `ordersModule`, `cartModule`) plus any caller-supplied modules in `extra`. Returns `void`.

## Relationships

- **Depends on** `src/kernel/registry.ts` for the `registerModules` function and the `AppModule` type used as the `extra` parameter's element type.
- **Depends on** the seven module files it registers: `src/modules/{account,cart,delivery,inventory,orders,products,users}/module.ts`. It imports each module's default export and passes them into `registerModules`.
- **Depended on by** integration test files (e.g. cart, orders, payments, products tests, and `product-removal-protects-orders.test.ts`), which call `registerCheckoutModules` in their setup to wire up the kernel before exercising a specific flow. Tests that need `paymentsModule` pass it as an `extra` argument.

## Notes

- `paymentsModule` is **intentionally absent** from the fixed set. Only suites that assert on payment behavior add it via the `extra` parameter, keeping subscription registration scoped to tests that actually exercise it.
- The module array order inside the function is fixed; `extra` modules are always appended last.
