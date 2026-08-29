# src/modules/products/service.ts

## Purpose

Business-logic layer for the Product entity. Translates high-level operations (search, CRUD, facet counts) into repository calls and orchestrates side-effects (analytics, audit, domain events, image-file cleanup). Controllers and other modules call this service rather than the repository directly.

## Key elements

- **`validateData(productData: unknown): ResponseErrorItem[]`** — Zod-schema validation at the untyped boundary; returns UI-friendly error messages (empty array = valid).
- **`callerScope`** — Pre-built visibility filter via `createVisibilityScope`. `undefined` for admins (no restriction); public-catalogue predicate for everyone else.
- **`search(filters, scope?)`** — Product search with text/price/category filters and 1-based pagination. Delegates query construction to `productRepository.search`.
- **`searchViewed(filters, scope, context)`** — Wraps `search` + emits a `PRODUCTS_SEARCHED` analytics event. Exists separately so non-controller callers (tests, `facets`) can read the catalogue without triggering analytics.
- **`getById(id, scope?)`** — Fetch a single product; returns `undefined` for falsy id, `null`/`undefined` if not found.
- **`getByIdViewed(id, scope, context)`** — Wraps `getById` + emits a `PRODUCT_VIEWED` analytics event.
- **`create(data, context)`** — Inserts a new product; sanitizes `categories`/`tags`; emits an `ADMIN_PRODUCT_CREATED` audit event.
- **`update(product, data)`** — In-place field mutation, then `productRepository.save`. If `imageUrl` changed, removes the old file from `imageStore` after saving.
- **`updateById(id, data, context)`** — Fetch-then-update; returns a `generateReject(404, …)` envelope (not a throw) when the product is missing; emits `ADMIN_PRODUCT_UPDATED` audit on success.
- **`remove(product, hardDelete?)`** — Emits `PRODUCT_DELETED` domain event **before** the write (so downstream listeners finish first). Hard delete: `deleteOne` + `imageStore.remove`. Soft delete: toggles `deletedAt`.
- **`removeById(id, hardDelete?)`** — Fetch-then-remove; 404 reject envelope if not found.
- **`facets`** *(truncated in source)* — Returns category/tag counts for the public catalogue; pass-through to a repository aggregation.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@infrastructure/adapters/image-store.ts` | `update` and `remove(hard)` call `imageStore.remove(…)` to delete superseded/removed image files. |
| `@infrastructure/http/request.ts` | Imports the `CallerContext` type used by analytics/audit wrappers. |
| `@infrastructure/http/response.ts` | Imports `generateSuccess`, `generateReject`, `validationErrors`, and response types for uniform envelope returns. |
| `@infrastructure/i18n/index.ts` (→ `context.ts`) | Imports `t` for localized user-facing messages (e.g. "not found", "hard-deleted"). |
| `@infrastructure/observability/analytics/index.ts` | `searchViewed` / `getByIdViewed` emit events via `emitAnalyticsEvent` + `buildAnalyticsBase`. |
| `@infrastructure/observability/audit.ts` | `create` / `updateById` emit audit records via `emitAuditEvent` + `buildAuditEvent`. |
| `@infrastructure/persistence/search.ts` | Imports `PaginatedMeta` type for search result shape. |
| `@kernel/authorization.ts` | `createVisibilityScope` builds the `callerScope` used to restrict reads. |
| `@kernel/events.ts` | `emitDomainEvent(PRODUCT_DELETED, …)` in `remove`; awaited before the DB write. |
| `./analytics.ts` | `productsAnalyticsEvents` enum keys for event names. |
| `./audit.ts` | `productsAuditActions` enum keys for audit actions. |
| `./events.ts` | `PRODUCT_DELETED` event constant. |
| `./model.ts` | `zodProductSchema`, `ProductDocument` type. |
| `./repository.ts` | `productRepository` — all DB reads/writes. |
| `controllers/delete-products.ts` | Calls `removeById`. |
| `controllers/get-catalogue-facets.ts` | Calls the (truncated) `facets` function. |
| `modules/cart/tests/integration/service.test.ts` | Cart integration tests exercise the `PRODUCT_DELETED` domain event emitted by `remove`. |

## Notes

- **No stock writes here.** A large inline comment documents that absolute stock writes were removed from `update`; counters now move only via signed transitions in `@modules/inventory` (`receipts`, `adjustments`) to avoid lost-update races.
- **`*Viewed` wrappers are intentional.** Analytics is not folded into `search`/`getById` so that internal callers (unit tests, cross-module lookups, `facets`) don't pollute analytics streams.
- **404 reporting style.** `updateById` and `removeById` return a `ResponseReject` envelope rather than throwing, making "not found" distinguishable from a genuine DB error at the call site.
- **`PRODUCT_DELETED` is awaited before the write.** This guarantees listeners (e.g. cart emptying the product from every user's cart) complete before the product stops resolving, keeping the dependency arrow cart → products only.
- **`validateData` accepts `unknown` by design** — it is the single point where raw request data is established as typed; callers are not expected to pre-cast.
- **`update` mutates the document in place** before calling `save`; it does not construct a new object.
