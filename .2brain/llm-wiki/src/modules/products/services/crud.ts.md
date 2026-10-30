---
source: src/modules/products/services/crud.ts
sha256: 9766eb227d3fdd68823b0531cfb4f3a8ea17711bd376790c268a57a305f7d67b
generated_at: 2026-10-29T05:28:42.946298+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/crud.ts

## Purpose

The transactional write core for product creation and updates. It defines exactly what the product document holds after each write and what domain events accompany it. A higher-level module (`./translated-write`) composes these primitives into the public create/update doors; this file is the inner, transaction-bound layer.

## Key elements

- **`insertProduct`** (exported) – Creates a product row inside the caller's Mongoose transaction. Always writes `onHand: 0`, sanitises `categories`/`tags`, converts `releaseDate`/`restockDate` ISO strings to `Date`, then enqueues `PRODUCT_CREATED` via the outbox within the same transaction.
- **`finishCreate`** (exported) – Post-commit pipeline for a create: nudges the outbox relay, re-reads the document, records an audit entry, and enqueues any pending image. Each step isolates its own failure.
- **`ProductCreateData`** / **`ProductUpdateData`** – Input types. The update type widens `imageUrl`, `weight`, `taxClass`, `rateType`, `sku`, `releaseDate`, `restockDate`, and `description` to accept `null` (meaning "clear"), and adds a `touch` flag for edits that also wrote translation rows.
- **`ProductUpdateOutcome`** (exported interface) – Bundles the saved document, the replaced image URL, the audited field diff, and the list of changed free-text/image field names for the caller to handle post-commit.
- **`applyDate`** – Mutates `releaseDate` or `restockDate` in place; returns a `{ from, to }` `DateChange` or `undefined` when the instant is unchanged.
- **`announceDateChange`** – Enqueues `PRODUCT_RELEASE_DATE_CHANGED` or `PRODUCT_RESTOCK_DATE_CHANGED` through the outbox inside the edit's transaction.
- **`auditedChangesOf`** – Computes which audited fields an update would move, sanitising lists before diffing so the audit reflects what will be stored.
- **`PRODUCT_AUDITED_FIELDS`** – Declares which scalars/lists are diffed as `{ from, to }` and which free-text fields are audited by name only.
- **`sanitizeStringArray`** – Trims, drops blanks, and de-duplicates a string array; non-array input yields `[]`.
- **`differs`** – Null-aware inequality check (`undefined` ≡ `null`) used throughout the diff logic.
- **`enqueuePendingImage`** – Post-commit hand-off of a pending image to the worker queue via `afterCommit`.

## Relationships

- **`@kernel/outbox`** – Enqueues `PRODUCT_CREATED`, date-change events, and `nudgeOutbox` after commit; all events are in-transaction so they exist exactly when the row does.
- **`@infrastructure/runtime/after-commit`** – Every post-commit side-effect (re-read, audit, image enqueue) is wrapped in `afterCommit` to guarantee the preceding transaction is durable.
- **`@infrastructure/observability/audit-changes`** – Provides `auditChanges`, `fieldChange`, and the `AuditedFields` / `AuditChanges` types used to compute the `{ from, to }` diff.
- **`@infrastructure/observability/audit`** – `recordAudit` writes the audit-log entry in `finishCreate`.
- **`@infrastructure/persistence/changes`** – `clearedOrValue` normalises a value-or-null for storage in `applyDate`.
- **`@infrastructure/persistence/versioning`** – `rearmPrecondition` (imported for the update path, which is truncated in this view).
- **`@infrastructure/adapters/image.worker`** – `enqueueIfImagePending` dispatches a pending image to the worker queue after commit.
- **`@infrastructure/adapters/image-store`** – `imageStore` and `applyImageWriteback` for image persistence (used in the update path).
- **`@infrastructure/http/response`** – `generateSuccess` / `generateReject` helpers (used by the composing update path).
- **`@infrastructure/i18n`** – `t` for localised messages in rejection responses.
- **`../events`** – Event-name constants (`PRODUCT_CREATED`, `PRODUCT_RELEASE_DATE_CHANGED`, `PRODUCT_RESTOCK_DATE_CHANGED`, `PRODUCT_BUYABLE_AGAIN`) that this module enqueues.
- **`../audit`** – `productsAuditActions` supplies the action identifiers for audit-log entries.
- **`../domain/buyable`** – `isBuyable` (imported for the update path's buyability recomputation).
- **`../model`** – `ProductDocument` type for the Mongoose document shape.

## Notes

- **`onHand` is never mutated here.** `insertProduct` hard-codes `onHand: 0`. The inventory module (a subscriber to `PRODUCT_CREATED`) is the sole writer of that counter, avoiding a circular import.
- **`currency` is not stored.** It is read live at serialization time (`applyProductAvailability` in `./model`); the create/update types deliberately omit it.
- **`touch` flag.** When an edit also writes translation rows (outside this document), the caller sets `touch: true` so `updatedAt` — and therefore the row's `ETag`/version — advances even though no scalar on this document changed.
- **Audit compares sanitised lists.** `auditedChangesOf` runs `sanitizeStringArray` before diffing, so the audit trail reflects the stored value, not the raw input.
- **Null ≠ undefined in updates.** In `ProductUpdateData`, `null` means "clear this field"; `undefined` means "leave it alone." The `differs` helper and `applyDate` both rely on this distinction.
- **File is truncated in the dependency snapshot.** The `applyUpdate` function and the tail of `announceDateChange` are cut off; the exported surface shown above is what is visible.
