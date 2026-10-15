---
source: src/modules/products/services/crud.ts
sha256: 7eb2e4c98ed2ad18c8f9dadf2b84f15dacff3a3f8f0b8c1fc6d3375e593a7986
generated_at: 2026-10-15T11:44:08.020287+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/crud.ts

## Purpose

Implements the full write lifecycle for products — create and update (including update-by-id) — splitting each operation into a transactional core (DB save + outbox event) and a set of best-effort post-commit steps (audit, image enqueue, outbox nudge). It owns what goes into the document, what events are announced, and what happens after the commit is durable.

## Key elements

- **`ProductCreateData`** — input type for create; omits server-set fields, adds optional `releaseDate` (ISO string) and `pendingImageKey`.
- **`ProductUpdateData`** — input type for update; widens `imageUrl`, `weight`, `taxClass`, `rateType`, `sku`, `releaseDate` to accept `null` (explicit clear). Includes `touch?: boolean` to bump `updatedAt`/ETag when only external rows (translations) changed.
- **`afterCommitStep(step, run)`** — runs one post-commit action, catches and logs its own failure so subsequent steps still execute.
- **`insertProduct(data, session)`** — writes the row (always `onHand: 0`) and enqueues `PRODUCT_CREATED` via the outbox within the caller's session.
- **`finishCreate(product, context)`** — post-commit: nudges the outbox relay, re-reads the document, records an audit entry, and enqueues a pending image for processing.
- **`create(data, context)`** — top-level create: wraps `insertProduct` in `withTransaction`, then calls `finishCreate`.
- **`ProductUpdateOutcome`** — `{ updated, oldImageUrl }` returned from a transactional update so the caller can delete the old image after the commit.
- **`applyReleaseDate(product, requested)`** — mutates `releaseDate` in place; returns `{ from, to }` (ISO strings) when the value actually changed, or `undefined`.
- **`applyUpdate(product, data, session)`** — applies all incoming field changes to the fetched document (including `clearedOrValue` null-unset semantics and `applyImageWriteback` for images), saves, and enqueues `PRODUCT_RELEASE_DATE_CHANGED` if the date moved.

*(File is truncated; the exported `update`/`updateById` entry-point(s) and response-building via `generateSuccess`/`generateReject` live in the remainder.)*

## Relationships

- **`productRepository`** (`../repository`) — all `create`, `save`, `findById` calls go through this.
- **`enqueueOutboxEvent` / `nudgeOutbox`** (`@kernel/outbox`) — `PRODUCT_CREATED` and `PRODUCT_RELEASE_DATE_CHANGED` events are enqueued in-session; the relay is nudged post-commit.
- **`withTransaction`** (`@infrastructure/runtime/database`) — wraps the write core in a MongoDB session/transaction.
- **`applyImageWriteback` / `imageStore`** (`@infrastructure/adapters/image-store`) — applies new image URL/thumbnail/pending-key to the document during update.
- **`enqueueIfPending`** (`./image`) — post-commit image processing queue (create path).
- **`clearedOrValue`** (`@infrastructure/persistence/changes`) — converts `null` to the store's "unset" sentinel so Mongoose issues `$unset`.
- **`rearmPrecondition`** (`@infrastructure/persistence/versioning`) — imported for optimistic-concurrency (ETag) handling in the update path.
- **`recordAudit`** (`@infrastructure/observability/audit`) + **`productsAuditActions`** (`../audit`) — audit entries for create (and presumably update) operations.
- **`generateSuccess` / `generateReject`** (`@infrastructure/http/response`) — build the HTTP response envelope (used in the truncated portion).
- **`sanitizeStringArray`** (`./validation`) — normalises `categories` and `tags` arrays before persistence.
- **`t`** (`@infrastructure/i18n`) — imported for localised messages (likely in response or error paths).
- **`ProductDocument`** (`../model`) — the Mongoose document type everything reads/writes.
- **`PRODUCT_CREATED`, `PRODUCT_RELEASE_DATE_CHANGED`** (`../events`) — event-name constants enqueued to the outbox.

## Notes

- **`onHand` is always 0 on create.** The actual opening count is applied asynchronously by the `inventory` module, which subscribes to `PRODUCT_CREATED`. The response may show `onHand: 0` until the outbox relay delivers.
- **Post-commit steps are deliberately lossy.** `afterCommitStep` swallows each step's error (log only) so one failure (e.g. audit write) never blocks the next (e.g. image enqueue) or turns a committed write into a 500.
- **`currency` is never persisted.** It is resolved live at serialization time (`applyProductAvailability` in the model), so it is excluded from `ProductCreateData`.
- **Null ≠ zero/standard/unset.** The domain type uses "absent" for those defaults. This service widens the input to `null` to distinguish "clear it" from "leave it default," then maps `null` → `$unset` via `clearedOrValue`.
- **`touch: true`** does not change any domain field; it only calls `markModified('updatedAt')` so the ETag advances when the only write is to translation rows.
- **The `inventory` module cannot be imported here** (circular dependency), which is why the initial stock count is deferred to an event subscriber rather than written inline.
