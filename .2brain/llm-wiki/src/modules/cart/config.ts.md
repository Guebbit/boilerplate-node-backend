---
source: src/modules/cart/config.ts
sha256: c7542ec53719ec1ae7cfe69f45de90c030a2a292d24fc459a3eaba823b9290f5
generated_at: 2026-11-14T19:27:16.522170+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/config.ts

## Purpose

Defines the four operator-tunable numeric limits for the cart module (retention period, per-line quantity, per-cart line count, and open-unpaid-order cap) and exposes typed accessor functions that the rest of the module reads at call time.

## Key elements

- **`cartConfig`** – A `defineConfig` object (name: `"cart"`) with four `int` fields: `NODE_CART_RETENTION_DAYS`, `NODE_CART_LINE_MAX_QUANTITY`, `NODE_CART_MAX_LINES`, `NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT`.
- **`cartLineMax()`** – Returns the per-line quantity ceiling (1–999). Read at write time; a line filled before a lower value is refused at checkout rather than trimmed.
- **`cartMaxLines()`** – Returns the per-cart line cap (1–500). Bounds the un-paginated `GET /cart` response. New lines beyond the cap are refused; existing lines are never pruned.
- **`maxOpenUnpaidOrdersPerAccount()`** – Returns the cap on concurrent `pending` orders per account. Prevents a single account from holding stock across many uncompleted orders.

## Relationships

- **`src/infrastructure/config/define.ts` / `src/infrastructure/config/fields.ts`** – Supplies the `defineConfig` builder and the `int` field type used to declare each knob with its default, min, and max.
- **`src/modules/cart/services/items.ts`** – Consumes `cartLineMax()` and `cartMaxLines()` to validate add/update operations.
- **`src/modules/cart/services/checkout.ts`** – Consumes `maxOpenUnpaidOrdersPerAccount()` (and `cartLineMax()`) to gate order placement.
- **`src/modules/cart/services/merge.ts` / `src/modules/cart/services/view.ts`** – Read `cartMaxLines()` when assembling or merging cart state.
- **`src/modules/cart/model.ts` / `src/modules/cart/repository.ts`** – Enforce the same caps at the persistence layer so stored data stays within the configured bounds.
- **`src/modules/cart/module.ts`** – Wires the config into the module lifecycle.
- **`src/modules/cart/tests/unit/config.test.ts`** – Unit-tests the accessor functions and field constraints.

## Notes

- `NODE_CART_MAX_LINES` is hard-capped at **500** (Shopify's own ceiling) in the field definition; an operator cannot push it past that via environment config.
- All accessors are **functions** (`cartLineMax()`), not plain values, so each call reads the current config snapshot. Changing an env var takes effect on the next call without a restart.
- The `max: 500` on `NODE_CART_MAX_LINES` is intentional: because `GET /cart` is never paginated, the bound must be enforced structurally regardless of what an operator sets.
- The default of `2` (not `1`) for `NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT` is deliberate: a failed 3-D Secure or declined card leaves a `pending` order until its hold expires, and a cap of `1` would block the legitimate retry.
- The three inventory-denial knobs (`cartLineMax`, `maxOpenUnpaidOrdersPerAccount`, and the reservation window) are referenced collectively under OWASP OAT-021 (Denial of Inventory).
