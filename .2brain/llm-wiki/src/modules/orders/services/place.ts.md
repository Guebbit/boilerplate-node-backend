---
source: src/modules/orders/services/place.ts
sha256: 2a6874fd1ca0117e7ef224eb4aa3ebe207e31c09d926f53f4c4a3fd1fa30ba9d
generated_at: 2026-11-08T06:59:05.641459+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/place.ts

## Purpose

The single write path for creating a new order. Both `crud.ts`'s admin `create` and the cart module's `checkout` funnel through this one function so that the actual write (freeze → hold → allocate number → persist) exists in exactly one place. Callers own everything upstream (payment-method validation, cart pre-flight, address resolution); this file owns only the order row and its stock hold.

## Key elements

- **`placeOrder(input: PlaceOrderInput): Promise<PlaceOrderOutcome>`** — The sole exported function. Validates lines via `checkOrderLines`, freezes them into `OrderDocumentItem[]`, reserves stock via `inventoryService.reserveForOrder` *before* writing (so a refused hold burns no row and no number), allocates an order number, then writes the row and its `order.created` outbox event inside a single Mongoose transaction. Returns a plain verdict union, never throws for a refusal.
- **`PlaceOrderOutcome`** — Discriminated union: `{ ok: true; order }` or `{ ok: false; reason: 'no-lines' | 'product-missing' | 'insufficient-stock' | 'superseded' }`. Callers map this to their own wire shapes.
- **`PlaceOrderInput`** — Everything the write needs: identity, lines, optional shipping/billing/notes, and an optional `commitWith(session)` callback (used by checkout to clear the cart atomically; a `false` return aborts the whole transaction).
- **`PlaceOrderLine`** — A request line plus its resolved `ProductSnapshot | null | undefined` and optional `backorder` flag.
- **`PlaceOrderShipping`** — Pre-resolved address, a `priceFor(frozenLines)` pricing function (priced off the *frozen* basket, not a precomputed number), and optional `holdMinutes`.
- **`OrderSuperseded`** — Internal `Error` subclass thrown inside the transaction when `commitWith` reports a lost race; triggers full rollback.
- **`withOwedLines`** (module-private) — Annotates frozen items with backorder `owed`/`promisedBy` data using `owedLineOf` from the domain layer.

## Relationships

- **`src/modules/cart/services/checkout.ts`** and **`src/modules/orders/services/crud.ts`** — Upstream callers. They validate their own preconditions, then delegate to `placeOrder` and map its verdict to their response shapes.
- **`src/modules/inventory/index.ts`** → **`services/index.ts`** / **`services/types.ts`** — Provides `inventoryService.reserveForOrder` (the stock hold) and the `StockShortfall` type returned on failure.
- **`src/modules/orders/domain/rules.ts`** — `checkOrderLines` gates the write before any side-effects.
- **`src/modules/orders/domain/backorder.ts`** — `owedLineOf` computes the per-line backorder promise fields.
- **`src/modules/orders/model.ts`** — `OrderDocument` / `OrderDocumentItem` shapes that the frozen items and final row conform to.
- **`src/modules/orders/repository.ts`** — `orderRepository.create(orderData, session)` is the actual persistence call inside the transaction.
- **`src/modules/orders/services/announce.ts`** — `createdEvent` is the outbox payload announced in-transaction via `announceInTransaction`.
- **`src/kernel/outbox.ts`** — `announceInTransaction` ensures the `order.created` event commits atomically with the order row.
- **`src/infrastructure/persistence/create-repository.ts`** — `toObjectId` coerces the string `userId` to an Mongoose `ObjectId` for the write.
- **`src/infrastructure/adapters/logger.ts`** — `logger` used for error/audit logging inside the transaction path.
- **`src/modules/orders/services/index.ts`** — Re-exports `placeOrder` (and its types) for consumers outside the orders module.

## Notes

- **Hold-before-write is deliberate.** The `ObjectId` is generated *before* `reserveForOrder` so the reservation and the eventual row share the same id. A refused hold therefore never creates a row or spends an order number. The only leak window is a hold that is taken but the subsequent write throws; the `try/catch` releases the hold in that case.
- **`commitWith` is the checkout-specific atomicity hook.** If it resolves `false` (e.g., a conditional cart-clear matched nothing due to a race), `OrderSuperseded` is thrown, the transaction aborts, and the verdict is `superseded` — no order, no outbox row.
- **Shipping is priced off the frozen lines**, not a caller-supplied total. `priceFor` receives the `OrderDocumentItem[]` *after* `freezeOrderLines`, so the free-above-threshold rule prices the exact basket being written.
- **`paymentMethod` is stored as-is**; `undefined` behaves like `'card'` (no reference minted, no hold-length override). Payment-method *validation* is the caller's responsibility.
- **The file is a module with a single export** (`placeOrder` + its type definitions). It does not export the helper `withOwedLines` or the `OrderSuperseded` class.
- **`logger` is imported but the truncated content does not show a visible call site** — it is likely used in the `catch` block for the rollback path.
