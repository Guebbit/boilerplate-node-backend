---
source: src/modules/orders/controllers/get-orders.ts
sha256: 1484ca4c68c461b95d396d048efa938ba159414708b4f6f3c28ab6129a4dd79b
generated_at: 2026-10-15T11:00:00.195801+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-orders.ts

## Purpose

Thin controller that wires `GET /orders` to the shared `createSearchController` factory. It defines the query schema, enforces caller-scoped visibility (own-orders vs. all-orders), and delegates the actual search to `orderService`.

## Key elements

- **`searchOrdersQuerySchema`** – Extends the orval-generated `SearchOrdersBody` with `page`, `pageSize` (both from `@infrastructure/http/schemas`), and `deleted` (coerced via `optionalBooleanSchema` for query-string text). Absent page/pageSize are left undefined so `normalizePagination` can apply defaults.
- **`honourUserIdFilter`** – Conditional `extendInput` step. If the caller's held keys do **not** include `orders.any.read`, the `userId` field is stripped from the input, forcing the service to scope to the caller's own orders. Exported so the sibling export controller can reuse the same rule.
- **`getOrders`** – The actual Express handler, produced by `createSearchController`. Calls `orderService.search` with the parsed input, `orderService.callerScope(request.authContext)`, and `callerContextOf(request)`.

## Relationships

- **`@infrastructure/surfaces/create-search-controller`** – Provides the factory that shapes request parsing, validation, and response; this file only supplies config.
- **`@infrastructure/http/schemas`** – Source of the shared `pageSchema`, `pageSizeSchema`, `optionalBooleanSchema` so every search endpoint agrees on pagination/boolean coercion.
- **`@infrastructure/http/request`** – `callerContextOf` extracts the authenticated principal for the service call.
- **`@kernel/permissions`** – `callerForSubject` resolves the caller subject from `request.authContext`.
- **`@kernel/ability`** – `heldKeys` returns the set of permission keys for a subject; used to gate the `userId` filter.
- **`@api/schemas.zod`** – `SearchOrdersBody` (orval-generated) is the base schema this file extends.
- **`../services` (`orderService`)** – Performs the actual search and computes `callerScope`.
- **`get-orders-export.ts`** – Sibling controller that reuses the same `honourUserIdFilter` rule (noted in the docstring).
- **`routes.ts`** – Mounts `getOrders` at the `/orders` route.

## Notes

- `honourUserIdFilter` checks **held keys** (`heldKeys`) rather than CASL abilities directly. The comment explains that `holdsKey` would also match `orders.self.read` (both are `read` on `Order`), so the check is intentionally against the key name `orders.any.read`.
- `deleted` uses `optionalBooleanSchema` specifically because Express query strings deliver booleans as the text `"true"`/`"false"`; the body's native boolean passes through unchanged.
- If a caller lacks `orders.any.read`, `userId` is set to `undefined` in the input rather than being deleted—this lets the service's `callerScope` apply the self-scope without a special-case branch.
