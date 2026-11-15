---
source: src/modules/stock-alerts/repository.ts
sha256: f417a5f12ea5ffd256502e2432a1c9eddc3f1c259ccf425668c234f6008bced6
generated_at: 2026-11-14T22:04:16.200958+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/repository.ts

## Purpose

Data-access layer for stock alerts. Encapsulates every MongoDB read/write the stock-alert domain needs—creating an idempotent request, cancelling, listing, and the cleanup writes owed when an account or product is deleted—so the service layer never touches Mongoose directly.

## Key elements

- **`STOCK_ALERT_LIMIT_REACHED`** — sentinel string returned by `ask` when the user's cap is hit (and the target product is *not* the one already held).
- **`Asked`** — union type: the sentinel above, or `{ alert, added }` on success.
- **`upsertRequest`** *(internal)* — `findOneAndUpdate` with `$setOnInsert` on the unique `(userId, productId)` pair; uses `includeResultMetadata` to distinguish a fresh insert from a no-op match.
- **`stockAlertRepository`** — the exported object. Spreads the generic CRUD from `createRepository` and adds:
  - `ask(userId, productId)` — counts the user's alerts on *other* products; if under `stockAlertsMax()`, performs the upsert; otherwise returns the limit sentinel.
  - `cancel(userId, productId)` — deletes the single request; resolves `false` if none existed.
  - `findByUserId(userId)` — all alerts for a user, sorted newest-first.
  - `findByProductId(productId, session?)` — every user waiting on one product; accepts a Mongoose session for transactional callers.
  - `distinctProductIds()` — de-duplicated list of product ids that have at least one alert.
  - `deleteById(id, session)` — single-row delete inside a caller-supplied transaction.
  - `deleteByUserId(userId, session?)` — bulk delete for account erasure.
  - `deleteByProductId(productId)` — bulk delete for product removal.

## Relationships

- **`src/modules/stock-alerts/model.ts`** — supplies `stockAlertModel` (the Mongoose model), `applyStockAlertTransform` (passed to the CRUD factory), and the `StockAlertDocument` type used throughout.
- **`src/modules/stock-alerts/config.ts`** — supplies `stockAlertsMax()`, the per-user alert cap consulted by `ask`.
- **`src/infrastructure/persistence/create-repository.ts`** — provides the `createRepository` factory (spread into this object for standard CRUD), the `toObjectId` converter, and the `Repository` / `Wire` generic types that shape this module's public interface.
- **`src/modules/stock-alerts/service.ts`** — the primary consumer; calls `ask`, `cancel`, the `findBy*` queries, and the `deleteBy*` cleanups as part of higher-level use cases.

## Notes

- The cap check in `ask` excludes the target product from the count, so re-asking for the *same* product at the cap is still a success (idempotent re-arrival).
- Two concurrent `ask` calls for *different* products can overshoot `stockAlertsMax` by one. This is an accepted trade-off—documented as not worth a transaction or a counter document.
- `deleteByUserId` and `deleteByProductId` include an explicit `.then(() => {})` to satisfy their `Promise<void>` signature; the empty arrow is intentional, not a mistake.
- `findByProductId` and `deleteById` accept a `ClientSession` because they participate in multi-document transactions driven by the service layer.
