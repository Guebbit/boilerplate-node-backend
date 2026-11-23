---
source: src/modules/products/services/crud.ts
source_sha256: a61eb08d5fd251c4cf0b4eddd9b1e7991e079771b19cfd2537ad36011a8eca1a
context_sha256: 54f215835676df98065334cdfe9bf55ba2039d59d0a10bc6fe0d5a76547856dc
generated_at: 2026-11-22T07:12:42.524929+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/services/crud.ts

## Purpose
Holds the transactional steps of a product write: what the document stores and what each write announces. `./translated-write` composes these steps into the create and update entry points. This file only provides the pieces.

## Key elements
- `insertProduct(data, session)` creates the product row inside the caller's transaction.
  - It sanitizes `categories` and `tags` (trim, drop blanks, de-duplicate).
  - It converts `releaseDate`/`restockDate` day strings to the shop's start of day via `startOfShopDay`.
  - It writes through `productRepository.create`.
  - It enqueues a `PRODUCT_CREATED` outbox event in the same transaction. Per the docblock, `inventory` is the subscriber that opens the stock level at zero, because this module never moves `onHand`.
- `finishCreate(product, context)` runs after the create commits.
  - It nudges the outbox relay, then re-reads the product.
  - It records an `ADMIN_PRODUCT_CREATED` audit entry.
  - It hands a pending image to the queue.
  - Each step goes through `afterCommit`, which catches that step's own failure.
- `ProductUpdateOutcome` is the exported result shape of a transactional update. It carries `updated`, `oldImageUrl`, `changes` (`{from, to}` per field) and `changedFields` (names only).
- Update helpers (module-private):
  - `auditedChangesOf` diffs the audited fields using `auditChanges` and `PRODUCT_AUDITED_FIELDS`. The category and tag lists are sanitized first, so the diff compares what will be stored.
  - `AUDITED_SCALARS`/`AUDITED_LISTS` are compared by value. `AUDITED_BY_NAME` (`title`, `description`) is audited by field name only.
  - `applyDate` moves `releaseDate` or `restockDate` on the document. It returns the `from`/`to` ISO strings, or `undefined` if nothing changed.
  - `announceDateChange` enqueues a date-changed outbox event only when a date actually moved.
  - `termsOf` builds a comparable string of the availability-deciding settings, because `inventory` must be told when one moves. The rest of its body is not visible in the provided content.
- Types and helpers:
  - `ProductCreateData` and `ProductUpdateData` define the accepted inputs. Update widens several fields to accept `null`, and has a `touch` flag.
  - `sanitizeStringArray`, `withoutDates` and `enqueuePendingImage` are small internal helpers.

## Relationships
- `src/modules/products/repository.ts` (`productRepository`): create, `findById`, and `writebackImage`.
- `src/modules/products/model.ts`: supplies the `ProductDocument` type.
- `src/modules/products/events.ts`: `PRODUCT_CREATED`, `PRODUCT_RELEASE_DATE_CHANGED`, `PRODUCT_RESTOCK_DATE_CHANGED` and `PRODUCT_TERMS_CHANGED`.
- `src/modules/products/audit.ts`: `productsAuditActions`.
- `src/kernel/outbox.ts`: `enqueueOutboxEvent` writes events in-transaction, and `nudgeOutbox` wakes the relay.
- `src/infrastructure/runtime/after-commit.ts`: `afterCommit` wraps the post-commit steps.
- `src/infrastructure/observability/audit.ts`: `recordAudit`.
- `src/infrastructure/observability/audit-changes.ts`: `auditChanges`, `differs`, `fieldChange` and the related types.
- `src/infrastructure/persistence/changes.ts`: `clearedOrValue` is used when writing dates.
- `src/infrastructure/adapters/image.worker.ts`: `enqueueIfImagePending` queues the image.
- `src/infrastructure/adapters/image-store.ts` is imported along with `src/infrastructure/persistence/versioning.ts`, `src/infrastructure/http/response.ts` and `src/infrastructure/i18n/index.ts`. Their use is not visible in the shown portion.
- `@modules/shop`: `startOfShopDay`.

## Notes
- `currency` is never stored. It is read live at serialization.
- A `null` in an update clears `imageUrl`, `weight`, `taxClass`, `rateType`, `sku`, `description` and the two dates. `releaseDate: null` means the product is no longer a preorder. `restockDate: null` means it promises "within 30 days".
- `touch: true` moves `updatedAt` when the edit also wrote outside this document, such as translation rows. The row's version (its `ETag`) then moves with the edit.
- The create-side input takes `releaseDate`/`restockDate` as `YYYY-MM-DD` days. The update-side docblock describes them as ISO date-times, but `applyDate` also converts them through `startOfShopDay`.
- `pendingImageKey` means the queue looked ready at upload time. The no-broker path resolves the image inline before saving.
