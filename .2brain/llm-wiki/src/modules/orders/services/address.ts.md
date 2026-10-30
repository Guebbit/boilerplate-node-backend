---
source: src/modules/orders/services/address.ts
sha256: 3ea33b5bf648a563c60c6300e6db19efee2baf293ec6555b31b84ac3dfb8f09e
generated_at: 2026-10-29T04:45:32.280485+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/address.ts

## Purpose

Implements the staff-facing `PUT /orders/{id}/shipping-address` operation: replacing the shipping address for units that have not yet been dispatched, while leaving addresses on already-cut shipments untouched. It exists as the single correction path for held `incorrect_address` fulfillment orders and as a general post-checkout address fix before full fulfillment.

## Key elements

- **`correctShippingAddress(orderId, address, context)`** – the sole export. Validates the order exists, is address-correctable, and targets a supported ship-to country; then atomically replaces the address inside a DB transaction, writes a timeline entry, and records an audit row. Returns `200` with the updated order, or `404` / `422` / `409` on failure.
- **`locked()`** – builds the `409 ORDER_ADDRESS_LOCKED` rejection (order fully shipped, no shipping address, or a race lost after the read).
- **`unsupportedCountry()`** – builds the `422 ORDER_SHIP_TO_COUNTRY_NOT_SUPPORTED` rejection (country not in the shop's ship-to list).

## Relationships

- **`@infrastructure/http/response`** – builds all success/reject HTTP envelopes.
- **`@infrastructure/i18n`** – provides `t()` for user-facing error messages.
- **`@infrastructure/observability/audit`** – calls `recordAudit` after a successful write to log the admin action.
- **`@infrastructure/runtime/database`** – wraps the write in `withTransaction`.
- **`@modules/shop` (index)** – reads `shipToCountries()` to reject unsupported destinations.
- **`@modules/orders/audit`** – supplies the `ordersAuditActions.ADMIN_ORDER_ADDRESS_CORRECTED` action constant.
- **`@modules/orders/domain` (index)** – calls `canCorrectAddress(order)` to gate the operation on order state.
- **`@modules/orders/model`** – `OrderDocument` is the response payload type.
- **`@modules/orders/repository`** – `orderRepository.findByIdScoped` for the initial read; `orderRepository.replaceShippingAddress` for the write.
- **`@modules/orders/services/timeline`** – `withTimeline` appends an `address_corrected` timeline entry within the same transaction.
- **`@types` (auth-context)** – `CallerContext` and `OrderAddress` types for the function signature.

## Notes

- The address value is **never** written to the audit or timeline rows—only the actor identity is recorded. This is a deliberate privacy boundary.
- The `409` can fire in two distinct ways: the pre-check (`canCorrectAddress` / no shipping address) or a **post-transaction race** (the `updated` result is `null`, meaning a concurrent dispatch or status change invalidated the write). Both map to the same user-facing code.
- The country whitelist is the *same* list checkout enforces; the rationale is that a post-checkout redirect to an unsupported country would invalidate the VAT already charged.
- Each shipment row stores its own address copy, so correcting the order does not retroactively alter parcels already in the mail.
