---
source: src/modules/tickets/tests/integration/system-sources.test.ts
sha256: 58aa63ea8330fe7e54e0c09694e3673b29cd80f2517677b2a616e27c67a18029
generated_at: 2026-10-29T06:08:18.663938+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/integration/system-sources.test.ts

## Purpose

Integration test that drives the **real registered ticket modules** with domain events (the same `emitDomainEvent` path production uses, including an outbox-style `eventId`) to verify: which events open a system ticket and with the correct kind/jurisdiction, which events close one as *cleared*, deadline derivation, and that non-qualifying events open nothing. The module docstring also references dedup, redelivery no-op, racing-event, and staff-closes-first scenarios (in the truncated tail).

## Key elements

- **`describe('what opens a ticket')`** — `it.each` table mapping 8 event names → expected `TicketKind` + `routeSet`; plus targeted deadline tests (dispute uses `evidenceDueBy`; consent reminder uses `agreedAt + 30 d`). A second `it.each` lists events that must **not** open a ticket.
- **`describe('what closes a ticket')`** — `it.each` table: open-then-close pairs; asserts `resolved` / `cleared` / `closedAt` set and `openKey` freed. A mismatch case asserts `payment.amount_mismatch` is *not* closed by a later `payment.refunded`.
- **`nextEventId()`** — increments a module-level counter to produce unique `event-N` ids, simulating the outbox relay stamp.
- **Query helpers** — `allTickets`, `onlyTicket`, `dueAtOnly`, `statusOnly`, `eventIdsOnly`: thin wrappers over `ticketModel.find()` that assert single-ticket state.
- **`watchOpened()`** — subscribes a spy to `TICKET_OPENED` via `onDomainEvent`.
- **Fixtures** — `REFUND`, `DISPUTE`, `DELAY` payloads typed against `DomainEventMap`; `USER` / `PAYMENT` are random `ObjectId` strings.
- **Mailer mock** — `enqueueEmail` is replaced with `jest.fn()`; the test asserts the queue is told, not actual mail.
- **`beforeEach` / `afterEach`** — reset mailer spy, set `NODE_CONTACT_NOTIFY_EMAIL`, reset event subscriptions, re-register `enabledModules`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/events.ts` | Imports `emitDomainEvent`, `onDomainEvent`, `resetDomainEvents`, `DomainEventMap`. The event bus is the primary mechanism under test. |
| `src/kernel/registry.ts` | `registerModules(enabledModules)` wires the real module handlers each test. |
| `src/modules.ts` | Provides `enabledModules` array for registration. |
| `src/modules/tickets/model.ts` | `ticketModel` is used to read tickets back from the in-memory DB. |
| `src/modules/tickets/repository.ts` | Imported (available to the handler under test); the test itself queries via `ticketModel`. |
| `src/modules/tickets/events.ts` | `TICKET_OPENED` constant used by `watchOpened()`. |
| `src/infrastructure/adapters/mailer.ts` | Fully mocked; `enqueueEmail` is asserted as "staff were notified." |
| `src/types/index.ts` | `TicketKind`, `TicketStatus`, `TicketResolution` enums used in assertions. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` provisions an in-memory Mongoose instance. |
| `tests/support/environment.ts` | `setEnvironment` injects `NODE_CONTACT_NOTIFY_EMAIL` before each test. |

## Notes

- The file is **truncated** in this snapshot; the docstring promises dedup, redelivery-no-op, racing-event, and staff-closes-first test blocks that are not visible here.
- `eventCounter` is **module-level** and never reset; it only needs uniqueness, not a fixed value.
- The test imports `ticketRepository` but never calls it directly — it is present so the *handler* (registered via `registerModules`) can use it. The test's own assertions go through `ticketModel` (Mongoose) to read raw storage state.
- `jest.mock` for the mailer is at module scope (hoisted); the mock function is captured in `mockEnqueueEmail` for per-test reset.
- Deadline assertions use exact `Date` equality (`.toEqual`), not "is a Date" — the precise instant matters.
