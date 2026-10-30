---
source: src/modules/invoicing/routes.ts
sha256: 656c878eae7b5a7cb977ddd3c3bfdf868817c4d0559bf0c4fea03504ae6cd434
generated_at: 2026-10-29T04:13:34.295778+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/routes.ts

## Purpose

Defines the Express router for invoicing's three PDF/JSON download endpoints under `/orders/:id/…`. It exists so that invoice and credit-note retrieval can be mounted alongside the `orders` module's own router on the same path prefix without collisions, while enforcing authentication and (for PDF routes) a Chromium-launch rate limit.

## Key elements

- **`router`** (exported `Router`) — the sole export; carries three `GET` routes:
  - `/:id/invoice` → `getOrderInvoice`, preceded by `invoicingLimiter`
  - `/:id/credit-notes` → `getOrderCreditNotes` (plain read, no limiter)
  - `/:id/credit-notes/:creditNoteId` → `getOrderCreditNote`, preceded by `invoicingLimiter`
- **`getAuth` / `isAuth`** — applied via `router.use` before any route; `getAuth` resolves the session (no-op if an upstream router already set the context), `isAuth` rejects unauthenticated requests.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — source of `getAuth` and `isAuth`; the "resolved-auth passthrough" contract means this router can be mounted after another router that already ran `getAuth` at no extra cost.
- **`src/modules/invoicing/rate-limits.ts`** — provides `invoicingLimiter`, applied only to the two PDF-rendering routes.
- **`src/modules/invoicing/controllers/get-order-invoice.ts`**, **`get-order-credit-note.ts`**, **`get-order-credit-notes.ts`** — request handlers wired to the three routes.
- **`src/modules/invoicing/module.ts`** — mounts this `router` onto the shared `/orders` prefix (the doc comment references it and the `account`/`addresses` precedent in `docs/api/contract-fragmentation.md`).
- **`src/modules/invoicing/tests/unit/routes.test.ts`** — unit tests exercising these routes.

## Notes

- **No JSON-cache on PDF routes.** Caching PDF bytes in the JSON layer would only retain the first byte range Express flushes, so the PDF store (`services/render.ts`) is the source of truth for raw bytes.
- **Limiter is route-specific, not router-wide.** Only the two routes that spawn a Chromium process get `invoicingLimiter`; the credit-notes *list* is a plain read and skips it.
- **Path-segment safety.** Invoicing routes use two or three path segments; `orders`' own `/:id` uses one. Neither order of mounting can cause a collision.
