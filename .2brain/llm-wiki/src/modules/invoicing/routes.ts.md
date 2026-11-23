---
source: src/modules/invoicing/routes.ts
source_sha256: ef8cfec32236d23ddb8d0600b67fcfb3ddae6ac35af05f32a5797c64310202e5
context_sha256: 8b072cb6de3c2ea7e4b554d81f315e1c3f757c77a6563d4f81f09c1f3714cd1e
generated_at: 2026-11-22T05:34:06.529749+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/routes.ts

## Purpose
Defines the Express router for invoicing's three download routes: the order invoice, the list of credit notes, and a single credit note. The router is mounted at `/orders` and shares that prefix with the `orders` module's own router (see `./module.ts`).

## Key elements
- `router`: the exported Express `Router`.
- `router.use(getAuth, isAuth)`: applies authentication to every route below it. `getAuth` resolves the session and `isAuth` requires a signed-in user.
- `GET /:id/invoice`: runs `invoicingLimiter`, then `getOrderInvoice`.
- `GET /:id/credit-notes`: runs `getOrderCreditNotes` with no limiter, because it is a plain read.
- `GET /:id/credit-notes/:creditNoteId`: runs `invoicingLimiter`, then `getOrderCreditNote`.

## Relationships
- `src/kernel/middlewares/authorizations.ts`: provides `getAuth` and `isAuth`, applied router-wide.
- `src/modules/invoicing/controllers/get-order-invoice.ts`, `get-order-credit-note.ts` and `get-order-credit-notes.ts`: the handlers for the three routes.
- `src/modules/invoicing/rate-limits.ts`: provides `invoicingLimiter`, applied to the two PDF routes.
- `src/modules/invoicing/module.ts`: mounts this router at `/orders`.
- `src/modules/invoicing/tests/unit/routes.test.ts`: unit tests for this router.

## Notes
- `getAuth` returns early if the request already has a resolved auth context. Mounting it here after another router has run it costs nothing.
- The invoicing paths have two or more segments, so they never collide with `orders`' single-segment `/:id`, whichever router runs first.
- The invoice route is deliberately kept out of the JSON cache. Caching PDF bytes there would only hold the first byte range Express flushed. The PDF store in `src/modules/invoicing/services/render.ts` holds the bytes instead.
- `invoicingLimiter` guards the Chromium launch that a PDF render spawns.
- The file's header comment points to `scripts/contracts/fragments.ts` (section "which-fragment-owns-which-operation").
