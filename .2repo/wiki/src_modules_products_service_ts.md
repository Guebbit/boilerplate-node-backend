# src/modules/products/service.ts

## Purpose

The product service layer: all business logic for the catalogue entity. It is the single entry point controllers call into, sitting between HTTP handlers and the repository. It owns validation, search/read access control, CRUD orchestration, image-lifecycle side-effects, and the emission of analytics/audit/domain events.

## Key elements

- **`validateData(productData: unknown)`** — Runs the Zod product schema; returns an empty array on success or a list of `ResponseErrorItem` on failure. Accepts `unknown` deliberately so callers never cast at the boundary.
- **`callerScope`** — A visibility-scope function (from `createVisibilityScope`) that resolves to `undefined` for admins (no filter) or the published-catalogue scope for everyone else.
- **`search(filters, scope)`** — Core catalogue query; delegates to `productRepository.search`. No analytics here.
- **`searchViewed(filters, scope, context)`** — Wraps `search` and emits a `PRODUCTS_SEARCHED` analytics event. Exists so non-HTTP callers (tests, `facets`) can search without needing a `CallerContext`.
- **`getById(id, scope)`** — Fetches one product; returns `Promise.resolve()` (i.e. `undefined`) when `id` is falsy, or the repository's `null` on miss.
- **`getByIdViewed(id, scope, context)`** — Wraps `getById` and emits `PRODUCT_VIEWED` when a product is found.
- **`create(data, context)`** — Persists a new product, sanitises `categories`/`tags`, fires an audit event, and enqueues a background image-digest job if a `pendingImageKey` is present.
- **`update(product, data)`** — Applies partial field changes, handles image-replacement (URL swap + old-file deletion via `imageStore.remove`), saves, then enqueues image digest if pending. Notably does **not** touch any stock/counter field.
- **`updateById(id, data, context)`** — Fetches by ID, returns a 404 `ResponseReject` (not a throw) on miss, delegates to `update`, fires an audit event, and wraps the result in `generateSuccess`.
- **`remove(product, hardDelete?)`** — Soft delete is a **flip** on `deletedAt` (calling twice restores). Hard delete removes the document and the image file. Both paths `await` `emitDomainEvent(PRODUCT_DELETED, …)` before the write so downstream listeners (e.g. cart cleanup) have completed first.
- **`sanitizeStringArray`** (internal) — Trims, drops blanks, de-duplicates string arrays for `categories`/`tags`.
- **`enqueueIfPending`** (internal) — Fire-and-forget publish of an image-digest job when `pendingImageKey` is set.

## Relationships

- **`src/kernel/authorization.ts`** — Provides `createVisibilityScope`, which produces the `callerScope` export; read-path access control is entirely delegated here.
- **`src/kernel/events.ts`** — `emitDomainEvent` is called (and awaited) in `remove` before the DB write, so domain listeners finish before the product state changes.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` / `buildAnalyticsBase` are used by `searchViewed` and `getByIdViewed`.
- **`src/infrastructure/observability/audit.ts`** — `emitAuditEvent` / `buildAuditEvent` fire on `create` and `updateById`.
- **`src/infrastructure/adapters/image-store.ts`** — `imageStore.remove` deletes the old image file on image replacement (`update`) and on hard delete (`remove`).
- **`src/infrastructure/adapters/image.worker.ts`** — `enqueueImageDigest` is called (fire-and-forget) after create/update when a pending upload key exists.
- **`src/infrastructure/http/response.ts`** — `generateSuccess`, `generateReject`, `validationErrors` shape every HTTP-facing return value.
- **`src/infrastructure/http/request.ts`** — Imports the `CallerContext` type used by the "Viewed" wrappers and the audit/analytics paths.
- **`src/infrastructure/i18n/index.ts`** — `t()` localises user-facing strings (e.g. `products.not-found`, `products.hard-deleted`).
- **`src/infrastructure/persistence/search.ts`** — Provides the `PaginatedMeta` type on search results.
- **`src/modules/products/analytics.ts`** — Supplies the `productsAnalyticsEvents` enum (event names).
- **`src/modules/products/audit.ts`** — Supplies the `productsAuditActions` enum (action names).
- **`src/modules/products/controllers/delete-products.ts`** — Controller that calls `remove` (the only exported write path for deletion).
- **`src/modules/cart/tests/integration/service.test.ts`** — Integration test that exercises the product service (search/getById) through the cart flow.

## Notes

- **"Viewed" wrappers are deliberate.** `searchViewed` / `getByIdViewed` exist so that unit tests, inter-service lookups, and `facets` can call `search` / `getById` without fabricating a `CallerContext`. Do not fold the analytics logic into the base functions.
- **Stock/counter fields are absent by design.** `update` intentionally omits any inventory write; counters now move only through signed, conditional transitions in `@modules/inventory`. Do not re-add a raw `stock` assignment here.
- **`remove` soft-delete is a toggle.** A second `remove` call on an already-soft-deleted product restores it (`deletedAt` flips to `undefined`).
- **404 is returned, not thrown.** `updateById` uses `generateReject(404, …)` so the surrounding `.catch()` can distinguish "product not found" from a genuine database error.
- **`enqueueIfPending` is fire-and-forget.** A `pendingImageKey` means the upload was already accepted by a broker; the service publishes a queue message and never awaits the worker.
- **Image URL, thumbnail, and pending key travel as a unit** — all three are set together from a single `readUploadedImage` call on the controller side; `update` only swaps them when `imageUrl` actually changes.
