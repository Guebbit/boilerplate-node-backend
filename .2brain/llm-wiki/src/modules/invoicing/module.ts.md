---
source: src/modules/invoicing/module.ts
sha256: f8b4651657cb17734cc946e961f21db544ab7d819b5e19c500bac6a3f59695db
generated_at: 2026-10-29T04:12:29.994262+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/module.ts

## Purpose

Module manifest (entry point) for the invoicing domain. Wires together routes, event subscriptions, background jobs, config, rate limits, personal-data hooks, and locale/template paths into a single `AppModule` object that the kernel registry mounts. The two domain-event listeners registered here are the **only** code paths that create `Invoice` or `CreditNote` records — no HTTP route can request one.

## Key elements

- **Default export (`AppModule`)** — the manifest: `name`, `mounts`, `jobs`, `config`, `rateLimits`, `reencrypt`, `personalData`, `subscribe`, `locales`, `templates`.
- **`subscribe()` closure** — registers two `onDomainEvent` handlers:
  - `ORDER_STATUS_CHANGED` (filtered to `to === OrderStatus.paid`): re-reads the full order via `orderService.getById`, calls `invoicingService.issueInvoice`, then runs `creditSettledRefunds` as a catch-up for refunds that settled before the invoice existed.
  - `PAYMENT_REFUNDED`: calls `issueCreditNote` with the refund details.
- **`mounts`** — registers `router` from `./routes` at `basePath: '/orders'` (shares the `/orders` prefix with the orders module).
- **`reencrypt`** — points to `invoicingService.reencryptInvoices`; the buyer address block on each document is PII-encrypted and can be re-keyed.
- **`personalData`** — a single `collect` section calling `collectPersonalData`; deliberately **no `erase`** (invoices are immutable frozen records).
- **`config`** — exposes `invoicingConfig.slice` and `invoicingProviderProbe.slice` to the kernel's config aggregator.

## Relationships

- **`src/kernel/registry.ts`** — imports the `AppModule` type; this file's export is registered as the `invoicing` entry.
- **`src/kernel/events.ts`** — provides `onDomainEvent`, the subscription primitive used in `subscribe()`.
- **`src/modules.ts`** — the top-level module barrel that (re-)exports this file so the kernel can discover and mount the module.
- **`src/modules/invoicing/config.ts`** — source of `invoicingConfig` (slice exposed to kernel).
- **`src/modules/invoicing/jobs.ts`** — source of `invoicingJobs` (e.g. `reap:invoices`).
- **`src/modules/invoicing/providers/index.ts`** — source of `invoicingProviderProbe` (provider health slice).
- **`src/modules/invoicing/rate-limits.ts`** — source of `invoicingRateLimits`.
- **`src/modules/invoicing/routes.ts`** — the Express/Fastify router mounted under `/orders`.
- **`src/modules/invoicing/services/index.ts`** — `invoicingService` (`issueInvoice`, `reencryptInvoices`).
- **`src/modules/invoicing/services/issue-credit-note.ts`** — `issueCreditNote` and `creditSettledRefunds` (catch-up).
- **`src/modules/invoicing/services/personal-data.ts`** — `collectPersonalData` for GDPR/data-export collection.
- **`src/modules/invoicing/tests/integration/*`** — integration tests exercise the event→issue→credit flow end-to-end through this manifest.

## Notes

- **Shared URL prefix:** this module mounts at `/orders`, the same base path as the orders module. This is intentional (documented precedent: `account`/`addresses`) and relies on route-level path separation, not on distinct base paths.
- **Frozen documents:** neither an invoice nor a credit note is ever deleted, updated, or re-rendered from live config. The only post-issue write is `reap:invoices` blanking the buyer block.
- **Listener failure semantics:** if `issueInvoice` throws, the error is logged by `emitDomainEvent`; the order's `paid` transition is **not** rolled back. A missing invoice is a possible state; a skipped invoice number is not.
- **Fresh read, not event payload:** the `ORDER_STATUS_CHANGED` handler re-fetches the order (`orderService.getById`) because the event carries only `{ orderId, from, to }`, while the invoice freeze needs full lines, address, and currency.
- **`creditSettledRefunds` catch-up:** if a refund settled while the invoice event was dead (e.g. subscriber down), the original credit note was skipped; once the invoice is (re-)issued, `creditSettledRefunds` revives the missing notes.
- **No `erase` in `personalData`:** by design — frozen tax documents cannot be destroyed on data-subject request. See `services/personal-data.ts` docblock for the legal rationale.
