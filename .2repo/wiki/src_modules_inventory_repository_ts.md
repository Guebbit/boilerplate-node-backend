# src/modules/inventory/repository.ts

## Purpose

Defines the data-access layer for the inventory module: an append-only stock-movement ledger and a reservation (hold) collection with lifecycle operations. Each repository is built on the shared `createRepository` factory and the module's Mongoose models, adding only the domain-specific queries the service layer needs.

## Key elements

- **`toReservationItems`** — Maps string `productId` values to `Types.ObjectId` before persisting reservation line items.
- **`stockMovementRepository`** — Append-only `Repository<StockMovementDocument>` (create + search surface only; no update or delete). Searchable by `productId` (ObjectId) and `reason` (exact match).
- **`reservationRepository`** — General `Repository<ReservationDocument>` plus four lifecycle primitives:
  - `insertHold` — Creates a held reservation; returns `null` on duplicate `orderId` (Mongo 11000) instead of throwing.
  - `findByOrderId` — Fetches a reservation regardless of status.
  - `claimStatus` — Atomic status transition via `findOneAndUpdate` guarded on the current `from` status; returns the post-update doc or `null` if lost the race.
  - `findExpired` — Returns held reservations past their deadline, sorted by `expiresAt`, capped by `limit`.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — Provides the `createRepository` factory, the `Repository` type, and the `toObjectId` helper used throughout.
- **`src/modules/inventory/model.ts`** — Supplies `stockMovementModel`, `reservationModel`, their transform functions, and the document/status types this file consumes.
- **`src/modules/inventory/service.ts`** — The sole consumer of both repositories; drives the reservation lifecycle and records stock movements through them.
- **`src/modules/inventory/tests/integration/ledger.property.test.ts`** — Property-based tests exercising the stock-movement repository's create/search surface.
- **`src/modules/inventory/tests/integration/service.test.ts`** — Integration tests that exercise reservation lifecycle operations via the service.

## Notes

- Types are spelled out explicitly at the export boundary because Mongoose generics exceed TypeScript's inference serialization limit (TS7056).
- The `reason` field is matched with `exact` semantics — partial matching would let a query for `"re"` return `reserve`, `release`, and `receive` simultaneously.
- `claimStatus` is the module's exactly-once concurrency primitive: the `status: from` guard ensures only one of N concurrent callers (cancel, sweep, duplicate webhook) can succeed.
- `findExpired` is intentionally truncated by `limit`; the caller's sweep loop is idempotent and reports when it hits the cap, so no work is lost.
- `insertHold` treats a duplicate `orderId` as a soft signal (`null`) rather than an error, so racing checkouts degrade gracefully.
