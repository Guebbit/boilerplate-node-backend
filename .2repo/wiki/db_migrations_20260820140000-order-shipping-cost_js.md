# db/migrations/20260820140000-order-shipping-cost.js

## Purpose

One-time backfill that sets `shippingCost` to `0` on legacy `orders` documents written before the `delivery` module existed. After this runs, every order has the field, so `orderTotal`'s tolerance for a missing `shippingCost` is a guard against malformed data rather than a contract with the database.

## Key elements

- **`up(db)`** — `updateMany` on the `orders` collection; matches documents where `shippingCost` does not exist (`$exists: false`) and sets it to `0`.
- **`down(db)`** — `updateMany` on the `orders` collection; matches documents where `shippingCost` is `0` **and** `shippingMethod` does not exist, then unsets `shippingCost`. This protects rows that carry a real, non-zero charge from being destroyed by a rollback.

## Relationships

No dependency-graph neighbors are recorded for this file.

## Notes

- The `$exists: false` filter in `up` makes the migration idempotent in effect (a second run matches nothing), but `migrate-mongo status` only records that it *ran*, not that it is safe to re-run. Do not rely on the tooling for idempotency.
- `shippingMethod` and `shippingAddress` are intentionally **not** populated. Those orders had no delivery choice, and inventing one would be fabricating history.
- The `down` migration is deliberately conservative: it will only remove the field from rows that could not possibly represent a real charge (zero cost + no method). A row with a positive `shippingCost` or a recorded `shippingMethod` is left untouched regardless of direction.
- The comment block references `orderTotal`'s read-path behaviour and the `delivery` module; those are the two call-sites whose assumptions this migration closes.
