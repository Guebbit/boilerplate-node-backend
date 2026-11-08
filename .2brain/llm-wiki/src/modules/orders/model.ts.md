---
source: src/modules/orders/model.ts
sha256: aa845a7128ddaeb3c1042a6322647926cb1d8cd11b122abf42fca2e236e2891d
generated_at: 2026-11-08T06:52:47.901308+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/model.ts

## Purpose
Defines the Mongoose schema, TypeScript document interfaces, and the serialization transform for the order aggregate. It is the single source of truth for what an order document looks like in the database (embedded product snapshots, stamped status fields, PII clock fields) and what `applyOrderTransform` adds at read time (the wire-only totals `totalItems`, `totalQuantity`, `totalPrice`).

## Key elements
- **`FrozenOrderLineProduct`** – Type alias: `ProductSnapshot` minus `taxClass`, plus the resolved `taxRate: number` and an optional `preorder` flag. Used as the embedded `product` on every order line.
- **`OrderDocumentItem`** – Interface for one item in `items[]`: the frozen product, `quantity`, optional `backorderedQuantity` / `promisedAt` / `promiseDated`, and the `locale` in which the title/description were resolved.
- **`OrderReference`** – Minimal `{ id, orderNumber, email }` shape other modules use to reference an order.
- **`OrderDocument`** – Full document interface extending `Omit<Order, …>` with `Document`. Overrides `userId` (optional, erased-account case), `items`, `status`, and re-declares date fields as `Date`. Adds `orderNumber`, `currency`, `piiClockStartedAt`, `paidAt`, `withdrawUntil`, `moneyReceivedAt`, `conformityUntil`, `conformityExtendedAt`, `paymentStatus`, `returnStatus`, `fulfillment`.
- **`OrderModel`** – `Model<OrderDocument>`; exported for repository/service typing.
- **`orderAddressSchema`** – Shared sub-schema (`_id: false`) for `shippingAddress` and `billingAddress`.
- **`orderLineProductSchema`** (truncated) – The embedded Mongoose schema for the product snapshot; deliberately has no `ref`.
- **`applyOrderTransform`** (referenced in docstring) – Serialization hook that derives `totalItems`, `totalQuantity`, `totalPrice` from `items` on every response.
- **Schema plugins applied** – `revisionPlugin`, `moneyPlugin`, and `applySerialization` are wired into the order schema.

## Relationships
- **`src/infrastructure/persistence/money-field.ts`** – Imports `moneyPath` and `moneyPlugin`; the money plugin registers virtual/money-aware fields on the order schema.
- **`src/infrastructure/persistence/revision-plugin.ts`** – Imports `revisionPlugin`; provides optimistic-concurrency `_revision` tracking on the document.
- **`src/infrastructure/persistence/serialize.ts`** – Imports `applySerialization`; the single serialization point that invokes `applyOrderTransform` to attach derived totals.
- **`src/modules/cart/services/checkout.ts`** – Consumes `OrderModel` / `OrderDocument` to persist a newly placed order (the write path that stamps `orderNumber`, `currency`, and initial `items`).
- **`src/modules/delivery/services/*.ts`** (`act`, `actions`, `announce`, `deliver`, `ensure`, `found`, `fulfill`, `holds`, `lost`, `notice`) – Read and write the `fulfillment` field (`FulfillmentSummary`) on the order document; `fulfill.ts` writes it via `recordFulfillmentProgress` inside the act's transaction.
- **`scenarios/flows/backdate.ts`** – Uses `OrderDocumentItem.promisedAt` / `promiseDated` and `backorderedQuantity` to construct backdated order fixtures.

## Notes
- Product lines are **embedded snapshots**, not `ref` pointers. There is no `populate()` path; the embedded schema is intentionally narrower than the catalogue's (`taxClass` removed, `taxRate` added).
- `locale` lives on the **item**, not the product, because it describes the resolution context of the whole line, not an attribute of the product itself.
- `totalItems`, `totalQuantity`, `totalPrice` are **never persisted**. Omitting them from `OrderDocument` (via `Omit<…>`) keeps the type honest; the contract marks them required because `applyOrderTransform` always fills them.
- `paidAt` doubles as the cross-module "invoice exists?" proxy so that `orders` does not import `invoicing` (which itself depends on `orders`). The documented gap: a failed `ORDER_STATUS_CHANGED` listener can leave the two out of sync.
- `moneyReceivedAt` is **internal-only** (never on the wire) and guards against hard-deletion when a late payment/refund pair exists.
- `conformityExtendedAt` is set **at most once** per order (12-month repair extension under Directive 2024/1799).
- `orderAddressSchema` uses `_id: false` to satisfy the `additionalProperties: false` constraint on the shared `OrderAddress` contract type.
