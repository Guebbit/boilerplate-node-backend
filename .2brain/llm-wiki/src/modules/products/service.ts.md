---
source: src/modules/products/service.ts
sha256: 4ba2bae3f3accbf66394a7731e8ace31fca0d5759882ace1d0fe996916485b00
generated_at: 2026-09-23T19:28:38.114416+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/service.ts

## Purpose

The business-logic layer for the product (catalogue) entity. It is the single entry point controllers call into; all raw database access is delegated to `productRepository`. The service owns validation, access scoping, i18n-aware search, domain-event emission, and analytics/audit side-effects for every catalogue mutation.

## Key elements

- **`validateCreateData` / `validateUpdateData`** – Zod-schema gate for CREATE and PATCH bodies; return `ResponseErrorItem[]` (empty = valid). Accept `unknown` so callers need not pre-cast.
- **`callerScope`** – Wraps `accessibleFilter(context, 'Product')`. Returns `undefined` for admins (no restriction) or a Mongo filter for other roles.
- **`search`** – Main read path. Unions the product's own column match with translated-row matches (`searchTranslatedEntityIds`) across the caller's locale chain, then overlays resolved translations via `applyTranslations` in one batched pass.
- **`searchWithTranslatedText`** – Internal helper that builds the `$or` union (own match OR translated `_id` set) and delegates to `productRepository.search`.
- **`searchViewed` / `getByIdViewed`** – Thin wrappers around `search` / `getById` that emit an analytics event (`PRODUCTS_SEARCHED`, `PRODUCT_VIEWED`). Kept separate so non-HTTP callers (tests, other services) skip the telemetry.
- **`getById`** – Fetches one product, calls `.toJSON()` *before* `applyTranslations` (translation is a plain-object overlay; doing it after would clobber the document's own transforms like `_id → id` and ISO-date formatting).
- **`create`** – Persists with `onHand: 0`, sanitizes `categories`/`tags`, emits `PRODUCT_CREATED` (inventory module is the subscriber that moves the counter), then re-reads the document so the response reflects the post-event state. Optionally enqueues an image-digest job via `enqueueIfPending`.
- **`sanitizeStringArray`** (internal) – Trim, drop blanks, de-duplicate a string array; `null`/non-array → `[]`.
- **`TRANSLATABLE_SEARCH_FIELDS`** – `['title', 'description']`; the columns free-text search compares against, kept local rather than read from the translation registry.
- **`enqueueIfPending`** (internal) – Forwards to `enqueueIfImagePending` with the `'products'` queue name and a writeback callback on the repository.

## Relationships

- **`@infrastructure/i18n`** (index, context, catalog) – `getCurrentLocale`, `localeCandidatesFor`, and `t` drive locale-aware search and the `applyTranslations` overlay on every read.
- **`@kernel/translation`** – Provides `applyTranslations`, `searchTranslatedEntityIds`, `planTranslations`, `writeTranslations`, etc., which implement the i18n storage/retrieval this service orchestrates.
- **`@kernel/events`** – `emitDomainEvent` is called after `create` (and presumably update/delete in the truncated portion) to notify subscribers (e.g., inventory) without a direct import.
- **`@kernel/access/query`** – `accessibleFilter` builds the Mongo filter that restricts reads for non-admin callers.
- **`@infrastructure/http/response`** – `validationErrors`, `generateSuccess`, `generateReject`, and the `ResponseSuccess`/`ResponseReject` types shape every validation and mutation response.
- **`@infrastructure/observability/analytics`** – `emitAnalyticsEvent` / `buildAnalyticsBase` fire the `*_viewed` and `*_searched` events in the `*Viewed` wrappers.
- **`@infrastructure/observability/audit`** – `recordAudit` logs mutations (used in the truncated create/update/delete paths).
- **`@infrastructure/adapters/image-store`** – `imageStore` is imported for the upload/read path (`readUploadedImage` referenced in docblocks, used in the truncated section).
- **`@infrastructure/adapters/image.worker`** – `enqueueIfImagePending` pushes a digest job onto the image queue after a product save carries a pending upload key.
- **`@infrastructure/persistence/search`** – `toSearchPattern` builds the regex; `PaginatedMeta` types the page envelope returned by `search`.
- **`@infrastructure/persistence/create-repository`** – `toObjectId` converts string IDs to Mongo ObjectIds when building the translated-ID union query.
- **`src/modules/cart/services/items` / `reorder`** – Downstream consumers: they import from this service to resolve product data for cart line-items and reorder operations (no reverse import here).

## Notes

- **`onHand` is always written as `0` on create.** The opening stock count is applied *after* the `PRODUCT_CREATED` domain event, by the `inventory` module's `receive()`. A listener failure leaves the honest `0` rather than a speculative value.
- **`.toJSON()` ordering in `getById`** is deliberate: it must run *before* `applyTranslations` because the translation overlay is a plain-object `Object.assign`-style merge that would overwrite the schema's own `toJSON` transforms (`available` flag, `_id → id`, ISO dates).
- **`searchViewed` / `getByIdViewed` exist only for the HTTP path.** Any internal or test caller should use `search` / `getById` directly; the wrappers require a `CallerContext` that non-HTTP call sites don't have.
- **`sanitizeStringArray` is not exported.** Controllers or other services must not bypass it when mutating `categories`/`tags`; only `create`/`update` in this file apply it.
- The file is intentionally the **one place a controller may call into** for product logic; other modules (cart, inventory) interact through domain events or by importing this service, never through the repository directly.
