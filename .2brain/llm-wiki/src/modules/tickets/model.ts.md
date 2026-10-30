---
source: src/modules/tickets/model.ts
sha256: 323501a312e097d78c5a2cb5dab513e0eafd30db7c52106233d3555afab0cd6e
generated_at: 2026-10-29T06:03:53.292080+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/model.ts

## Purpose

Defines the Mongoose schema, document types, indexes, and serialization transform for the single **tickets** collection. It bridges the API-generated `Ticket` wire type (strings, ISO dates) and what Mongoose stores natively (ObjectId, Date), and exposes a ready-to-use model plus a transform that normalizes documents back to the wire shape.

## Key elements

- **`TicketNoteDocument`** – Append-only staff note shape: `authorId?`, `body`, `at`.
- **`TicketDocument`** – Mongoose document interface. Extends `Omit<Ticket, …>` so date fields are `Date` (not `string`), ObjectId refs are `Types.ObjectId` (not `string`), and computed/transient fields (`overdue`, `actions`, `earlierTickets`, `assigneeName`) are excluded. Adds `openKey`, `eventIds`, and `notes`.
- **`TicketModel`** – `Model<TicketDocument>` alias.
- **`ticketSchema`** – The full Mongoose `Schema` with all fields, enums, defaults, and seven indexes (see Notes). `routeSet` defaults via `routeSetOf(TicketKind.contact)`.
- **`applyTicketTransform`** – Built with `applySerialization`; on serialize it converts `Date → ISO string`, `ObjectId → string`, normalizes `notes[]`, and omits `openKey` / `eventIds` from the output. Exported so lean queries (which skip `toJSON`) can reuse the same mapping.
- **`ticketModel`** – `model('Ticket', ticketSchema)`; the single entry point for all ticket persistence.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — Provides `applySerialization`, the helper that `applyTicketTransform` is built from.
- **`src/modules/tickets/config.ts`** — `ticketsConfig().NODE_TICKETS_RETENTION_DAYS` is read at import time to set the TTL index's `expireAfterSeconds`.
- **`src/modules/tickets/domain/index.ts`** — Exports `routeSetOf`, used as the schema default for `routeSet`.
- **`src/types/index.ts`** — Source of the `Ticket` type and all enum values (`TicketSource`, `TicketStatus`, `TicketKind`, etc.) that the schema enumerates.
- **`src/modules/tickets/service.ts`** — Calls `applyTicketTransform` on lean results (e.g. in `search()`) and uses `ticketModel` for CRUD.
- **`src/modules/tickets/repository.ts`**, **`presenter.ts`**, **`services/workflow.ts`** — Consume `ticketModel`, `TicketDocument`, and the domain enums defined or re-exported here.
- **`src/modules/tickets/tests/unit/schema-contract.test.ts`** — Asserts the schema's field/enum/index contract.
- **`src/modules/tickets/tests/integration/workflow.test.ts`**, **`system-sources.test.ts`** — Exercise the model through workflow and system-source flows.
- **`src/modules/tickets/tests/factories.ts`** — Produces `TicketDocument`-shaped fixtures for tests.
- **`tests/integration/erasure.test.ts`** — Verifies that erasure queries match on `subjectId` / `email` (the two partial indexes exist to serve those lookups).

## Notes

- **TTL index boot caveat:** Mongo will not alter an existing TTL index's `expireAfterSeconds` in place. Changing `NODE_TICKETS_RETENTION_DAYS` and restarting with `autoIndex` enabled will **fail the boot**. Run `npm run db:sync` to drop and rebuild the index. The same caveat applies to `audit-logs/model.ts`.
- **`openKey` unique index is partial** (`$exists: true`), so visitor tickets and closed tickets are unconstrained. The E11000 path is the dedup mechanism for racing system events.
- **`routeSet` default** is a function call to `routeSetOf`, not a literal string; it is evaluated per-document at insert time.
- **Serialization omits `openKey` and `eventIds`** entirely — they are internal dedup bookkeeping, not part of the wire contract.
- **`seenCount`** is a schema field but is *not* part of the generated `Ticket` type; it tracks how many times a linked event touched the ticket.
