---
source: src/modules/orders/controllers/get-orders.ts
sha256: c6722f6b27f489138c46878a53a50075ea5cd9f5d5257645b6cfccfd6e9dfd1f
generated_at: 2026-10-29T04:38:38.433057+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-orders.ts

## Purpose

Thin search/list controller for `GET /orders`. It wires the shared `createSearchController` factory to the order service, applying caller-scoped visibility and a permission gate on the `userId` filter so that only callers with `display:Order` can search across all users' orders.

## Key elements

- **`searchOrdersQuerySchema`** — Extends the orval-generated `SearchOrdersBody` with `page`, `pageSize`, and a coerced `deleted` boolean. All three extra fields come from `@infrastructure/http/schemas` so every search endpoint shares the same pagination/boolean contract.
- **`honourUserIdFilter(input, request)`** — Strips `userId` from the parsed input unless the caller holds the `display:Order` key. Exposed so the sibling export controller can reuse the same gate.
- **`getOrders`** — The route handler built by `createSearchController({ entity, schema, extendInput, runSearch })`. `runSearch` delegates to `orderService.search` with `orderService.callerScope` for row-level filtering, then enriches results via `orderService.withListActions`.

## Relationships

- **`create-search-controller.ts`** — Factory that `getOrders` is constructed from; supplies validation, pagination normalization, and response shaping.
- **`services/index.ts`** — `orderService` performs the actual DB search, caller scoping, and list-action enrichment.
- **`request.ts`** — `callerContextOf(request)` extracts the caller context passed into the service layer.
- **`schemas.ts`** — Provides `pageSchema`, `pageSizeSchema`, and `optionalBooleanSchema` used to build `searchOrdersQuerySchema`.
- **`permissions.ts`** — `callerForSubject` resolves the correct permission subject for the authenticated caller.
- **`ability.ts`** — `heldRules(...)` returns the set of held ability keys; the controller checks `.has('display:Order')` on that set.
- **`get-orders-export.ts`** — Sibling controller that imports `honourUserIdFilter` for the same `userId` permission gate.
- **`routes.ts`** — Registers `getOrders` on the orders router (consumer of this module).

## Notes

- The `deleted` field requires `optionalBooleanSchema` because query-string values arrive as text (`"true"`/`"false"`), whereas the request-body boolean is already a native `boolean` that Zod passes through unchanged.
- The `display:Order` check deliberately inspects the held **keys** (`heldRules(...).has(...)`) rather than asking CASL whether the subject can `read Order`. Both `display:Order` and `read:Order` map to `read` on the `Order` subject, so a CASL `allows`/`holds` call would return true for a caller who only has `read:Order` — the key-level check avoids that false positive.
- `honourUserIdFilter` is exported (not just used locally) specifically for reuse in `get-orders-export.ts`.
