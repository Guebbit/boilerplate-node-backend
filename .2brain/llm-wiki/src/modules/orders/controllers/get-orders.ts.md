---
source: src/modules/orders/controllers/get-orders.ts
sha256: c6722f6b27f489138c46878a53a50075ea5cd9f5d5257645b6cfccfd6e9dfd1f
generated_at: 2026-11-08T06:46:31.678697+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-orders.ts

## Purpose

Thin search/list controller for orders. Wires the shared `createSearchController` factory to the orders domain service, scoping results to the caller's own visibility via `orderService.callerScope`. Exists so the HTTP layer stays declarative while permission enforcement and pagination normalization live in the shared infrastructure and kernel.

## Key elements

- **`searchOrdersQuerySchema`** – Extends the orval-generated `SearchOrdersBody` with `page`, `pageSize`, and a text-coerced `deleted` boolean. All three coercion helpers come from `@infrastructure/http/schemas` so every search endpoint agrees on what's legal; absent values stay absent for downstream `normalizePagination` to default.
- **`honourUserIdFilter(input, request)`** – Returns `{ userId }` only when the caller holds the `display:Order` rule (checked against held KEYS via `heldRules`, *not* a CASL `can` check, because `read:Order` would also satisfy a generic `read` on `Order`). Otherwise the `userId` key is dropped. Shared with the export endpoint for consistent scoping.
- **`getOrders`** – The exported controller (`GET /orders`). Built with `createSearchController({ entity, schema, extendInput, runSearch })`. `runSearch` delegates to `orderService.search(…)` then enriches the page with `orderService.withListActions(…)`.

## Relationships

- **`src/infrastructure/surfaces/create-search-controller.ts`** – Provides the `createSearchController` factory that `getOrders` is built from; handles parsing, pagination defaults, and response shaping.
- **`src/infrastructure/http/schemas.ts`** – Source of `pageSchema`, `pageSizeSchema`, and `optionalBooleanSchema` used to build `searchOrdersQuerySchema`.
- **`src/infrastructure/http/request.ts`** – Exports `callerContextOf`, passed into `orderService.search` as the third argument.
- **`src/kernel/ability.ts`** – `heldRules` is called on the caller's subject to retrieve the set of permission keys for the `display:Order` check.
- **`src/kernel/permissions.ts`** – `callerForSubject` resolves the auth context to a subject/ability pair used by `heldRules`.
- **`src/modules/orders/services/index.ts`** – Provides `orderService`; the controller calls `search` and `withListActions` on it.
- **`src/modules/orders/routes.ts`** – Registers `getOrders` as the handler for the `GET /orders` route.
- **`src/modules/orders/controllers/get-orders-export.ts`** – Sibling export controller; the comment in `honourUserIdFilter` notes the same rule is shared so both endpoints filter identically.

## Notes

- `honourUserIdFilter` deliberately checks `heldRules(…).has('display:Order')` against the held *keys* rather than asking CASL `can('read', …)`. This is because both `read:Order` and `display:Order` map to `read` on `Order` in the ability model, so a CASL check would pass for read-only callers who should **not** see other users' orders.
- The `deleted` field is coerced from query-string text (`"true"`/`"false"`) via `optionalBooleanSchema`; the body-boolean path (from a POST body) passes through unchanged.
- `page`/`pageSize` are optional by design—absence is meaningful and handled downstream by `normalizePagination`, not by a default in the schema.
