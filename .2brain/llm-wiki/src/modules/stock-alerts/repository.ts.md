---
source: src/modules/stock-alerts/repository.ts
source_sha256: 7bd59021cc3fe58bfee1b1f6edd1e75d61ad646a3705fac8ebc3d3f713a7c34c
context_sha256: db8b57ec8cf467c675281eb2ae760568ee2867c781bd91413a28864162ec9640
generated_at: 2026-11-22T07:55:15.098121+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/repository.ts

## Purpose
Mongo-backed repository for stock alerts ("notify me when this product is back"). It extends the generic CRUD repository with the writes and queries a request needs: idempotent ask, cancel, listing a user's own alerts, finding who waits for a product, and the two cleanups owed to an erased account or a deleted product.

## Key elements
- `STOCK_ALERT_LIMIT_REACHED` — string constant `'stock-alert-limit-reached'`, returned by `ask` when the account is at the cap.
- `upsertRequest` (internal) — `findOneAndUpdate` with `upsert` and `$setOnInsert` on the `(userId, productId)` pair. Uses `includeResultMetadata` and `lastErrorObject.updatedExisting === false` to report `added`.
- `stockAlertRepository` — the exported object: the `createRepository` CRUD surface (with `applyStockAlertTransform`) plus:
  - `ask(userId, productId)` — counts the user's alerts for *other* products; if that count is `>= stockAlertsMax()` it resolves to `STOCK_ALERT_LIMIT_REACHED`, otherwise to `{ alert, added }`.
  - `cancel(userId, productId)` — deletes the pair; `true` if something was deleted.
  - `findByUserId(userId)` — a user's alerts, newest first (`createdAt`, then `_id`, descending).
  - `findByProductId(productId, session?)` — everyone waiting for a product; optional transaction session.
  - `distinctProductIds()` — each product with at least one alert, as strings.
  - `deleteById(id, session)` — deletes one alert in the caller's transaction; `false` if already gone.
  - `deleteByUserId(userId, session?)` — removes all of an account's alerts (hard account deletion).
  - `deleteByProductId(productId)` — removes all alerts for a deleted product.

## Relationships
- `@infrastructure/persistence/create-repository` supplies `createRepository`, `toObjectId`, and the `Repository`/`Wire` types; the file builds on it and uses `toObjectId` to convert every id.
- `./model` provides `stockAlertModel`, `applyStockAlertTransform`, and the `StockAlertDocument` type.
- `./config` provides `stockAlertsMax()`, the per-account cap read on each `ask`.
- `./service` is the neighbor in the module graph that consumes this repository (the file itself does not import it).

## Notes
- Idempotency relies on the unique `(userId, productId)` pair; asking twice yields one row and the second call returns `added: false`.
- Asking again for a product the user already waits on succeeds even at the cap, because only *other* products are counted.
- The cap is not strictly enforced under concurrency: two simultaneous asks for different products may overshoot by one. The code comments call this accepted.
- `deleteById` requires a session, while `deleteByUserId` and `findByProductId` take an optional one.
