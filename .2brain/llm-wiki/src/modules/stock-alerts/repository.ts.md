---
source: src/modules/stock-alerts/repository.ts
sha256: 71d3620d71e3376e55aabafcb0596a51cd35313f37486ea78ef0683b6ac3efad
generated_at: 2026-10-29T05:59:09.915981+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/repository.ts

## Purpose

Data-access layer for stock alerts. Encapsulates all MongoDB reads and writes the stock-alert feature needs: idempotent alert creation, cancellation, per-user and per-product lookups, and the bulk cleanups owed when an account or a product is erased. It extends the generic CRUD factory with domain-specific operations.

## Key elements

- **`stockAlertRepository`** (default export) — the repository object; spreads the base CRUD from `createRepository` and adds:
  - **`ask(userId, productId)`** — idempotent upsert via `findOneAndUpdate` + `$setOnInsert`; returns `{ alert, added }` where `added` is `false` if the pair already existed (double-click safe).
  - **`cancel(userId, productId)`** — deletes the user's alert for a product; returns `false` if none existed.
  - **`findByUserId(userId)`** — user's alerts, sorted `createdAt` desc then `_id` desc.
  - **`findByProductId(productId, session?)`** — all alerts waiting on a product; accepts an optional Mongoose `ClientSession`.
  - **`distinctProductIds()`** — unique product IDs that have ≥ 1 alert, returned as `string[]`.
  - **`deleteById(id, session)`** — deletes one alert by `_id` inside the caller's transaction; returns `false` if another run already removed it.
  - **`deleteByUserId(userId, session?)`** — bulk delete all alerts for a user (account-erasure cleanup).
  - **`deleteByProductId(productId)`** — bulk delete all alerts for a product (product-deletion cleanup).

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides `createRepository` (spreads base CRUD), `toObjectId` (string → ObjectId helper used in every query), and the `Repository` / `Wire` type contracts that shape the exported object.
- **`src/modules/stock-alerts/model.ts`** — supplies `stockAlertModel` (the Mongoose model every method queries) and `applyStockAlertTransform` (passed to the factory as the document→wire mapper). Also the source of the `StockAlertDocument` type used throughout.
- **`src/modules/stock-alerts/service.ts`** — the service layer that invokes the repository's methods to fulfil use-cases (creating, cancelling, listing, and cleaning up alerts).

## Notes

- `ask` relies on `includeResultMetadata` (not the deprecated `rawResult`) to detect whether the upsert inserted a new document or matched an existing one.
- `deleteById` and `deleteByUserId` require/accept a `ClientSession` so they can participate in a caller-managed transaction (e.g., during account erasure). `deleteByProductId` does not.
- `toObjectId` is called on every string ID before it enters a query filter; the Mongoose model stores them as real `ObjectId`s.
- `deleteByUserId` and `deleteByProductId` explicitly return `Promise<void>` (the `.then(() => {})` wrapper is there to silence a non-void inference from `exec()`).
- Module doc points to `docs/modules/stock-alerts.md` for broader feature context.
