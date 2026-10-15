---
source: src/modules/orders/controllers/get-order-item.ts
sha256: cd92bd56560c5cc1d5ce5d4de06ebea959dc5dd9c7945b29a74f6f4fe3bec16e
generated_at: 2026-10-15T10:59:27.672841+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-order-item.ts

## Purpose

HTTP controller for `GET /orders/:id`. It retrieves a single order scoped to the caller's role (non-admins can only see their own), validates the path id before touching the database, records a staff-read audit event, sets an ETag for optimistic concurrency, and returns a caller-specific response body.

## Key elements

- **`getOrderItem(request, response)`** — the sole export; the Express handler for the single-order endpoint.
  - Validates the `:id` path parameter via `requireId`; a malformed id short-circuits with the same 404 as an unknown id.
  - Calls `orderService.getForCaller(id, authContext)` to fetch the order with role scoping.
  - On success: records a staff-read audit entry, sets the `ETag` header, and delegates body serialization to `respondWithOrder`.
  - On failure: rejects with a localized 404 (`orders.not-found`) or hands the error to `catchAs`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/services/index.ts` | Provides `orderService.getForCaller` — the single data-fetch call. |
| `src/modules/orders/controllers/respond.ts` | Provides `respondWithOrder`, which serializes the order and attaches caller-specific permitted actions. |
| `src/modules/orders/audit.ts` | Provides the `ordersAuditActions.ADMIN_ORDER_VIEWED` constant used in the audit record. |
| `src/kernel/staff-read.ts` | Provides `recordStaffRead` for logging the read event. |
| `src/infrastructure/http/ids.ts` | Provides `requireId` for path-parameter validation before any query. |
| `src/infrastructure/http/response.ts` | Provides `rejectResponse` for the 404 short-circuit. |
| `src/infrastructure/http/preconditions.ts` | Provides `setEtag` to stamp the version for `If-Match` on edits. |
| `src/infrastructure/http/controller.ts` | Provides `catchAs` as the promise error handler. |
| `src/infrastructure/i18n/index.ts` | Provides the `t()` translator for the localized 404 message. |
| `src/modules/orders/routes.ts` | Registers this handler on the router. |

## Notes

- **Malformed ≠ not-found (by design).** `requireId` is called *before* any service query so a syntactically bad id returns the same 404 as a non-existent one, preventing id-space enumeration.
- **ETag is for `If-Match` on subsequent edits.** The comment in the file makes explicit that the version stamped here is the one a client must echo back when it later sends a mutation.
- **Response is caller-specific, not a canonical order shape.** `respondWithOrder` receives `authContext` and a caller label (`'getOrderItem'`) so the body includes only the actions *this* caller is allowed to perform; the client renders controls from the server's answer rather than a local copy of the lifecycle.
