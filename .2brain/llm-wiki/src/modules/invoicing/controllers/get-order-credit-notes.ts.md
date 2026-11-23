---
source: src/modules/invoicing/controllers/get-order-credit-notes.ts
source_sha256: 248491241b7b9aaf6584329729422676c3e9baf62870e68662483b05010a4822
context_sha256: dd795323e1dd85c9adcd42887b60734a91428f426ef1db32b1f2afb51563e739
generated_at: 2026-11-22T05:29:54.264556+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/controllers/get-order-credit-notes.ts

## Purpose
Express controller for `GET /orders/:id/credit-notes`. It returns the list a client picks a credit-note download from: one row per refund that settled on the order. The result is `[]` for an order that was never refunded or whose money the caller may not read, and `404` for an order the caller cannot see.

## Key elements
- `getOrderCreditNotes(request, response)` is the only export. It is an Express handler that:
  1. Validates the `:id` param with `requireId`, using the `orders.not-found` error key. If the id is missing or invalid it returns early, since `requireId` has already handled the response.
  2. Calls `invoicingService.creditNotesForCaller(id, request.authContext, callerContextOf(request))`.
  3. If `refused(response, result)` is true, it returns without further output.
  4. Otherwise it maps `result.data` through `presentCreditNoteSummary` and sends `{ items: CreditNoteSummary[] }` with status `200` via `successResponse`.
  5. Rejections are routed to `catchAs(response, 'getOrderCreditNotes')`.

## Relationships
- `src/modules/invoicing/services/index.ts`: supplies the `invoicingService` that the handler calls to fetch the credit notes, which does the access decisions.
- `src/modules/invoicing/presenter.ts`: supplies `presentCreditNoteSummary`, which shapes each note for the response.
- `src/infrastructure/http/controller.ts`: supplies `catchAs` (error handling) and `refused` (translates a refused service result into a response).
- `src/infrastructure/http/ids.ts`: supplies `requireId` for param validation.
- `src/infrastructure/http/request.ts`: supplies `callerContextOf`, which builds the caller context from the request.
- `src/infrastructure/http/response.ts`: supplies `successResponse`, which builds the success envelope.
- `src/types/index.ts`: supplies the `CreditNoteSummary` type.
- `src/modules/invoicing/routes.ts`: a neighbor in the graph. The route mounting is not visible in this file.
- `src/modules/tasks/tests/integration/idempotent-note.test.ts`: a neighbor in the graph. The file shows no direct interaction with it.

## Notes
- Per the inline doc comment, non-admin callers see only their own order's credit notes, and staff need the payments staff read permission. This is enforced in the service, not in this controller.
- The handler returns a promise chain rather than using `async/await`. It returns `undefined` on early exits.
- The response body is wrapped as `{ items: [...] }`.
