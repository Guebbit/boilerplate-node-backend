---
source: src/modules/orders/tests/factories.ts
sha256: 8a9e06cf01dac203c2933c34f3a6c42d9c4b4d50e98e9f9822c9258e704479eb
generated_at: 2026-11-08T07:03:20.597142+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/factories.ts

## Purpose

Database-touching order test factories. While the pure builder in `../factories.ts` works on in-memory data, this module wraps that builder with real repository/model calls so tests can persist, read back, and force-mutate order documents in the test database. It also converts persisted product documents into the full-snapshot order lines that the order model embeds, and provides narrow helpers for setting internal-only fields (PII clock, deadlines, `paidAt`) that no public service exposes.

## Key elements

- **`toOrderItem(product, quantity?, locale?)`** — Converts a `ProductDocument` into an `OrderLineInput` by snapshotting the full document (minus `_id`, `__v`, `taxClass`), resolving `taxClass` → `taxRate` via `resolveTaxRate`, and flagging `preorder: true` when `isPreorder` is satisfied.
- **`makeOrder(user, items, extras?)`** — Thin wrapper over `buildOrder` from `../factories.ts`; binds `userId`/`email` from a `UserDocument` and passes `extras` through without defaulting.
- **`createOrder(user, items, extras?)`** — Calls `orderRepository.create(makeOrder(...))`; returns the Mongoose document.
- **`seedOrder(status)`** — Creates a fresh user + product, a single-line order, forced to `status`.
- **`seedDigitalOrder(status, paidAt?)`** — Same as `seedOrder` but with `requiresShipping: false`; optionally stamps `paidAt` post-insert.
- **`orderRepository`** (re-export) — Exposed for `jest.spyOn` in sibling tests; use only for call-interception, not state assertions.
- **`readOrder` / `findOrder` / `countOrders`** — Raw repository reads for direct database-state assertions.
- **`forceOrderStatus(orderId, status)`** — Bypasses all lifecycle guards to set any `OrderStatus`; test-only escape hatch.
- **`detachOrderUserId(userId, piiClockStartedAt)`** — Unsets `userId`, sets `piiClockStartedAt` on all matching orders; starts the PII erasure clock at an explicit instant.
- **`markOrderPaidAt(orderId, paidAt)`** — Stamps the internal-only `paidAt` field directly, bypassing `orderRepository.markPaid`.
- **`setConformityUntil` / `setWithdrawUntil`** — Set or clear (`undefined`) the frozen deadline fields.
- **`timelineOf(orderId, typePrefix?)`** — Reads the order timeline as admin via `readTimeline`, validates rows through `GetOrderTimeline200Response` (Zod), and optionally filters by type prefix.
- **`lastOverrideOf(orderId)`** — Returns the last `status_overridden` entry from the timeline.

## Relationships

- **`../factories.ts`** (pure builder) — `makeOrder` delegates to `buildOrder`; imports `OrderFixture`, `OrderLineInput`, `OrderOverrides` types. This file is the DB-aware counterpart.
- **`../repository`** — `orderRepository` is re-exported for spying; `createOrder`, `readOrder`, `findOrder`, `countOrders`, `forceOrderStatus` all call its methods.
- **`../model`** — `orderModel` is used for direct Mongoose updates that no repository method covers (`paidAt`, deadlines, `userId` unset).
- **`src/infrastructure/persistence/create-repository.ts`** — Provides `toObjectId`, used by `detachOrderUserId`, `setConformityUntil`, and `setWithdrawUntil` to convert string IDs for Mongoose queries.
- **`../services/timeline`** — `readTimeline` is called by `timelineOf` to fetch entries in the same shape the API returns.
- **`@modules/products/tests/factories`** — `createProduct` supplies the product document consumed by `toOrderItem` in `seedOrder`/`seedDigitalOrder`.
- **`@modules/users/tests/factories`** — `createUser` supplies the user document for the same seed helpers.
- **Consumer tests** (cart, delivery, address integration/contract suites) — Import these factories to build persisted fixtures and assert on database state, timeline contents, or deadline fields.

## Notes

- **Two assertion strategies coexist.** Use `readOrder`/`findOrder`/`countOrders` when you need to verify *what the database holds*; use `jest.spyOn(orderRepository, …)` (via the re-export) only when the assertion is *was this method called / did it throw*. A wrapper function around a method cannot intercept internal calls made by `orderService`'s own rollback logic, so the re-exported reference is the only spy target that works.
- **`forceOrderStatus` is deliberately outside the service layer.** Production code has no unconditional status writer; this exists solely to let a test reach a state the API could never produce (e.g., a payment retry against a non-`pending` order) and assert the *other* caller handles it.
- **`toOrderItem` freezes the resolved rate, not the class.** This mirrors `freezeOrderLines`: an order line stores `taxRate`, never `taxClass`, so a later product reprice or tax-table change cannot rewrite what was charged.
- **`markOrderPaidAt`, `detachOrderUserId`, `setConformityUntil`, `setWithdrawUntil` all write internal-only fields** that are omitted from the API response (`model.ts` `omit`) and thus unreachable through `OrderOverrides` or the public service. They exist so retention/withdrawal tests don't need to drive a full checkout+payment flow.
- **`timelineOf` doubles as a contract check.** Every row is parsed through `GetOrderTimeline200Response`, so a test that merely *reads* a timeline also verifies the stored shape satisfies the public Zod schema.
