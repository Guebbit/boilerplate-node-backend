---
source: src/modules/tickets/domain/routing.ts
sha256: 5ce78eb8b0ef3b701e4a7a9503fa9ae6012634711d97e49b839d902d07b8b6db
generated_at: 2026-10-29T06:02:55.309874+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/domain/routing.ts

## Purpose

Defines the single source of truth for ticket jurisdiction: which permission set is responsible for each ticket kind. It is a pure lookup table so that the rule "a role is a bundle of sets, so routing to a set routes to every role holding it" exists in exactly one place. Admin requires no special case because it holds every set by construction.

## Key elements

- **`TICKET_KINDS`** — frozen array of every `TicketKind` value (contact-form kinds plus system-opened kinds), sourced from `@types`.
- **`ROUTE_SET_OF_KIND`** — internal `Readonly<Record<TicketKind, string>>` mapping each kind to its responsible permission-set name (e.g. `amount_mismatch` → `PaymentRefunding`).
- **`routeSetOf(kind)`** — exported pure function that returns the permission-set string for a given `TicketKind`. Intended to be called once when a ticket opens so the set is frozen onto the ticket record.
- **`ROUTE_SETS`** — deduplicated array of every distinct permission set that appears as a target in the table; useful for enumerating "all sets that matter to tickets" without hardcoding.

## Relationships

- **`src/types/index.ts`** — imports `TicketKind`, the enum this file keys on.
- **`src/modules/tickets/domain/index.ts`** — barrel file that re-exports the public symbols from this module.
- **`src/modules/tickets/model.ts`** — the ticket record stores the routed set (frozen at open time); this file supplies the value to store.
- **`src/modules/tickets/service.ts`** — calls `routeSetOf` when creating/opening a ticket so the jurisdiction is written once.
- **`src/modules/tickets/services/system.ts`** — system-initiated openings (refunds, disputes, holds, etc.) pass their `TicketKind` through `routeSetOf`.
- **`src/modules/tickets/access.ts`** — permission checks compare the ticket's stored set against the caller's role sets; `ROUTE_SETS` is the universe of sets it may encounter.
- **`src/modules/tickets/tests/unit/routing.test.ts`** — unit tests asserting the table is complete and the lookup is pure.
- **`src/modules/notifications/tests/unit/staff-routing.test.ts`** — verifies that notification dispatch respects the same set-to-role bundle rule.
- **`tests/cross-cutting/ticket-kinds-are-not-notification-kinds.test.ts`** — guards against conflating `TicketKind` (used here) with notification-channel enums.

## Notes

- The mapping is **many-to-one**: several kinds (e.g. `manual_refund_owed`, `amount_mismatch`, `refund_refused`, `dispute`) all route to `PaymentRefunding`. `ROUTE_SETS` intentionally collapses them.
- `routeSetOf` will return `undefined` at runtime if called with a value not present in `TicketKind` (TypeScript prevents this at compile time, but a runtime guard is the caller's responsibility).
- Because the table is `Readonly`, extending it means editing the source — there is no runtime registration API.
