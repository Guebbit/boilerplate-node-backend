---
source: src/modules/tickets/tests/integration/workflow.test.ts
sha256: 94557e1d13184caaca8b40e6756b4dae7b921c42e6a7dc8ff4bf863e627a3421
generated_at: 2026-10-29T06:08:35.572232+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/integration/workflow.test.ts

## Purpose

Integration test that exercises every ticket "move" through the real service + repository stack (against a test database): resolve, markSpam, reopen, assign, unassign, and note. It verifies the side-effect stamps each move owes (`closedAt`, `resolution`, `respondedAt`, the dedup `openKey`), the 409 guard on every repeat, the reopen-supersede collision, jurisdiction (route-set) enforcement, and the audit row each move writes.

## Key elements

- **`admin` / `support`** — Two caller contexts built with `callerContextAs`. Admin holds every route-set; support holds contact-message sets but *not* `PaymentRefunding`.
- **`fileContact()`** — Creates a visitor contact-message ticket via `ticketService.create`, the standard fixture for most tests.
- **`openRefundTicket(link?)`** — Creates a system ticket (`TicketKind.manual_refund_owed`, route-set `PaymentRefunding`) directly through `ticketRepository.create`, simulating the system filing one.
- **`stored(id)` / `storedField(id, key)`** — Read-back helpers that fetch the persisted ticket (or a single field) from the repository.
- **`describe('resolve')`** — Verifies status→resolved, `closedAt`/`respondedAt` stamps, dedup-key release, 409 on repeat, spam→resolve transition, concurrent-click safety, and 404 for missing id.
- **`describe('markSpam')`** — Verifies spam stamp, `respondedAt` preservation, and 409 `TICKET_ALREADY_SPAM`.
- **`describe('reopen')`** — Verifies status→new or in_progress, retention-clock clearing, dedup-key restoration, 409 `TICKET_ALREADY_OPEN`, and 409 `TICKET_SUPERSEDED` (naming the newer ticket).
- **`describe('jurisdiction')`** — Verifies that a caller outside a ticket's route-set gets 404 on read *and* write, that system tickets are hidden from `search` results for out-of-set callers, and that support *can* work a contact-message ticket.
- **`describe('assign and unassign')`** — Verifies status→in_progress, assignee stamping, 422 for invalid/out-of-set/missing assignee, 409 on closed tickets, and the unassign round-trip.

## Relationships

- **`src/modules/tickets/service.ts`** — The system under test; every assertion targets a `ticketService` method.
- **`src/modules/tickets/repository.ts`** — Used both to *create* system tickets (`openRefundTicket`) and to *read back* persisted state (`stored`).
- **`src/modules/tickets/model.ts`** — `TicketDocument` type constrains the generic in `storedField`.
- **`src/modules/tickets/audit.ts`** — `ticketsAuditActions` imported (likely used in audit-row assertions in the truncated portion).
- **`src/infrastructure/observability/audit.ts`** — Fully replaced via `jest.mock` with `auditPortMock()` from the test-support ports module; never called for real.
- **`src/modules/users/tests/factories.ts`** — `createUser` creates support-role users used as assignees.
- **`src/types/index.ts`** — `TicketKind`, `TicketLinkType`, `TicketSource`, `TicketStatus` enums used in fixtures and assertions.
- **`tests/support/callers.ts`** — `callerContextAs` builds the admin/support caller objects.
- **`tests/support/ports.ts`** — `observePort` / `auditPortMock` provide the port-replacement mechanism.
- **`tests/support/response.ts`** — `asSuccess` / `asReject` unwrap the service's discriminated-union results for assertions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` provisions the in-memory/test database before each run.

## Notes

- The audit port is **replaced**, not spied on. The `jest.mock` call swaps the entire module with `auditPortMock()`, so any code path that touches `@infrastructure/observability/audit` hits the fake. `observePort` (from the same support file) is the companion for reading recorded calls.
- `jest.restoreAllMocks()` runs in `afterEach`; any `jest.spyOn` added mid-test is cleaned up automatically.
- The concurrent-click test (`Promise.all` on two `resolve` calls) relies on the service's atomic guard, not on test isolation — only one call may succeed.
- Jurisdiction tests assert that the ticket's *stored* status is unchanged after a 404, confirming the service rejects before any mutation.
