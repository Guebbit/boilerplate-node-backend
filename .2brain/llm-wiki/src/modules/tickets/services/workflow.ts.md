---
source: src/modules/tickets/services/workflow.ts
sha256: e259eb8c434114d81bab2f9811300beac0cf96594b51e3aea0b7507853dc1f46
generated_at: 2026-10-29T06:06:13.224669+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/services/workflow.ts

## Purpose

The write path for every ticket state transition (resolve, mark-spam, reopen, assign, unassign, add-note). It applies the domain's transition rules as a single conditional (status-filtered) database write so that concurrent clicks yield one 200 and one 409, records an audit entry on success, and emits domain events where needed. All business rules live in `../domain`; this file is the authorization, concurrency, and I/O layer around them.

## Key elements

- **`DOORS`** — Maps each status door (`resolve`, `markSpam`, `reopen`) to its domain rule function and the corresponding `ticketsAuditActions` key.
- **`REFUSALS`** — Maps each `TicketRefusal` to its HTTP 409 `ErrorCode` and i18n message key.
- **`factsOf(ticket)`** — Projects a `TicketDocument` into the `TicketFacts` shape the domain rules expect.
- **`loadWorkable(id, context)`** — Loads a ticket and enforces jurisdiction (404) and action permission (403) before any mutation.
- **`move(door, id, context, attempts)`** — Core conditional-write loop: applies the door's rule, calls `ticketRepository.moveFrom` (filtered on the read status), retries up to 3 times on a lost race, and on final failure returns a 409. On success, records audit and returns the presented ticket.
- **`superseded(ticket)`** — For reopen: checks whether a newer open ticket already exists on the same dedup key and returns a 409 with the newer ticket's id.
- **`assign(id, userId, context)`** — Validates the target user (exists, not deleted, holds the ticket's route-set permission), performs the assignment write, records audit, and emits `TICKET_ASSIGNED` (skipped for self-assignment).
- **`unassign(id, context)`** — Releases the assignee; `in_progress` reverts to `new`.
- **`addNote(id, body, context)`** — Appends a staff note; allowed even on closed tickets. Author is omitted when the caller is an API key (no valid ObjectId).
- **`mayBeAssigned(userId, routeSet)`** — Checks the user exists, is live, and that their tenant roles hold the required route set.
- **`present(ticket, context)`** — Resolves the assignee's display name and delegates to `presentTicket` for wire-format output.
- **`isDuplicateKey(error)`** — Detects Mongo E11000 (used only in the reopen path).

## Relationships

- **`@infrastructure/http/response`** — All responses are built via `generateSuccess` / `generateReject`.
- **`@infrastructure/i18n`** — Every user-facing message string goes through `t()`.
- **`@infrastructure/observability/audit`** — `recordAudit` is called after every successful mutation (status change, assign, unassign).
- **`@kernel/events`** — `emitDomainEvent` fires `TICKET_ASSIGNED` when another user is assigned.
- **`@kernel/access/tenant`** — `DEPLOYMENT_TENANT_ID` scopes the access-service query and the emitted event.
- **`@modules/access`** — `accessService.rolesOf` is called to verify the proposed assignee's permission set.
- **`../domain`** — `resolve`, `markSpam`, `reopen`, `isOpen` provide the pure transition rules and refusal types.
- **`../access`** — `inJurisdiction`, `mayWork`, `roleHoldsRouteSet` gate every load and assignment.
- **`../audit`** — `ticketsAuditActions` supplies the stable action identifiers logged.
- **`../repository`** — `ticketRepository` performs all reads (`findById`, `findOpenByKey`) and conditional writes (`moveFrom`, `assign`, `unassign`).
- **`../presenter` / `../views`** — `presentTicket`, `assigneeNamesOf`, `viewerOf` shape the API response.
- **`@infrastructure/persistence/create-repository`** — `toObjectId` converts the caller string to an ObjectId for the note author.

## Notes

- **Conditional-write concurrency:** `ticketRepository.moveFrom(id, ticket.status, patch)` includes the *read* status in its query filter. A concurrent change makes the write a no-op (returns falsy), which triggers the retry loop in `move` (max 3 attempts). This is the only mechanism preventing double-click races.
- **Reopen dedup guard:** If the reopen write hits a Mongo duplicate-key error (E11000) on the dedup index, the file catches it and returns a 409 `TICKET_SUPERSEDED` with the newer ticket's id in `details`.
- **Self-assign is silent:** Assigning a ticket to yourself does **not** emit `TICKET_ASSIGNED`; the event is only for notifying a colleague.
- **404 ≠ 403:** A ticket outside the caller's jurisdiction is indistinguishable from a missing one (404) to avoid leaking existence. A ticket inside the jurisdiction that the caller lacks permission to act on is a 403.
- **`addNote` on closed tickets is intentional** — post-resolution staff learning is still recorded.
- The file content provided is truncated; the staff-badges counts endpoint referenced in the module docstring is not visible here.
