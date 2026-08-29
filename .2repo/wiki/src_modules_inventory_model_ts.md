# src/modules/inventory/model.ts

## Purpose

Defines the two Mongoose collections the inventory module owns — the **StockMovement ledger** and the **Reservation hold** — including their schemas, indexes, document interfaces, and serialization transforms. Stock levels themselves live on the product document; this file records *why* a count changed (ledger) and *what is temporarily claimed* (hold).

## Key elements

- **`MOVEMENT_REASONS`** – `Object.values(StockMovementReason)` array fed into the schema `enum`; single source of truth for valid reasons.
- **`StockMovementDocument`** – Interface extending the contract `StockMovement` with `Types.ObjectId` for `productId` and `Date` timestamps.
- **`stockMovementSchema`** – Schema with `productId`, `reason`, `onHandDelta`, `reservedDelta` (both default 0), optional `reference`/`note`. Two named indexes: `{productId, -createdAt}` and `{-createdAt}`.
- **`applyStockMovementTransform`** – Serialization normalizer (`_id`→`id`, drops `__v`) built via `applySerialization`.
- **`stockMovementModel`** – The registered Mongoose model (`'StockMovement'`).
- **`ReservationItem`** – `{ productId, quantity }` sub-document shape (no `_id`).
- **`ReservationStatus`** – `'held' | 'committed' | 'released'`; terminal states are terminal.
- **`ReservationDocument`** – `orderId` (unique), `items[]`, `status`, `expiresAt`. Deliberately **not** derived from a contract type because reservations are never serialized to clients.
- **`reservationSchema`** – Unique index on `orderId` enforces exactly-once reservation; status acts as a conditional-update gate (no TTL index — a sweep handles expiry to preserve the document). Named index `{status, expiresAt}` serves the sweep query.
- **`applyReservationTransform`** / **`reservationModel`** – Analogous serialization helper and registered model (`'Reservation'`).

## Relationships

- **`src/types/index.ts`** — Source of `StockMovementReason` (enum) and `StockMovement` (contract type) consumed by the document interface and reason list.
- **`src/infrastructure/persistence/serialize.ts`** — Provides `applySerialization`, the factory used to build both `applyStockMovementTransform` and `applyReservationTransform`.
- **`src/modules/inventory/repository.ts`** — The consumer of both models for all query logic; this file exports the model handles and transforms that repository imports.
- **`src/modules/inventory/service.ts`** — Business rules (commit, release, sweep) operate on the models/transforms exported here.
- **`src/modules/inventory/tests/integration/ledger.property.test.ts`** and **`service.test.ts`** — Integration tests that exercise the schemas and model behaviour defined in this file.

## Notes

- **Deltas, not signed numbers.** Each ledger row stores `onHandDelta` and `reservedDelta` separately (each possibly zero) so that summing each column per product reproduces the counter. Do not "simplify" to a single signed field.
- **Index names are explicit.** Mongo identifies indexes by name *and* key; a name mismatch causes a startup failure rather than a no-op. Preserve the existing `name` values when altering keys.
- **No TTL index on `Reservation.expiresAt`.** Expiry is handled by a sweep (`runReservationSweep`) that releases units and preserves the document for audit. Adding a Mongo TTL index would silently delete holds.
- **`reservation.items` is a denormalized copy.** It intentionally avoids a lookup into the orders module (which already depends on inventory) and records what was actually taken, not what the order says now.
- **`ReservationStatus` uses `satisfies`**, not `as const` — the enum array is derived from the union so a future state added to the type will be a compile error if not added to the array.
