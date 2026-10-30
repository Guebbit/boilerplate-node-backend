---
source: src/modules/tickets/events.ts
sha256: 839e108d68a28ff95584d3fc3fd96c046e2c99e06e89d17646c26e1a94547247
generated_at: 2026-10-29T06:03:28.424001+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/events.ts

## Purpose

Defines the two domain events emitted by the tickets module (`ticket.opened`, `ticket.assigned`) by augmenting the kernel's `DomainEventMap` interface. These are purely internal events—no AsyncAPI channel or webhook carries them—and exist so that the `notifications` module can translate them into staff work notices without the producer and the event bus both alerting the same person.

## Key elements

- **`declare module '@kernel/events'`** — extends `DomainEventMap` with the two ticket-specific payload types, following the same augmentation pattern as `modules/orders/events.ts`.
- **`'ticket.opened'` payload** — emitted when a ticket is inserted (deduplicated, not spam). Carries only closed codes/ids (`tenantId`, `ticketId`, `kind`, `routeSet`) plus an optional `category`. Deliberately excludes visitor text because the outbox persists the bus payload.
- **`'ticket.assigned'` payload** — emitted when a ticket is handed to a colleague (self-assignment does *not* emit). Includes `assigneeId` and an ISO `assignedAt` timestamp to distinguish repeated hand-offs.
- **`TICKET_OPENED`** — string constant `'ticket.opened'` for use as a discriminant at emit/subscribe sites.
- **`TICKET_ASSIGNED`** — string constant `'ticket.assigned'` for the same purpose.

## Relationships

- **`service.ts` / `services/system.ts` / `services/workflow.ts`** — the producers that emit `ticket.opened` (ticket creation, system-source ingestion) and `ticket.assigned` (reassignment via workflow) by calling the kernel event bus with these payloads.
- **`index.ts`** — module barrel; consumers import the `TICKET_*` constants from the module root rather than reaching into `events.ts` directly.
- **`tests/integration/service.test.ts`** and **`tests/integration/system-sources.test.ts`** — assert that the expected events fire (and *don't* fire, e.g. on self-assignment) with the correct payload shape.
- **`notifications` module** (not in this file's neighbor list but named in the header comment) — the sole subscriber that converts these events into staff work notices, ensuring a single alert per ticket action.

## Notes

- `routeSet` is the permission set whose members are the audience for the event; it is not a list of user IDs.
- The "no visitor text" constraint on `ticket.opened` is intentional: the outbox persists bus payloads, so free-text must not travel on the event.
- Self-assignment (re-claiming your own ticket) is explicitly excluded from `ticket.assigned`; tests cover this.
- Follow the augmentation pattern (not a central event registry) when adding new ticket events; the rationale is documented by reference to `modules/orders/events.ts`.
