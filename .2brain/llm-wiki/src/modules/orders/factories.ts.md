---
source: src/modules/orders/factories.ts
source_sha256: 96981659921b892663ae36f0a509c11f28630f59fd5ab814af01ec30fb2973aa
context_sha256: ca286dccafd1d6267c54085e72fe8c7765fb6c3d49d3ecd322a451490de1e044
generated_at: 2026-11-22T06:14:45.212696+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/factories.ts

## Purpose
Test-fixture builder for orders. `makeOrder` turns a caller's partial overrides into an `OrderFixture` ready for `orderRepository.create`. Order items embed a product snapshot (no `ref`), so the builder takes the snapshot as data rather than an id to look up. Stock counts (`onHand`/`reserved`), `deletedAt` on the snapshot and order totals are deliberately not carried, because they are not stored on an order.

## Key elements
- `makeOrder(overrides?)` – builds the fixture:
  - Identity comes from `identityOf({ id, createdAt, updatedAt })`.
  - `userId` becomes an `ObjectId`.
  - `email` defaults to `test@example.com`.
  - `currency` defaults to `shopCurrency()`.
  - `orderNumber` defaults to a generated one.
  - `items` default to `[]`.
- `OrderOverrides` – what a caller may pin, derived from the generated `Order`. It drops `totalItems`, `totalQuantity` and `totalPrice` (derived at serialization). `items` is replaced by `OrderLineInput[]`, and `userId` is added. `status` stays because it is stored.
- `OrderLineInput` – an `OrderItem` minus the derived `current`, `taxAmount` and `netAmount`. `product` is an `OrderSnapshotInput`, and `locale` is optional.
- `OrderSnapshotInput` – a `Product` override with `id`, `title` and `price` required. It replaces `taxClass` with a frozen `taxRate` and adds `preorder`.
- `OrderFixture` – `Partial<OrderDocument>` with a required `_id`.
- `toSnapshot` (private) – converts the contract product into `FrozenOrderLineProduct`. It maps `id` to an `ObjectId` `_id` and ISO date strings to `Date`s, and it strips undefined fields.
- `nextOrderNumber` (private) – returns a sequential `1999-000001`-style number. The year 1999 cannot collide with a real order's number on the unique `orderNumber` index.

## Relationships
- `@infrastructure/persistence/factories`: supplies `identityOf`, `toDate` and `OverridesFor`, which are the shared fixture helpers.
- `@infrastructure/object-guards`: `stripUndefined` keeps unstated fields absent.
- `@infrastructure/i18n`: `getDefaultLocale()` is the default line `locale`.
- `@modules/shop`: `shopCurrency()` is the default order currency.
- `./model`: supplies the `OrderDocument` and `FrozenOrderLineProduct` types the fixture conforms to.
- `@types`: supplies the contract types `Order`, `OrderItem`, `Product` and `Id`.

## Notes
- `status` is passed through, not defaulted. The model's own `default: OrderStatus.pending` covers "not stated".
- The shipping columns, addresses, `paymentMethod`, `payBy`, `paidAt`, `termsVersion`, `notes` and `deletedAt` pass through via `stripUndefined`. An unstated column stays absent. This keeps "not chosen" distinct from "free" (`pickup`, priced 0).
- `makeOrder` destructures its overrides explicitly, so a new `Order` field that is accepted by the type but not added to that list is silently dropped.
- The snapshot's `createdAt`/`updatedAt` come from the catalogue row. Otherwise subdocument timestamps would stamp the order's placement time.
- `orderNumberSequence` is module state, so numbers are unique within a test process only.
