# db/migrations/20260813091000-product-stock-column.js

## Purpose

Backfills the `products.stock` field (used by checkout decrement and cancel-restore logic) with the demo default of `100` for all existing rows. It exists so that the column, introduced in the schema and `openapi.yaml` for new products, also has a value on rows created before the column was added.

## Key elements

- **`up(db)`** — Runs `updateMany` on the `products` collection, setting `stock: 100` only where `stock` does not yet exist (`$exists: false`). This makes re-runs safe: an admin-set or sale-adjusted count is never overwritten.
- **`down(db)`** — Runs `updateMany` with `$unset: { stock: '' }` across all rows, removing the field entirely. The distinction between "backfilled" and "counted since" is not recoverable, so a clean removal is the only honest undo.

## Relationships

No graph neighbors.

## Notes

- Idempotency is enforced by the `$exists: false` query filter, **not** by `migrate-mongo status`. Re-running this migration is safe; a blanket `updateMany({})` would be a bug.
- `down` intentionally discards data rather than restoring the (non-existent) pre-migration state. Treat this as a one-way street in production.
- The value `100` is a demo placeholder, not a business rule. Real deployments are expected to set actual stock counts via the admin product form after this migration runs.
