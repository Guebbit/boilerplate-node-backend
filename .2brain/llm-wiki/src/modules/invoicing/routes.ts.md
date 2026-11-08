---
source: src/modules/invoicing/routes.ts
sha256: 656c878eae7b5a7cb977ddd3c3bfdf868817c4d0559bf0c4fea03504ae6cd434
generated_at: 2026-11-08T06:13:47.784140+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/routes.ts

## Purpose

Defines the Express router that exposes three invoicing download endpoints (invoice PDF, credit-note list, single credit-note PDF) under `/orders`. It exists so these read-only file-serving routes can be mounted alongside the `orders` module's own router without path collisions, while sharing the same auth and rate-limiting concerns.

## Key elements

- **`router`** (exported) — the `express.Router` instance carrying all three routes.
- **`GET /:id/invoice`** → `getOrderInvoice` — returns a rendered PDF; guarded by `invoicingLimiter` (Chromium launch cost).
- **`GET /:id/credit-notes`** → `getOrderCreditNotes` — returns the list of credit notes for an order; no PDF limiter needed.
- **`GET /:id/credit-notes/:creditNoteId`** → `getOrderCreditNote` — returns a single credit-note PDF; guarded by `invoicingLimiter`.
- **`router.use(getAuth, isAuth)`** — applies session resolution and signed-in check to every route in this router.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth` and `isAuth`, wired as router-level middleware on every route here.
- **`src/modules/invoicing/controllers/get-order-invoice.ts`** — handler for the invoice PDF route.
- **`src/modules/invoicing/controllers/get-order-credit-notes.ts`** — handler for the credit-note list route.
- **`src/modules/invoicing/controllers/get-order-credit-note.ts`** — handler for the single credit-note PDF route.
- **`src/modules/invoicing/rate-limits.ts`** — exports `invoicingLimiter`, applied per-route on the two PDF-rendering endpoints.
- **`src/modules/invoicing/module.ts`** — mounts this router at `/orders` (shared path with the `orders` module's router).
- **`src/modules/invoicing/tests/unit/routes.test.ts`** — unit tests for the routes defined here.

## Notes

- This router is mounted **at `/orders`**, the same prefix the `orders` module uses. Collisions are avoided by path-segment count: these routes have 2–3 segments while `orders`' own `/:id` has 1.
- `invoicingLimiter` is applied **only** to the two routes that spawn a Chromium render. The list route is a plain DB read and skips the limiter.
- PDF bytes are deliberately **not** placed in the JSON response cache; the PDF store (`services/render.ts`) is the persistence layer for rendered documents.
- `getAuth` is idempotent — if an upstream router already resolved the auth context, it returns early, so re-applying it here has zero runtime cost.
