# db/migrations/20260817120000-inventory-counters.js

## Purpose

Splits the legacy single-counter `stock` field on `products` into the two counters the reservation model requires (`onHand` and `reserved`), backfills sensible defaults, and drops the obsolete `stockmovements` ledger whose single-`delta` schema cannot be mapped into the new `onHandDelta`/`reservedDelta` pair.

## Key elements

- **`module.exports.up(db)`** — Forward migration, four `updateMany` calls + one collection drop:
  1. `$rename: { stock: 'onHand' }` — filtered to rows where `stock` exists **and** `onHand` is absent, so it never overwrites a live `onHand`.
  2. `$unset: { stock: '' }` — removes the legacy column from any row the rename declined (both columns present; `onHand` wins).
  3. `$set: { onHand: 100 }` where missing — covers rows predating the schema default.
  4. `$set: { reserved: 0 }` where missing — every pre-reservation row genuinely had zero reserved units.
  5. `stockmovements.drop()` (swallowed catch) — the old ledger is unreplayable under the new model.

- **`module.exports.down(db)`** — Reverse: `$rename: { onHand: 'stock' }` then `$unset: { reserved: '' }`. Reserved units silently return to the sellable count because the old schema had nowhere to record them. Reservation documents are intentionally left untouched.

## Relationships

No graph neighbors are registered. The migration comments reference two external files:

- `20260813091000-product-stock-column.js` — a prior migration that backfills `stock: 100`; this migration's rename filter exists specifically to avoid clobbering an `onHand` that was set alongside that backfill.
- `src/modules/inventory/tests/unit/ledger.property.test.ts` — property-based invariant test that would fail against converted (rather than dropped) `stockmovements` rows.

## Notes

- **Idempotency via `$exists` filters, not `migrate-mongo status`.** `migrate-mongo` records that a migration ran but does not prevent a double-run; every statement is field-presence-guarded so re-execution is a no-op.
- **`$rename` over a read-write loop.** Chosen because mongod applies it atomically per document; a per-document `update` could half-apply on failure.
- **`available` is never stored.** It is derived as `onHand - reserved` at serialization time, eliminating a third column that could drift out of sync.
- **Down migration is lossy.** Reserved units merge back into `stock`; this is the best the old schema can express. The reservation documents themselves survive the rollback.
