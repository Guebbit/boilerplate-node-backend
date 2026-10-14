---
source: src/modules/invoicing/routes.ts
sha256: 8a5f634356f4536642fdc1c1ae628401e6accb273bd50816ee70fe78e396b39c
generated_at: 2026-10-14T16:08:24.213612+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/routes.ts

## Purpose

Express router that registers the three invoicing download endpoints (invoice PDF, credit-note list, single credit-note PDF) under the shared `/orders` mount. It exists so invoicing can attach its routes to the same URL prefix as the `orders` module without path collisions (all invoicing paths have two or more segments after `/:id`).

## Key elements

- **`router`** (exported) — The Express `Router` instance. Applies `getAuth` → `isAuth` globally, then exposes:
  - `GET /:id/invoice` — guarded by `invoicingLimiter`; delegates to `getOrderInvoice`.
  - `GET /:id/credit-notes` — no limiter; delegates to `getOrderCreditNotes` (list read).
  - `GET /:id/credit-notes/:creditNoteId` — guarded by `invoicingLimiter`; delegates to `getOrderCreditNote`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Imports `getAuth` and `isAuth`; applied as router-level middleware so every route requires a resolved, signed-in session.
- **`src/modules/invoicing/rate-limits.ts`** — Imports `invoicingLimiter`; applied per-route only on the two PDF-rendering endpoints (the ones that spawn Chromium).
- **`src/modules/invoicing/controllers/get-order-invoice.ts`** — Provides the `getOrderInvoice` handler.
- **`src/modules/invoicing/controllers/get-order-credit-notes.ts`** — Provides the `getOrderCreditNotes` handler.
- **`src/modules/invoicing/controllers/get-order-credit-note.ts`** — Provides the `getOrderCreditNote` handler.
- **`src/modules/invoicing/module.ts`** — Mounts this `router` under `/orders` (see `docs/api/contract-fragmentation.md` for the shared-prefix precedent).
- **`src/modules/invoicing/tests/unit/routes.test.ts`** — Unit-tests the route registrations and middleware order.

## Notes

- **Idempotent auth:** `getAuth` early-returns when a request already carries a resolved auth context, so mounting it in both `orders` and `invoicing` routers is free after the first pass.
- **No caching:** The invoice and single credit-note routes deliberately skip any response cache; a JSON cache would only retain the first byte range Express flushes, and each hit must render a fresh PDF.
- **Limiter scope:** `invoicingLimiter` is applied only to routes that trigger a Chromium launch (invoice, single credit-note). The credit-note *list* is a plain read and is not rate-limited.
- **Collision safety:** Invoicing paths (`/:id/invoice`, `/:id/credit-notes[/:creditNoteId]`) always have ≥ 2 segments after the param, so they cannot shadow `orders`' single-segment `/:id` regardless of mount order.
