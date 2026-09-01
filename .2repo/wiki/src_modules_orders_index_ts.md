# src/modules/orders/index.ts

## Purpose

Public barrel for the **orders** module. It is the *only* import surface available to sibling modules (cart, delivery, payments). Internal types (`Money`, `ORDER_LIFECYCLE`, `OrderDocumentItem`) and the raw schema/transform are deliberately excluded so external code can never reach past the intended API.

## Key elements

- **`orderService`** (from `./service`) — the main orders service; the primary entry point for any module that needs order operations.
- **`orderRepository`** (from `./repository`) — exposed separately so `cart`'s checkout can perform its own transactional writes (e.g. clearing the cart) and roll back without going through the service.
- **`retractOrder`** (from `./service`) — shared compensation routine used both by this module's own `create` and by `cart`'s checkout when a later step refuses an already-written order.
- **`ORDER_CANCELLED` / `ORDER_STATUS_CHANGED`** (from `./events`) — event name constants so consumers subscribe without importing the events module directly.
- **`orderConfirmEmail`** (from `./emails`) — the email-builder; `cart` invokes it from its own checkout because only checkout has the recipient's locale in scope.
- **`OrderDocument`** (type, from `./model`) — the read-only document shape. `OrderDocumentItem` is *not* re-exported; tests use a fixture (`toOrderItem` in `tests/fixtures.ts`) instead.
- **`sumLineItems` / `orderTotal` / `canTransition` / `statusesLeadingTo`** (from `./domain`) — arithmetic and lifecycle helpers published so `cart`/`payments` reuse the module's single source of truth rather than duplicating logic.

## Relationships

- **`src/modules/orders/service.ts`** — source of `orderService` and `retractOrder`.
- **`src/modules/orders/repository.ts`** — source of `orderRepository`; consumed directly by `cart/services/checkout.ts` for transactional cart-clearing.
- **`src/modules/orders/domain/index.ts`** — source of the four exported arithmetic/lifecycle functions.
- **`src/modules/orders/emails.ts`** — source of `orderConfirmEmail`.
- **`src/modules/orders/events.ts`** — source of the two exported event constants.
- **`src/modules/orders/model.ts`** — source of the `OrderDocument` type.
- **`src/modules/cart/services/checkout.ts`** — the primary consumer; imports `orderRepository`, `retractOrder`, `orderConfirmEmail`, and the domain helpers to run its own checkout transaction.
- **`src/modules/cart/services/reorder.ts`** — reorders an existing order; relies on the barrel for service/domain access.
- **`src/modules/delivery/service.ts` / `module.ts`** — consume `orderService` and event constants to react to order status changes.

## Notes

- `Money` and `ORDER_LIFECYCLE` are intentionally **not** re-exported; only tests may reach `./model` directly for them.
- `OrderDocumentItem` is withheld on purpose: forcing tests through the `toOrderItem` fixture prevents ad-hoc casting of order lines.
- The compensation path (`retractOrder`) is exported *once* rather than duplicated in `cart`; the two failure paths (orders `create` failure, cart checkout refusal) are treated as a single concern.
- `cart` reports `order_created` itself; this module never reaches up for a `Request` object.
