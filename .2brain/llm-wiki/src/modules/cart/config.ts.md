---
source: src/modules/cart/config.ts
sha256: 2a557a7809489fd8d538a8f90610b0adf620b1c506d41735627f54a2240ff5ea
generated_at: 2026-11-08T05:11:10.285043+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/config.ts

## Purpose

Declares the three runtime-tunable knobs that govern cart lifetime, per-line quantity, and the per-account cap on open unpaid orders. Each value is validated at read time through the shared config infrastructure, keeping business limits in one auditable place rather than scattered across services.

## Key elements

- **`cartConfig`** — The `defineConfig` instance (name `"cart"`) whose shape defines three integer fields: `NODE_CART_RETENTION_DAYS` (default 365, min 1), `NODE_CART_LINE_MAX` (default 10, min 1, max 999), and `NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT` (default 2, min 1).
- **`cartLineMax()`** — Returns the current per-line unit ceiling. Read at write time, so a lower value takes effect on the *next* write; an already-filled line is re-checked (and possibly refused) at checkout rather than silently trimmed.
- **`maxOpenUnpaidOrdersPerAccount()`** — Returns the cap on simultaneously `pending` (unpaid) orders per account. Prevents a single account from hoarding inventory across many incomplete orders (OWASP OAT-021, Denial of Inventory).

## Relationships

- **`src/infrastructure/config/define.ts`** — Provides `defineConfig`, the function that constructs the validated config object.
- **`src/infrastructure/config/fields.ts`** — Provides the `int` field descriptor used to declare each key's type, default, and bounds.
- **`src/modules/cart/services/items.ts`** — Consumes `cartLineMax()` to enforce the per-line quantity cap on writes.
- **`src/modules/cart/services/merge.ts`** — Consumes `cartLineMax()` when merging cart lines so the combined quantity does not exceed the ceiling.
- **`src/modules/cart/services/checkout.ts`** — Consumes `maxOpenUnpaidOrdersPerAccount()` to reject a checkout when the account already holds the maximum number of unpaid orders.
- **`src/modules/cart/tests/unit/config.test.ts`** — Unit-tests the default values, bounds, and accessor functions defined here.

## Notes

- The default for `NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT` is **2**, not 1, so that a failed card or expired 3-D Secure window (which leaves a `pending` order until its stock-hold expires) does not block an immediate retry.
- `cartLineMax()` is one of three "denial-of-inventory" safeguards (alongside the open-order cap and the per-payment-method reservation window) that bound how much stock a single account can hold simultaneously.
- All three values are read through accessor functions that call `cartConfig()` each time, meaning they pick up environment or runtime overrides on every call rather than being frozen at module load.
