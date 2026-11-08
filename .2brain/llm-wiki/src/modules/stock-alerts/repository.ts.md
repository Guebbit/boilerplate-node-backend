---
source: src/modules/stock-alerts/repository.ts
sha256: 71d3620d71e3376e55aabafcb0596a51cd35313f37486ea78ef0683b6ac3efad
generated_at: 2026-11-08T08:29:27.154331+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/repository.ts

## Purpose

Data-access layer for the stock-alerts module. It exposes the standard CRUD surface (via the shared factory) plus the domain-specific writes and reads a stock-alert request needs: idempotent "ask", cancel, per-user and per-product lookups, and the two cleanup operations owed when an account or a product is erased.

## Key elements

- **`stockAlertRepository`** (default export) — a `Repository<StockAlertDocument, Wire<StockAlertDocument>>` object that spreads `createRepository(stockAlertModel, { transform: applyStockAlertTransform })` for the base CRUD, then adds the methods below.
- **`ask(userId, productId)`** — upserts via `findOneAndUpdate` + `$setOnInsert`. Returns `{ alert, added }` where `added` is `true` only on a fresh insert. Relies on a unique index on the (userId, productId) pair for atomicity.
- **`cancel(userId, productId)`** — `deleteOne` on the same pair; returns `false` if no row existed.
- **`findByUserId(userId)`** — all alerts for one user, sorted `createdAt` desc then `_id` desc.
- **`findByProductId(productId, session?)`** — all alerts waiting on one product; accepts an optional Mongoose `ClientSession` for transactional reads.
- **`distinctProductIds()`** — `distinct('productId')`, returned as `string[]`.
- **`deleteById(id, session)`** — single-row delete bound to a caller-supplied transaction session; returns `false` on a no-op (idempotent within a retry).
- **`deleteByUserId(userId, session?)`** — bulk delete for account erasure; session optional.
- **`deleteByProductId(productId)`** — bulk delete when a product is removed; **no session parameter** (fire-and-forget).

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides the `createRepository` factory (base CRUD + transform hook), the `toObjectId` helper used in every query, and the `Repository` / `Wire` types that shape the export.
- **`src/modules/stock-alerts/model.ts`** — supplies `stockAlertModel` (the Mongoose model), `applyStockAlertTransform` (wired into the factory), and the `StockAlertDocument` type.
- **`src/modules/stock-alerts/service.ts`** — primary consumer; calls `ask`, `cancel`, `findByUserId`, `deleteByUserId`, `deleteByProductId`, etc. to orchestrate the stock-alert use-cases.

## Notes

- **Idempotency of `ask`** depends on a unique compound index on `{ userId, productId }`. The method does not create the index itself; it assumes it exists (presumably declared in `model.ts`).
- **`includeResultMetadata`** (not the deprecated `rawResult`) is used to read `lastErrorObject.updatedExisting`. This is the current Mongoose ≥ 7 API.
- **`deleteByProductId` has no session param**, unlike `deleteById` and `deleteByUserId`. Callers cannot roll it back in a transaction; treat it as a terminal, non-transactional cleanup.
- **`distinctProductIds`** casts ObjectIds to `string[]` via `.map(String)`; consumers should not expect `ObjectId` instances back.
- All ID arguments are plain `string`s; conversion to `ObjectId` is done internally via `toObjectId`. Callers never pass `ObjectId` directly.
