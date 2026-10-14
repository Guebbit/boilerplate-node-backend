---
source: src/modules/invoicing/module.ts
sha256: f88e09d1df3479c85db331a03a43ce89f2d810c7a2d6279a5a56e1846e47542f
generated_at: 2026-10-14T16:07:06.405649+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/module.ts

## Purpose

Module manifest for the invoicing domain (frozen tax invoices and credit notes). It registers the module's routes, event subscriptions, config, rate limits, personal-data collection, and static asset paths with the application kernel. It exists so that invoicing is a self-contained module that **reacts** to facts recorded by `orders` and `payments` rather than being created by route requests.

## Key elements

- **Default export (`AppModule` manifest)** — the single object the kernel reads to wire the module into the app.
  - `name: 'invoicing'`, `basePath: '/orders'` — shares the `/orders` URL prefix with the orders module.
  - `routes` — Hono router from `./routes`.
  - `config` — config slices from `invoicingConfig` and `invoicingProviderProbe`.
  - `rateLimits` — rate-limit rules from `./rate-limits`.
  - `personalData` — a single `collect` hook (`collectPersonalData`); deliberately **no** `erase`.
  - `subscribe()` — registers two event listeners (see below).
  - `locales` / `templates` — filesystem paths for i18n strings and document templates.
- **`subscribe()` listeners**
  - `ORDER_STATUS_CHANGED` (filtered to `to === 'paid'`): re-reads the order via `getById`, then calls `issueInvoice`.
  - `PAYMENT_REFUNDED`: calls `issueCreditNote` with the refund payload.

## Relationships

- **`src/kernel/registry.ts`** — imports the `AppModule` type; the default export `satisfies` it.
- **`src/kernel/events.ts`** — imports `onDomainEvent` used by both `subscribe()` listeners.
- **`src/modules.ts`** — registers this module in the application's module list.
- **`src/modules/orders/index.ts`** — provides `ORDER_STATUS_CHANGED`, `getById`, and `OrderStatus` consumed by the `paid` listener.
- **`src/modules/invoicing/services/index.ts`** — barrel re-exporting `issueInvoice` and `issueCreditNote`.
- **`src/modules/invoicing/services/issue-invoice.ts`** / **`issue-credit-note.ts`** — the two service functions the listeners invoke.
- **`src/modules/invoicing/services/personal-data.ts`** — `collectPersonalData` used in the `personalData` entry.
- **`src/modules/invoicing/routes.ts`** — the Hono router exposed as `routes`.
- **`src/modules/invoicing/config.ts`** — `invoicingConfig` (config slice).
- **`src/modules/invoicing/providers/index.ts`** — `invoicingProviderProbe` (provider probe slice).
- **`src/modules/invoicing/rate-limits.ts`** — `invoicingRateLimits`.
- **`src/modules/invoicing/tests/integration/*.test.ts`** — integration tests that exercise the event-driven invoice / credit-note / re-encryption flows wired here.

## Notes

- **No delete path.** Neither `Invoice` nor `CreditNote` can be deleted, updated, or re-rendered from live config through this module.
- **Event listeners are fire-and-forget.** A failure in `issueInvoice` or `issueCreditNote` is logged by `emitDomainEvent` but never rolls back the triggering write (e.g. an order stays `paid` even if the invoice freeze fails).
- **A missing invoice is possible; a skipped invoice number is not.** The numbering series is owned by this module.
- **`ORDER_STATUS_CHANGED` carries only `{ orderId, from, to }`.** The `paid` listener issues a fresh `getById` read to obtain the full order (lines, address, currency) needed for the freeze.
- **`basePath: '/orders'` is intentional** URL sharing with the orders module (precedent: `account`/`addresses`). See `docs/api/contract-fragmentation.md`.
