---
source: src/modules/orders/controllers/get-order.ts
sha256: e3fc73f66fe3fd3c4aa90536f077e76538f81ed5e07ab61b836ced8e16980db8
generated_at: 2026-11-14T20:32:43.114029+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-order.ts

## Purpose
Handles `GET /orders/:id`. Validates the path id before any service call, fetches the order scoped to the caller's role (non-admins see only their own), records a staff-read audit event, and serialises the order into a response that includes caller-specific permissions and a version token for optimistic concurrency.

## Key elements
- **`getOrderItem(request, response)`** — Sole export. Orchestrates the full read pipeline:
  1. `requireId` validates the `:id` param; malformed and unknown ids both short-circuit to 404.
  2. `orderService.getForCaller(id, authContext)` fetches the order scoped to the caller.
  3. If no order is returned, sends a 404 via `rejectResponse`.
  4. `recordStaffRead` logs the view with the `ADMIN_ORDER_VIEWED` audit action and the buyer id as subject.
  5. `respondWithOrder` serialises the order, stamps an `If-Match` version, and attaches caller-specific permission flags to the body.
  6. Any thrown error is funnelled through `catchAs`.

## Relationships
- **`src/infrastructure/http/ids.ts`** → `requireId` gates the request before the service is touched.
- **`src/infrastructure/http/response.ts`** → `rejectResponse` produces the 404 body.
- **`src/infrastructure/http/controller.ts`** → `catchAs` wraps the async chain in a standard error responder.
- **`src/infrastructure/i18n/index.ts`** → `t` localises the 404 message.
- **`src/modules/orders/services/index.ts`** → provides the order service whose `getForCaller` method is the sole data-access call; role scoping happens inside the service.
- **`src/kernel/staff-read.ts`** → `recordStaffRead` writes a structured audit record.
- **`src/modules/orders/audit.ts`** → provides the audit action constants used for the staff-read log.
- **`src/modules/orders/domain/index.ts`** → `buyerIdOf(order)` extracts the buyer id for the audit record.
- **`src/modules/orders/controllers/respond.ts`** → `respondWithOrder` builds the final JSON body, version header, and permission flags.

## Notes
- A malformed `:id` and a genuinely missing order are deliberately indistinguishable to the client (both return the same 404 and i18n string) to avoid leaking existence.
- The response body embeds the set of actions **this caller** may perform on the order; the client is expected to render its UI controls from that payload rather than re-deriving permissions locally.
- `respondWithOrder` sets a version token intended to be echoed back as `If-Match` on subsequent mutations—treat it as an optimistic-concurrency guard, not a plain ETag.
- `routes.ts` wires this handler to the `GET /orders/:id` path (not visible in this file but implied by the module docstring).
