---
source: src/modules/invoicing/controllers/get-order-credit-notes.ts
sha256: ac8272f5e8cf2aa58fac7d249f5b0b44bf16ce300d901e65e711d88bf974d545
generated_at: 2026-10-14T16:05:21.895345+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/controllers/get-order-credit-notes.ts

## Purpose

HTTP controller for `GET /orders/:id/credit-notes`. Resolves an order (scoped to the authenticated caller), then returns the list of settled credit notes (refunds) on that order. Yields `[]` when no refund exists, `404` when the order is missing or invisible to the caller.

## Key elements

- **`getOrderCreditNotes`** (exported) — Express handler. Validates `:id` via `requireId`, loads the order with `orderService.getForCaller`, fetches credit notes with `invoicingService.findCreditNotesForOrder`, and maps each note through `presentCreditNoteSummary` before sending a 200 array. Errors are funneled to `catchAs`.

## Relationships

- **`@infrastructure/http/ids`** — `requireId` extracts and validates the `:id` path parameter; aborts with a 404 if absent.
- **`@infrastructure/http/response`** — `successResponse` / `rejectResponse` build the final HTTP payload.
- **`@infrastructure/http/controller`** — `catchAs` provides the unified error-handler wrapper around the promise chain.
- **`@infrastructure/i18n`** — `t` resolves the `"orders.not-found"` message key.
- **`@modules/orders`** (→ `src/modules/orders/index.ts` → `src/modules/orders/services/index.ts`) — `orderService.getForCaller` enforces caller-scoped visibility before any invoicing query runs.
- **`../services`** (`src/modules/invoicing/services/index.ts`) — `invoicingService.findCreditNotesForOrder` performs the actual credit-note lookup.
- **`../presenter`** (`src/modules/invoicing/presenter.ts`) — `presentCreditNoteSummary` shapes each raw note into the `CreditNoteSummary` DTO.
- **`@types`** (`src/types/index.ts`) — `CreditNoteSummary` type used as the response generic.
- **`src/modules/invoicing/routes.ts`** — registers this handler on the `GET /orders/:id/credit-notes` route.

## Notes

- Caller-scoping is delegated entirely to `orderService.getForCaller`; there is no admin/non-admin branching in this file.
- An order that exists but has zero refunds returns a 200 with `[]`, not a 404 — only a missing/invisible order produces 404.
- `order._id` is coerced with `String()` before being passed to `findCreditNotesForOrder`; the invoicing service expects a string key.
- The handler is intentionally a flat promise chain (`.then`/`.catch`) rather than `async/await`, consistent with the surrounding controller style.
