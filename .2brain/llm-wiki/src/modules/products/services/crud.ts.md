---
source: src/modules/products/services/crud.ts
sha256: 7f43c79bf2792197a8aa7db5862656e33072e7af2fe22fbdfd07d6315566c092
generated_at: 2026-11-14T21:27:27.717578+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/crud.ts

## Purpose

Transactional write steps for product create and update: what the document holds, how dates are normalised, what gets audited, and which outbox events each write announces. Composed by `./translated-write` into the public create/update doors.

## Key elements

- **`insertProduct(data, session)`** (exported) – Inserts a `ProductDocument` via `productRepository.create` inside the caller's Mongoose transaction. Normalises `releaseDate`/`restockDate` to shop-midnight instants, sanitises `categories`/`tags`, writes `onHand: 0`, then enqueues `PRODUCT_CREATED` on the outbox.
- **`finishCreate(product, context)`** (exported) – Post-commit chain: nudges the outbox relay, re-reads the document, records an audit entry, and hands a pending image to the worker queue. Each step isolates its own failure.
- **`applyUpdate`** (exported, implementation truncated) – Applies a change-set to an already-fetched product and saves it inside the caller's transaction. Returns a `ProductUpdateOutcome`.
- **`ProductUpdateOutcome`** (exported interface) – `updated`, `oldImageUrl`, `changes` (scalar/list diffs), `changedFields` (free-text + image names).
- **`ProductCreateData` / `ProductUpdateData`** – Input types. Update widens `imageUrl`, `weight`, `taxClass`, `rateType`, `sku`, `releaseDate`, `restockDate`, `description` to accept `null` for explicit clearing.
- **`AUDITED_SCALARS` / `AUDITED_LISTS` / `AUDITED_BY_NAME`** – Partition the fields into valued diffs, order-compared lists, and name-only free text.
- **`auditedChangesOf(product, data)`** – Runs `auditChanges` over `PRODUCT_AUDITED_FIELDS` against the pre-change document.
- **`applyDate(product, field, requested)`** – Mutates `releaseDate` or `restockDate` in place, returns a `DateChange` (`{from?, to?}`) only when the stored instant actually moved.
- **`announceDateChange(name, change, productId, session)`** – Enqueues `PRODUCT_RELEASE_DATE_CHANGED` or `PRODUCT_RESTOCK_DATE_CHANGED` when a date moved.
- **`sanitizeStringArray`** – Trims, drops blanks, de-duplicates; `null`/non-array → `[]`.
- **`enqueuePendingImage(product)`** – Post-commit wrapper that calls `enqueueIfImagePending` with the product's writeback callback.

## Relationships

- **`src/kernel/outbox.ts`** – Every write enqueues domain events (`PRODUCT_CREATED`, `PRODUCT_RELEASE_DATE_CHANGED`, `PRODUCT_RESTOCK_DATE_CHANGED`, `PRODUCT_BUYABLE_AGAIN`) through `enqueueOutboxEvent`; `finishCreate` calls `nudgeOutbox` to wake the relay.
- **`src/infrastructure/runtime/after-commit.ts`** – All post-transaction side-effects (re-read, audit, image enqueue) are sequenced through `afterCommit` so they run only after the session is durable.
- **`src/infrastructure/observability/audit-changes.ts`** – Provides `auditChanges`, `differs`, `fieldChange`, and the `AuditedFields` shape used to compute `{from, to}` diffs for the audit trail.
- **`src/infrastructure/observability/audit.ts`** – `recordAudit` writes the final audit log entry in `finishCreate`.
- **`src/infrastructure/persistence/versioning.ts`** – `rearmPrecondition` is imported to move the document's ETag/version when an edit also touched translation rows (the `touch` flag on `ProductUpdateData`).
- **`src/infrastructure/persistence/changes.ts`** – `clearedOrValue` converts a possibly-`undefined` date into a Mongoose `null` or `Date`.
- **`src/infrastructure/adapters/image-store.ts`** – `imageStore` / `applyImageWriteback` are the writeback callback passed to the image worker.
- **`src/infrastructure/adapters/image.worker.ts`** – `enqueueIfImagePending` queues the pending-image job after commit.
- **`src/modules/products/events.ts`** – Source of the four product event names enqueued on the outbox.
- **`src/modules/products/audit.ts`** – `productsAuditActions` supplies the audit-action constant (`ADMIN_PRODUCT_CREATED`).
- **`src/modules/products/domain/buyable.ts`** – `isBuyable` is imported (used downstream in the truncated portion).
- **`src/modules/products/model.ts`** – `ProductDocument` is the Mongoose document type throughout.
- **`src/infrastructure/i18n/index.ts`** – `t` is available for translated error/success messages (paired with `src/infrastructure/http/response.ts` helpers).

## Notes

- **`onHand` is always 0 on write.** This module never increments it; the `inventory` module subscribes to `PRODUCT_CREATED` and opens the stock level at zero. The reverse import is deliberately avoided to keep the dependency acyclic.
- **`currency` is never persisted.** It is read live at serialization time (`applyProductAvailability` in `./model`).
- **Dates cross the boundary as `YYYY-MM-DD` strings** and are stored as shop-midnight `Date` instants via `startOfShopDay`. `applyUpdate`'s `releaseDate`/`restockDate` accept `null` to clear.
- **Free-text fields (`title`, `description`) are audited by name only** so the audit trail never copies catalogue prose.
- The file is a **module** (no default export); `./translated-write` is the composition root that calls `insertProduct` → `finishCreate` or `applyUpdate` → post-commit steps.
- The `touch` flag on `ProductUpdateData` signals that the edit also wrote translation rows outside this document, triggering `rearmPrecondition` to bump the ETag.
