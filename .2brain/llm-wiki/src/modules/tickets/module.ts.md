---
source: src/modules/tickets/module.ts
sha256: b56fdbaaf5766691371039e2b949392b55affc51b522c42696b6b9c65ac14cb0
generated_at: 2026-10-29T06:04:07.321094+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/module.ts

## Purpose

Module manifest for the **tickets** feature (contact requests + system-generated tickets). It wires together the module's routes, config, rate limits, personal-data hooks, and event subscriptions into a single `AppModule` export that the kernel registry loads and mounts.

## Key elements

- **`export default { … } satisfies AppModule`** — the sole export. A manifest object containing:
  - **`name`** — `'tickets'`, the module identifier.
  - **`mounts`** — mounts `router` (from `./routes`) at base path `/tickets`.
  - **`config`** — registers `ticketsConfig` (from `./config`) with the `.slice` helper.
  - **`rateLimits`** — contact-form submission budgets from `./rate-limits`.
  - **`personalData`** — two sections:
    - `tickets`: `collect` → `ticketService.findOwnTicketsForExport`; `erase` → `ticketService.eraseOwnTickets` (runs inside the hard-delete transaction only).
    - `systemTickets`: `collect` → `ticketService.findSystemTicketsForExport` (staff IDs withheld; erased by the first section's `erase` hook, which owns the whole collection).
  - **`subscribe()`** — registers 16 `onDomainEvent` handlers that map cross-module events to `systemTickets.*` methods (see Relationships).
  - **`locales` / `templates`** — filesystem paths for i18n and email/template assets.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/registry.ts` | Consumes the `AppModule` type to shape the default export. |
| `src/kernel/events.ts` | Calls `onDomainEvent` (inside `subscribe()`) to wire every cross-module event to a `systemTickets` handler. |
| `src/modules/account/index.ts` | Imports `ACCOUNT_EXPORT_FAILED` / `ACCOUNT_EXPORT_READY` event constants; both trigger `systemTickets.onExportFailed` / `onExportReady`. |
| `src/modules/delivery/index.ts` | Imports `SHIPMENT_SHIPPED`, `FULFILLMENT_ORDER_CANCELLED`, `FULFILLMENT_ORDER_DELAYED`; each opens/closes a system ticket via `systemTickets`. |
| `src/modules/inventory/index.ts` | Imports `HOLD_ORPHANED`; triggers `systemTickets.onHoldOrphaned`. |
| `src/modules/orders/index.ts` | Imports `ORDER_CANCELLED`; triggers `systemTickets.onOrderCancelled`. |
| `src/modules/payments/index.ts` | Imports 7 payment events (`REFUNDED`, `REFUND_FAILED`, `REFUND_CANCELED`, `REFUND_OWED_BY_HAND`, `AMOUNT_MISMATCH`, `DISPUTE_OPENED`, `DISPUTE_UPDATED`); each maps to a `systemTickets` handler. |
| `src/modules/users` (implicit) | Imports `USER_REVIEW_FLAGGED` / `USER_REVIEW_CLEARED`; triggers `systemTickets.onReviewFlagged` / `onReviewCleared`. |
| `src/modules.ts` | Registers this default export as a top-level application module. |
| `src/modules/tickets/routes.ts` | Provides the `router` instance mounted at `/tickets`. |
| `src/modules/tickets/service.ts` | Provides `ticketService`, used by the `personalData` collect/erase hooks. |
| `src/modules/tickets/services/system.ts` | Provides `systemTickets`, the handler object all event subscriptions dispatch to. |
| `src/modules/tickets/config.ts` | Provides `ticketsConfig` registered in the manifest. |
| `src/modules/tickets/rate-limits.ts` | Provides `ticketsRateLimits` for contact-form throttling. |
| `src/modules/tickets/tests/integration/export.test.ts` | Exercises the `personalData.tickets.collect` / `erase` paths. |
| `src/modules/tickets/tests/integration/ownership.test.ts` | Exercises the ownership/export-erase contract referenced in the module doc comment. |

## Notes

- `personalData.tickets.erase` is explicitly scoped to run **inside the hard-delete transaction only** — never at the reversible (soft-delete) lock. The comment in the code makes this a hard contract.
- The `systemTickets` section has **no `erase` hook** of its own; the first section's `erase` owns the entire collection. Adding a separate erase here would be a bug.
- `collect` is documented as always returning an array because the personal-data contract requires the section to be present even when empty.
- `subscribe()` is a method on the manifest, not a top-level call — the kernel invokes it during module boot.
- The module doc comment references `./domain/ownership` for the export/erasure semantics; that file is not imported here but is the normative source for what "erase" means.
