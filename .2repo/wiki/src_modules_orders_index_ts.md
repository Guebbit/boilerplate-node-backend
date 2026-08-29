# src/modules/orders/index.ts

## Purpose

Public barrel (single import surface) for the Orders module. It curates *what* sibling modules are allowed to pull in and documents *why* each export is published or withheld. By convention (mirroring `modules/products/index.ts`), this is the only path another module should use to import order functionality.

## Key elements

- **`orderService`** — the standard service entry point for order operations.
- **`orderRepository`** — exported so `cart/checkout` can write the order row inside its own transaction and roll it back if clearing the cart fails. Cart deliberately bypasses the service layer here to avoid unwrapping a response envelope.
- **`ORDER_CANCELLED`, `ORDER_STATUS_CHANGED`** — event constants for listeners (e.g., payments, delivery) to subscribe to lifecycle changes.
- **`orderConfirmEmail`** — the confirmation-email function, called by `cart/checkout` after it has confirmed the order stood (only checkout knows that; only the service has the recipient record in scope).
- **`OrderDocument`** (type) — the serialized order shape exposed to consumers.
- **`sumLineItems`, `orderTotal`** — the single-owner arithmetic for order money. Exported as *rules*, not utilities, so no sibling module re-derives a total independently.
- **`canTransition`, `statusesLeadingTo`** — status-transition predicates published so `payments` doesn't form its own opinion on which statuses are payable.

**Deliberately excluded:**

- Schema / serialization transform — tests reach `@modules/orders/model` directly; no sibling embeds an order.
- `Money` and `ORDER_LIFECYCLE` — internal to the module; no external caller needs them.
- `OrderDocumentItem` — removed from the public surface; tests now build lines via `tests/factory.ts` → `toOrderItem` instead of casting a partial shape.

## Relationships

- **`cart/services/checkout.ts`, `reorder.ts`, `view.ts`** — import `orderRepository`, the event constants, and `orderConfirmEmail` through this barrel. Checkout performs the write + rollback transaction directly against the repository.
- **`delivery/module.ts`, `delivery/service.ts`** — consume `orderService` and/or the transition helpers to react to status changes (e.g., shipping on `paid`).
- **`orders/domain/index.ts`** — source of `sumLineItems`, `orderTotal`, `canTransition`, `statusesLeadingTo`; this barrel re-exports them unchanged.
- **`orders/emails.ts`** — source of `orderConfirmEmail`.
- **`orders/events.ts`** — source of `ORDER_CANCELLED`, `ORDER_STATUS_CHANGED`.
- **`orders/model.ts`** — source of the `OrderDocument` type (and the internal schema/transform kept private).
- **`orders/repository.ts`** — source of `orderRepository`.
- **`orders/service.ts`** — source of `orderService`.
- **`cart/tests/integration/*`** — exercise the full checkout → order-creation path that flows through the repository export.

## Notes

- The barrel is a **policy document as much as an import list**: the block comments explain the ownership rationale for every inclusion/exclusion. When adding or removing an export, the accompanying justification comment is expected.
- `cart` calling `orderService.recordCreated` (rather than the service emitting the event itself) is intentional: only checkout knows the order actually stood, so the event is reported from the caller's side.
- Do **not** widen this surface to satisfy a test-only need; the established pattern is for tests to import the concrete path (e.g., `@modules/orders/model`) directly.
