---
source: src/modules/invoicing/controllers/get-order-credit-notes.ts
sha256: 248491241b7b9aaf6584329729422676c3e9baf62870e68662483b05010a4822
generated_at: 2026-10-29T04:10:23.693681+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/controllers/get-order-credit-notes.ts

## Purpose

Express controller handler for `GET /orders/:id/credit-notes`. It returns the list of settled credit notes (refunds) on an order so a client can pick one to download. Returns `[]` when the order has no refunds or the caller lacks read access, and `404` when the order is invisible to the caller.

## Key elements

- **`getOrderCreditNotes`** (exported const) — The sole handler. Validates the `:id` param via `requireId`, delegates to `invoicingService.creditNotesForCaller`, maps each note through `presentCreditNoteSummary`, and responds `200` with `{ items: CreditNoteSummary[] }`. Errors are funneled through `catchAs(response, 'getOrderCreditNotes')`.

## Relationships

- **`src/modules/invoicing/services/index.ts`** — Calls `invoicingService.creditNotesForCaller(id, authContext, callerContext)` to fetch and permission-filter the credit notes.
- **`src/modules/invoicing/presenter.ts`** — Uses `presentCreditNoteSummary` to shape each domain note into the `CreditNoteSummary` wire format.
- **`src/modules/invoicing/routes.ts`** — Registers `getOrderCreditNotes` on the `GET /orders/:id/credit-notes` route.
- **`src/infrastructure/http/controller.ts`** — Supplies the `refused` and `catchAs` helpers for short-circuiting permission denials and error responses.
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId` to extract and validate the order ID param (404 on missing/invalid).
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf` to derive the caller's scope (tenant, role, etc.) from the request.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` for the standard 200 envelope.
- **`src/types/index.ts`** — Defines the `CreditNoteSummary` type used in the response payload.

## Notes

- Permission semantics: non-admin callers see only their own order's credit notes; staff additionally need a "payments staff read" grant. The service layer enforces this — the controller only forwards auth context and trusts `refused()` to short-circuit denials.
- The handler is a plain `(req, res) => void` (not a class method), consistent with the `catchAs`/`refused` functional pattern from `@infrastructure/http/controller`.
- `requireId` returns `undefined` and writes the 404 itself; the early `if (!id) return;` is a guard for the compiler, not a runtime branch.
