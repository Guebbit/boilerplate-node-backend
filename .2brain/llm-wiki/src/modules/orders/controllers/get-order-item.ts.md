---
source: src/modules/orders/controllers/get-order-item.ts
sha256: 03555e002775ece89d263c78f905f6a4b8d8049d09ca5a5933ed5817532fa350
generated_at: 2026-10-29T04:38:01.754940+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-order-item.ts

## Purpose

Controller for `GET /orders/:id`. Validates the path id, fetches a single order scoped to the caller's role, records an audit event for staff, sets an ETag, and delegates response shaping (including caller-specific permitted actions) to the shared `respondWithOrder` helper.

## Key elements

- **`getOrderItem`** *(exported)* — The sole export and route handler. Sequence:
  1. `requireId` extracts and validates `:id`; a malformed id short-circuits with 404 (no 400).
  2. `orderService.getForCaller(id, authContext)` fetches the order for the current role.
  3. If the order is `null`, responds 404 via `rejectResponse`.
  4. `recordStaffRead` logs `ordersAuditActions.ADMIN_ORDER_VIEWED` with the buyer id.
  5. `setEtag` stamps the response with the order's version token (used as `If-Match` on subsequent edits).
  6. `respondWithOrder` serialises the order **plus** the actions this caller may perform, so the client renders its UI from the server's answer.
  7. `.catch(catchAs(…))` converts thrown errors to a consistent error response.

## Relationships

| Neighbor | Interaction |
|---|---|
| `infrastructure/http/ids.ts` | `requireId` — validates the path parameter before any query is issued. |
| `infrastructure/http/response.ts` | `rejectResponse` — sends the 404 body. |
| `infrastructure/http/controller.ts` | `catchAs` — wraps the promise `.catch` into a standard error response. |
| `infrastructure/http/preconditions.ts` | `setEtag` — writes the `ETag` header for optimistic concurrency. |
| `infrastructure/i18n` | `t` — localises the "not found" message. |
| `kernel/staff-read.ts` | `recordStaffRead` — persists the audit row when a staff member views the order. |
| `modules/orders/audit.ts` | `ordersAuditActions.ADMIN_ORDER_VIEWED` — the action enum used in the audit record. |
| `modules/orders/domain/index.ts` | `buyerIdOf` — extracts the owner id from the order for the audit entry. |
| `modules/orders/services/index.ts` | `orderService.getForCaller` — performs the actual data lookup scoped to the caller. |
| `modules/orders/controllers/respond.ts` | `respondWithOrder` — builds the JSON body including caller-scoped permitted actions. |
| `modules/orders/routes.ts` | Registers `getOrderItem` as the handler for `GET /orders/:id`. |

## Notes

- **Malformed-id convention:** a syntactically invalid `:id` is intentionally treated identically to an unknown id (both → 404). Do not add a separate 400 path; this is deliberate to avoid leaking format validation to the client.
- **Caller-scoped actions in the body:** the response includes the set of actions the *current* caller may perform. The client must not duplicate the order-lifecycle rules; it renders controls from this field.
- **ETag is a version token, not a content hash:** it is meant to be echoed back as `If-Match` on the corresponding edit endpoint.
