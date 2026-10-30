---
source: src/modules/cart/controllers/post-reorder.ts
sha256: 505b3dacb7481fe9517f5e2c86f6f0093e8f5c6578f4faeaef7074a8ff834162
generated_at: 2026-10-29T03:20:57.158227+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/post-reorder.ts

## Purpose

Thin HTTP adapter for `POST /cart/reorder`. Validates the request body, delegates to `cartService.reorderIntoCart`, and maps the result onto an Express response. All business logic lives in the service layer; this file only handles parsing, auth-context extraction, and status-code translation.

## Key elements

- **`postReorder`** (exported) — Express handler. Parses `{ orderId }` via `ReorderBody` (Zod), calls `cartService.reorderIntoCart` with the caller's auth context, then either sends a `refused` 409 (nothing left to add) or a `200` with a `ReorderResponse` payload.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies `parseBody` (Zod validation → 422), `refused` (maps a service-level refusal to a 409), and `catchAs` (unified error handler).
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf`, which extracts the caller's identity/locale context from the request for downstream service use.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse`, the canonical 2xx wrapper.
- **`src/modules/cart/routes.ts`** — registers `postReorder` on the `POST /cart/reorder` route.
- **`src/modules/cart/services/index.ts`** — provides `cartService.reorderIntoCart`, the actual reorder logic (reads an order, writes lines into the caller's cart).
- **`src/types/index.ts`** — defines `ReorderRequest` and `ReorderResponse` used in the handler's type signature.

## Notes

- A malformed `orderId` yields **422** (body-field validation failure), not 404 — the comment in the source calls this out explicitly.
- An order where every line is `removed` or `capped` returns **409** via `refused`, not a 200 with empty data.
- `request.authContext!` uses a non-null assertion; the route layer is expected to guarantee auth before this handler runs.
- Each line in the response reports its disposition (`added`, `capped`, `removed`), mirroring the merge-controller pattern.
