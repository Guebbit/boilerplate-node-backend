---
source: src/modules/products/service.ts
sha256: 9937ff234fe92cff5f7a0fd07d5a7831163733daea49a76312ee5cbf9c887859
generated_at: 2026-09-27T15:33:55.199022+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/service.ts

## Purpose
Business-logic layer for the Product catalogue entity. It is the single entry point controllers call for all product operations (create, read, search, update, delete). Raw database access is delegated to `productRepository`; this module adds validation, locale-aware translation resolution, access scoping, analytics/audit emission, and domain-event dispatch.

## Key elements
- **`validateCreateData` / `validateUpdateData`** — Parse untrusted input against the Zod create/update schemas; return `ResponseErrorItem[]` (empty = valid).
- **`callerScope`** — Wraps `accessibleFilter` for the `'Product'` entity; returns `undefined` (admin, unrestricted) or a published-catalogue filter.
- **`search`** — Locale-aware product search. Free-text matches the product's own column **or** the translations collection (union via `$or`). Applies caller's locale via `applyTranslations` after the repository query.
- **`searchWithTranslatedText`** *(internal)* — Builds the `$or` union: own-column match + translated-entity IDs. Strips `text`/`title` from the remaining filters to avoid a redundant AND in `buildWhere`.
- **`searchViewed` / `getByIdViewed`** — Thin wrappers around `search`/`getById` that additionally emit `PRODUCTS_SEARCHED` / `PRODUCT_VIEWED` analytics. Kept separate so unit tests and cross-module callers (no `CallerContext`) hit the pure functions.
- **`getById`** — Fetch one product, run `.toJSON()` *before* `applyTranslations` (order is load-bearing: translation overlay is a plain-object spread that would clobber the document's own transform).
- **`create`** — Persist a new product with `onHand: 0`. Emits `PRODUCT_CREATED`; the inventory subscriber sets the real count. Re-reads the product after the await so the response reflects the post-listener state.
- **`enqueueIfPending`** *(internal)* — If the saved document carries a `pendingImageKey`, enqueues the image digest worker job.
- **`TRANSLATABLE_SEARCH_FIELDS`** — Constant `['title', 'description']`; the exact columns registered as translatable for `product` in the module definition.

## Relationships
| Neighbor | Interaction |
|---|---|
| `@kernel/translation` | `applyTranslations`, `searchTranslatedEntityIds`, `planTranslations`, `readAllTranslations`, `writeTranslations`, `removeTranslations` — all locale resolution and translated-search logic. |
| `@kernel/access/query` | `accessibleFilter` — builds the per-caller scope passed into every repository call. |
| `@kernel/events` | `emitDomainEvent` — dispatches `PRODUCT_CREATED`, `PRODUCT_DELETED`, `PRODUCT_DEACTIVATED`. |
| `@infrastructure/http/response` | `generateSuccess`, `generateReject`, `validationErrors` — shapes HTTP-level success/reject/error responses. |
| `@infrastructure/i18n` (context, catalog, index) | `getCurrentLocale`, `getFallbackLocale`, `localeCandidatesFor`, `t` — drives which locale chain is resolved. |
| `@infrastructure/observability/analytics` | `emitAnalyticsEvent`, `buildAnalyticsBase` — products-searched / products-viewed tracking. |
| `@infrastructure/observability/audit` | `recordAudit` — audit-log entries per mutation. |
| `@infrastructure/persistence/changes` | `clearedOrValue` — normalises "explicit null vs. omit" on update. |
| `@infrastructure/persistence/create-repository` | `toObjectId`, `withScope` — ID conversion and `$or`-safe scope merging. |
| `@infrastructure/persistence/search` | `toSearchPattern`, `PaginatedMeta` — search-pattern construction and pagination shape. |
| `@infrastructure/adapters/image-store` | `imageStore`, `applyImageWriteback` — image upload / write-back to the product document. |
| `@infrastructure/adapters/image.worker` | `enqueueIfImagePending` — queues the async image-processing job. |
| `src/modules/cart/services/items` | Downstream consumer; resolves product data (price, availability) when cart items are read or validated. |

## Notes
- **`onHand` is always `0` on create.** The real opening stock is set by the inventory module's subscription to `PRODUCT_CREATED`. A failure in that listener leaves the counter at the honest `0`.
- **`currency` is never persisted.** It is read live at serialization time (`applyProductAvailability` in `./model`), so omitting it from the create payload is intentional.
- **`.toJSON()` before `applyTranslations` is mandatory.** The document transform computes `available`, maps `_id → id`, and serialises dates; the translation overlay is a plain-object spread that would overwrite those.
- **`withScope` over object spread.** Both the translated-search union and the caller scope can carry `$or`; a naïve `{ ...union, ...scope }` would drop one.
- **`TRANSLATABLE_SEARCH_FIELDS` is hardcoded** here (and in `./module.ts`) rather than read from the translation registry, to avoid a circular read at search time.
- **Viewed-wrappers are intentional.** `search`/`getById` stay context-free so tests and cross-module callers don't need a `CallerContext`; the analytics moment is opt-in via the `*Viewed` variants.
