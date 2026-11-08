---
source: src/modules/products/services/crud.ts
sha256: b6bc8d8fe9a6a5e13fd175e025d521a87b14b1f6c2e3577e50455d8ed11faed6
generated_at: 2026-11-08T07:47:08.541622+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/crud.ts

## Purpose

Transaction-level write steps for the product aggregate: it builds the document, enqueues domain events inside the caller's MongoDB session, and schedules post-commit side-effects (outbox nudge, audit, image queue). It is the "what gets written and what gets announced" half of product create/update; `./translated-write` composes these steps into the public create and update doors.

## Key elements

- **`insertProduct(data, session)`** — Creates the product row inside the caller's transaction, enqueues `PRODUCT_CREATED` via the outbox, and returns the saved `ProductDocument`. Always writes `onHand: 0`; converts `releaseDate`/`restockDate` to shop-midnight via `startOfShopDay`.
- **`finishCreate(product, context)`** — Post-commit orchestration: nudges the outbox relay, re-reads the product, records an audit entry (`ADMIN_PRODUCT_CREATED`), and enqueues a pending image. Each step isolates its own failure.
- **`ProductCreateData`** — Input shape for create; omits server-computed fields and adds optional `releaseDate`, `restockDate`, `pendingImageKey`.
- **`ProductUpdateData`** — Input shape for update; widens `imageUrl`, `weight`, `taxClass`, `rateType`, `sku`, `description`, `releaseDate`, `restockDate` to accept `null` (clear) in addition to the domain's "absent" semantics. Includes a `touch` flag to bump `updatedAt` when translation rows are also written.
- **`ProductUpdateOutcome`** — Returned by the (truncated) `applyUpdate`; carries the saved doc, `oldImageUrl` for cleanup, computed `changes` map, and `changedFields` name list.
- **`auditedChangesOf(product, data)`** — Runs the shared `auditChanges` diff over the configured field set before the write is applied.
- **`applyDate(product, field, requested)`** — Mutates `releaseDate` or `restockDate` in place, returning a `DateChange` (`{from, to}`) or `undefined` when the value is unchanged.
- **`announceDateChange(name, change, productId, session)`** — Enqueues `PRODUCT_RELEASE_DATE_CHANGED` or `PRODUCT_RESTOCK_DATE_CHANGED` through the outbox within the edit's transaction.
- **`sanitizeStringArray(values)`** — Trims, drops blanks, de-duplicates; `null`/non-array → `[]`. Used for `categories` and `tags` on both create and audit diff.
- **`enqueuePendingImage(product)`** — Post-commit hook that calls `enqueueIfImagePending` (from the image worker) with the product's writeback callback.
- **`PRODUCT_AUDITED_FIELDS`** — Declares which fields are diffed as valued (scalars + lists), which as name-only (free text: `title`, `description`), so the audit trail never copies catalogue prose.
- **`differs(before, after)`** — Equality check that treats `undefined`/`null` as identical.

## Relationships

- **`@infrastructure/persistence/changes`** — `clearedOrValue` is used by `applyDate` to write `null` (clear) vs. a `Date` value into the document.
- **`@infrastructure/persistence/versioning`** — `rearmPrecondition` is imported (presumably used in the truncated `applyUpdate` to re-arm optimistic-concurrency guards).
- **`@infrastructure/runtime/after-commit`** — `afterCommit` wraps every post-commit step (re-read, audit, image enqueue) so it runs only after the session commits.
- **`@kernel/outbox`** — `enqueueOutboxEvent` writes domain events (`PRODUCT_CREATED`, date-change events) inside the transaction; `nudgeOutbox` wakes the relay after commit.
- **`@infrastructure/observability/audit-changes`** — `auditChanges`, `fieldChange`, and the `AuditedFields` type drive the structured before/after diff.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the audit trail entry on create (and presumably update).
- **`@infrastructure/adapters/image-store`** — `imageStore` and `applyImageWriteback` provide the image persistence and the writeback callback passed to the worker.
- **`@infrastructure/adapters/image.worker`** — `enqueueIfImagePending` submits the saved product's pending image for asynchronous processing.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` (and their types) are imported for use in the (truncated) response-building portion.
- **`@infrastructure/i18n`** — `t` is available for translated messages in error/reject responses.
- **`../model`** — `ProductDocument` is the Mongoose schema type all functions read/write.
- **`../events`** — `PRODUCT_CREATED`, `PRODUCT_RELEASE_DATE_CHANGED`, `PRODUCT_RESTOCK_DATE_CHANGED`, `PRODUCT_BUYABLE_AGAIN` are the domain event names enqueued.
- **`../audit`** — `productsAuditActions` supplies the action enum values for audit entries.
- **`../domain/buyable`** — `isBuyable` is imported (used in the truncated update logic, likely to detect the buyable-state transition that triggers `PRODUCT_BUYABLE_AGAIN`).

## Notes

- **`onHand` is owned elsewhere.** This module writes `0` at create but never increments/decrements it. Stock levels are opened by the `inventory` module via the `PRODUCT_CREATED` outbox event. The dependency is one-directional (inventory imports this module, not vice-versa).
- **`currency` is not stored.** It is always resolved live at serialization time (`applyProductAvailability` in `./model`), so it is omitted from both `ProductCreateData` and the document.
- **`null` vs `undefined` on update fields.** `null` means "clear this field"; `undefined` means "leave it untouched." The domain type `Product` uses absent-as-zero/standard, so the update type explicitly widens those fields.
- **Dates are shop-local.** Input is a `YYYY-MM-DD` day string; storage is the shop's midnight of that day (`startOfShopDay`). Comparisons use `getTime()` equality, not string equality.
- **Audit never copies free text.** `title` and `description` are recorded by field name only; the `changes` map holds their values, but the audit log entry references them by name.
- **`finishCreate` is separate from `insertProduct`** because the former's steps (re-read, audit, image queue) must not run if the transaction rolls back. The caller is responsible for invoking it only after a successful commit.
