---
source: src/modules/tickets/repository.ts
sha256: f0aec25446e03f46f4962b6683a8d55191201e506840a7f9e2f8aa0db9aeeb9a
generated_at: 2026-10-29T06:04:55.733591+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/repository.ts

## Purpose

Ticket repository that layers domain-specific operations (atomic status transitions, assignment changes, system-ticket dedup, and GDPR erasure writes) on top of the shared CRUD repository factory. It exists so the service layer never touches Mongoose directly and so concurrent status changes are guarded at the query level.

## Key elements

- **`ticketRepository`** (exported const) — the concrete `TicketRepository` instance; spreads `base` (standard CRUD) and adds all domain methods.
- **`TicketRepository`** (exported interface) — extends `Repository<TicketDocument, StoredTicket>` with 14 domain methods: `moveFrom`, `assign`, `unassign`, `appendNote`, `sawEvent`, `insertSystem`, `touchOpen`, `findOpenSystem`, `findOpenByKey`, `deleteOwned`, `deleteSystemAbout`, `detachSubject`, `forgetStaff`.
- **`NewSystemTicket`** (exported interface) — the shape a caller must supply when opening a system ticket.
- **`base`** — result of `createRepository(ticketModel, {…})`; provides `create`, `findById`, `findAll`, `update`, `delete`, `count`, `search` with the configured `transform`, `objectIds`, `regex`, `text`, and `sortable` mappings.
- **`REMEMBERED_EVENTS`** (const, 20) — cap on how many system-event IDs are kept per ticket.
- **`LINKS_THAT_GO_WITH_THE_PERSON`** (const) — `TicketLinkType.user` and `TicketLinkType.export`; decides whether a system ticket is *deleted* or *detached* during erasure.

## Relationships

- **`@infrastructure/persistence/create-repository`** — supplies `createRepository`, `toObjectId`, and the base `Repository` type that `TicketRepository` extends.
- **`./model`** — provides `ticketModel` (the Mongoose model used for every raw query) and `applyTicketTransform` (maps DB docs → `StoredTicket`). Also exports the `TicketDocument` / `TicketNoteDocument` types used in signatures.
- **`./presenter`** — `StoredTicket` is the output type for all standard CRUD reads.
- **`./domain`** (index) — imports `OwnTicketsFilter` and `TicketPatch`; the latter is composed of `set`/`unset` fragments that `moveFrom` applies.
- **`./service.ts`** — the primary consumer; orchestrates which repository method to call and in what order.
- **`./services/system.ts` / `./services/workflow.ts`** — sub-services that call `insertSystem`, `touchOpen`, `sawEvent`, `findOpenSystem`, `findOpenByKey` for the system-ticket lifecycle.
- **Tests** (`tests/factories.ts`, `tests/integration/*.test.ts`) — construct `NewSystemTicket` fixtures and assert the repository's dedup, erasure, and transition behaviour.

## Notes

- **Optimistic concurrency on moves.** `moveFrom` filters `findOneAndUpdate` on the status the caller read (`from`). If another request already changed it, the query matches zero rows and the method resolves to `null` — no lock, no retry.
- **`assign` is a two-step fallback, not atomic.** First it tries `new → in_progress` (with assignee). If that returns `null` it retries on `in_progress → in_progress` (reassignment). A ticket in any other status stays untouched.
- **`unassign` is two sequential writes** (status transition, then `$unset assigneeId`). There is no single atomic operation; a crash between the two leaves the ticket `new` but still carrying a stale `assigneeId` until the second write lands.
- **`insertSystem` dedup relies on a unique index** on `openKey` (presumably partial, covering only open tickets). A duplicate insert throws a Mongoose duplicate-key error; the caller is expected to catch it.
- **`touchOpen` caps event history** with `$push` + `$each` + `$slice: -20`. The `eventId` guard (`$ne`) prevents counting the same redelivery twice.
- **All erasure methods accept a `ClientSession`** so the caller can wrap them in a single Mongo transaction. They are not transactional on their own.
- **`forgetStaff` uses `arrayFilters`** (`notes.$[note].authorId`) to unset the author on individual note elements rather than removing the note itself.
- **Search deliberately excludes enum fields** (`status`, `category`, `kind`, `source`). The service is responsible for translating user-facing filters into a concrete `TicketStatus` / `TicketKind` value before calling `base.search` or `base.findAll`.
