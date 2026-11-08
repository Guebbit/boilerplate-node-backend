---
source: src/modules/invoicing/controllers/get-order-credit-notes.ts
sha256: 248491241b7b9aaf6584329729422676c3e9baf62870e68662483b05010a4822
generated_at: 2026-11-08T06:09:47.314716+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/controllers/get-order-credit-notes.ts

## Purpose

Handler for `GET /orders/:id/credit-notes`. Returns the list of settled credit notes (refunds) on a given order so a client can pick one to download. Scope is enforced at the service layer: non-admin callers see only their own order, staff with the payments read role see assigned orders, and an order the caller cannot access yields a `404`.

## Key elements

- **`getOrderCreditNotes`** (exported) — Express handler accepting `Request<{ id?: string }>` / `Response`. Resolves the order id, delegates to `invoicingService.creditNotesForCaller`, maps each note through `presentCreditNoteSummary`, and responds with `{ items: CreditNoteSummary[] }` at `200`.

## Relationships

- **`src/modules/invoicing/routes.ts`** — Registers this handler on the `GET /orders/:id/credit-notes` route.
- **`src/modules/invoicing/services/index.ts`** — Supplies `invoicingService`, whose `creditNotesForCaller(id, authContext, callerContext)` performs the actual data fetch and authorization.
- **`src/modules/invoicing/presenter.ts`** — Supplies `presentCreditNoteSummary`, which shapes each raw note into the `CreditNoteSummary` DTO.
- **`src/infrastructure/http/controller.ts`** — Supplies `refused` (short-circuits the response on 403/404 results) and `catchAs` (uniform error handling).
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId` to extract and validate the `:id` param, writing a `404` with `orders.not-found` when absent.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf` to derive the caller's identity/role for service-level scoping.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` to emit the standard `200` envelope.
- **`src/types/index.ts`** — Supplies the `CreditNoteSummary` type used in the response contract.

## Notes

- The handler does **no** authorization checks itself; scoping is delegated entirely to `invoicingService.creditNotesForCaller`. The `request.authContext` and the derived `callerContextOf(request)` are both passed in.
- An empty array (`[]`) is a valid `200` response for an order that has never been refunded, distinct from the `404` path for an inaccessible order.
- Error messages are routed through `catchAs(response, 'getOrderCreditNotes')`, which maps thrown errors to HTTP status codes using a per-handler key.
