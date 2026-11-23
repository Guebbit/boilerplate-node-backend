---
source: src/modules/cart/config.ts
source_sha256: 491c5d7e6acb753d5fe6f4230a6371dd317d7a4845e5901a61a945b3b7baa8a2
context_sha256: d45fc6560069c75bf6f5ceb63086540563a37786410a2aff3fa9d04e3c585052
generated_at: 2026-11-22T04:30:08.897584+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/config.ts

## Purpose
Defines the cart module's operator-tunable settings (cart retention, per-line quantity cap, lines-per-cart cap, open unpaid orders per account) and exposes each as a small typed accessor. The caps bound how much inventory one account can hold (OWASP OAT-021, Denial of Inventory).

## Key elements
- `cartConfig`: the config object built with `defineConfig({ name: 'cart', shape })`. Fields, all `int()`:
  - `NODE_CART_RETENTION_DAYS`: default 365, min 1.
  - `NODE_CART_LINE_MAX_QUANTITY`: default 10, range 1–999.
  - `NODE_CART_MAX_LINES`: default 100, range 1–500.
  - `NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT`: default 2, min 1.
- `cartLineMax()`: returns the most units one cart line may hold, which is the most of one product a single order can freeze.
- `cartMaxLines()`: returns the cap on distinct lines per cart.
- `maxOpenUnpaidOrdersPerAccount()`: returns how many `pending` (unpaid) orders one account may have open at once, whatever the payment method.

## Relationships
- Built on `src/infrastructure/config/define.ts` (`defineConfig`) and `src/infrastructure/config/fields.ts` (`int`).
- The file's own docs describe where the values apply: the line-quantity cap at write time and again at checkout, the line count when adding a new line, and the open-order cap at checkout. This points to the cart services (`items.ts`, `checkout.ts`) and possibly `merge.ts` and `view.ts` as consumers. The visible content does not show which neighbors import which accessor.
- `src/modules/cart/tests/unit/config.test.ts` is the unit test for this file.

## Notes
- Values are read through the accessors on each call, so a changed value applies to the next write.
- Lowering `cartLineMax` does not trim existing lines. An over-quantity line is refused again at checkout.
- Lowering `cartMaxLines` keeps existing lines. Only a new line is refused.
- `NODE_CART_MAX_LINES` is capped at 500 (Shopify's cart ceiling) because `GET /cart` is never paginated, so the bound must hold whatever an operator sets. The default of 100 matches the guest cart's cap and Stripe Checkout's.
- The open-unpaid-order default is 2, not 1. A failed card or a closed 3-D Secure window leaves a `pending` order until its hold expires, and with 1 the retry would be refused in the meantime. Holds last 15 minutes by card and a week by bank transfer or a `processing` card.
- The module doc header carries a `@see` pointer to a configuration doc on who owns these settings. The referenced path is not verified to exist in this repository.
