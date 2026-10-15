---
source: src/modules/orders/services/order-numbering.ts
sha256: 642aaed55b817a3706c352dfc7e7e906ccc4abac8b65034fa06eb0eab7e3e15b
generated_at: 2026-10-15T11:08:53.062316+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/order-numbering.ts

## Purpose

Formats the repository's atomic yearly counter into the order number string (`{year}-{sequence}`). This is a receipt number, **not** a tax invoice number. The file contains only the formatting decision; all atomicity lives in the repository.

## Key elements

- **`allocateOrderNumber(): Promise<string>`** — The sole export. Reads the current year in the shop's timezone, calls `orderRepository.incrementOrderNumberCounter(year)`, and returns a zero-padded string like `2026-000041`. Marked `@internal` to prevent sibling services from consuming a sequence slot.
- **`SEQUENCE_WIDTH`** (const, `6`) — Pad width for the sequence portion of the number.

## Relationships

- **`src/modules/orders/config.ts`** — Imports `shopTimezone` to determine which calendar year to use.
- **`src/modules/orders/domain/shop-time.ts`** — Imports `yearInZone` to resolve the year in the shop's local timezone.
- **`src/modules/orders/repository.ts`** — Imports `orderRepository` and calls `incrementOrderNumberCounter(year)`, which performs the atomic increment. This file never touches the DB directly.
- **`src/modules/orders/services/place.ts`** — The caller. `allocateOrderNumber` is a step inside `placeOrder`; the result is stored on `Order.orderNumber` and never re-allocated for that order.
- **`src/modules/orders/tests/integration/order-numbering.test.ts`** — Integration tests exercising the allocation and formatting contract.

## Notes

- **Gaps are intentional and accepted.** If the order write that follows allocation fails, the burned number is never reused or rolled back. This mirrors Shopify's `#1001` behavior. Do not add retry/rollback logic here.
- **Called exactly once per order.** A re-downloaded receipt always shows the same number; the function is not idempotent by design (each call consumes a sequence slot).
- **`@internal` is load-bearing.** The export is deliberately not re-exported through any barrel so that no other service can accidentally call it and waste a sequence number.
- The year used is the shop's timezone year (`NODE_SHOP_TIMEZONE`), not UTC — an order placed in late December UTC but January shop-time will get the next year's prefix.
