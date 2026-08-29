# src/modules/inventory/repository.ts

## Purpose

Defines the persistence surface for the inventory module: an append-only stock-movement ledger and a reservation (hold) store. It sits between the Mongoose models (`./model`) and the domain rules (`./service`), exposing only the operations the service actually needs.

## Key elements

- **`stockMovementRepository: BaseRepository<StockMovementDocument>`** — Append-only ledger. Exposes only `create` and `search` (inherited from the base factory). No update or delete by design. Searchable by `productId` (ObjectId) and `reason` (exact match).
- **`reservationRepository`** — Extends the base repository with four domain-specific methods:
  - `insertHold(orderId, items, expiresAt)` — Creates a hold; returns `null` on duplicate `orderId` (Mongo code 11000) instead of throwing.
  - `findByOrderId(orderId)` — Reads a hold in any status.
  - `claimStatus(orderId, from, to)` — Atomic status transition via `findOneAndUpdate` filtered on the *from* status; the module's exactly-once primitive. Returns the updated doc or `null` if lost the race.
  - `findExpired(now, limit)` — Returns held reservations past their deadline, oldest first, capped at `limit`.
- **`toReservationItems(lines)`** — Private helper that maps string `productId` values to `Types.ObjectId` for storage.

## Relationships

- **`src/infrastructure/persistence/base-repository.ts`** — Provides `createBaseRepository`, the `BaseRepository` type, and the `toObjectId` utility. Both repositories in this file are built on it.
- **`src/modules/inventory/model.ts`** — Supplies the Mongoose models (`stockMovementModel`, `reservationModel`), their document types, `ReservationStatus`, and the transform functions passed into the base factory.
- **`src/modules/inventory/service.ts`** — Consumes both repositories; owns the business rules (counter coordination with `@modules/products`).
- **`src/modules/inventory/tests/integration/ledger.property.test.ts`** — Property-based integration tests exercising the stock-movement ledger through this repository.
- **`src/modules/inventory/tests/integration/service.test.ts`** — Integration tests for the service, which drive the reservation repository's methods.

## Notes

- Types are written out explicitly (not inferred) because Mongoose generics trigger TS7056 at export boundaries — the same reason `BaseRepository` exists.
- `stockMovementRepository.search` is inherited verbatim (paged, reports `totalItems`). A "latest N" shortcut was deliberately rejected so an audit read never misreports history as complete.
- `claimStatus` is the concurrency primitive: exactly one of N concurrent callers matches the `from` filter. Callers that get `null` must no-op, not retry.
- `findExpired` is intentionally capped; the sweep that calls it is idempotent and reports when it hit the cap, so truncation is safe (unlike in the ledger read).
- `insertHold` treats a duplicate-key error as a benign retry signal, not a fault; any other error is rethrown.
