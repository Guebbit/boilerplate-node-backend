---
source: src/modules/cart/config.ts
sha256: 2a557a7809489fd8d538a8f90610b0adf620b1c506d41735627f54a2240ff5ea
generated_at: 2026-10-15T10:22:24.103683+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/config.ts

## Purpose
Defines the three runtime-adjustable knobs for the cart module—retention period, per-line quantity ceiling, and open-unpaid-order cap—and exposes typed accessor functions that read them. It exists so that inventory-denial guards (OWASP OAT-021) and cart lifecycle rules can be tuned without code changes.

## Key elements
- **`cartConfig`** – The `defineConfig` instance (name `"cart"`) declaring the shape of all three keys with `int` validators (min/max/default). This is the single source of truth for allowed values.
- **`cartLineMax(): number`** – Returns the per-line ceiling (1–999). Read at write time, so a lower value taken after the fact does **not** trim existing lines; they are simply refused again at checkout.
- **`maxOpenUnpaidOrdersPerAccount(): number`** – Returns how many `pending` orders one account may hold simultaneously (default 2). Bounds stock reservation across multiple uncompleted orders.

## Relationships
- **`src/infrastructure/config/define.ts` / `fields.ts`** – Provides `defineConfig` and the `int` field validator used to declare and validate the shape.
- **`src/modules/cart/services/checkout.ts`** – Consumes `maxOpenUnpaidOrdersPerAccount` to gate new order creation and `cartLineMax` to validate line quantities.
- **`src/modules/cart/services/items.ts`** – Calls `cartLineMax` when adding or updating line quantities.
- **`src/modules/cart/services/merge.ts`** / **`reorder.ts`** – Read `cartLineMax` to enforce the ceiling when combining or re-ordering lines.
- **`src/modules/cart/model.ts`** – The cart entity's line-count and order-status fields are the things these knobs constrain.
- **`src/modules/cart/repository.ts`** – Uses `cartConfig().NODE_CART_RETENTION_DAYS` to determine how long stale carts are kept before purge.
- **`src/modules/cart/module.ts`** – Wires the config and services together at module init.
- **`src/modules/cart/tests/unit/config.test.ts`** – Unit-tests the accessor functions and validator bounds.

## Notes
- `cartLineMax` is intentionally **read at write time**, not snapshotted onto existing lines. Lowering the value after a line is filled does not silently trim it; the line simply fails validation on the next write or at checkout.
- The open-order cap defaults to **2**, not 1: a failed card charge or a closed 3-D Secure window leaves a `pending` order until its hold expires (15 min card / 1 week bank transfer), so a cap of 1 would block the immediate retry.
- All three keys are prefixed `NODE_` following the infrastructure naming convention for environment-overridable settings (see `docs/tools/configuration.md`).
