---
source: src/modules/tickets/presenter.ts
sha256: 4741d286f41a663b38ca21a303cc4e9f6715904e9578342126862755dc3acc82
generated_at: 2026-10-29T06:04:20.638888+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/presenter.ts

## Purpose

Single presentation layer that turns a stored `TicketDocument` into the wire shape declared by `openapi.yaml`: the stored fields plus per-reader computed values (`overdue`, `actions`, `assigneeName`, `earlierTickets`). Every code path that serializes a ticket for a response funnels through this module so the shape is defined once.

## Key elements

- **`StoredTicket`** (type) — `Ticket` minus the four per-reader fields; represents the ticket as persisted and read back.
- **`TicketView`** (interface) — the per-reader additions: `actions` (a `TicketActionFlags`), optional `assigneeName`, optional `earlierTickets`.
- **`NO_ACTIONS`** (const) — a `TicketView` with every action flag `false`; used for the visitor-facing 201 where the reader can do nothing.
- **`storedTicketOf(document)`** — calls `document.toJSON()` (which maps `_id → id`, serialises dates to ISO strings, strips the dedup key) and casts the result to `StoredTicket`.
- **`withView(stored, view, now?)`** — spreads `stored`, computes `overdue` at read time (open + `dueAt` in the past), and conditionally attaches `assigneeName` / `earlierTickets`. Returns a full `Ticket`.
- **`presentTicket(document, view)`** — convenience composition: `storedTicketOf` → `withView`.

## Relationships

- **`src/modules/tickets/model.ts`** — source of `TicketDocument`; its `toJSON()` output is the input to `storedTicketOf`.
- **`src/modules/tickets/domain/index.ts`** / **`domain/actions.ts`** / **`domain/lifecycle.ts`** — provide `TicketActionFlags` (shape of the `actions` bag) and `isOpen` (used for the `overdue` check).
- **`src/types/index.ts`** — defines the wire `Ticket` and `TicketRef` types that this module assembles and references.
- **`src/modules/tickets/views.ts`** / **`services/workflow.ts`** — upstream builders of the `TicketView` argument (they compute which flags are `true`, resolve `assigneeName`, collect `earlierTickets`).
- **`src/modules/tickets/controllers/post-ticket.ts`** — consumer; uses `NO_ACTIONS` for the 201 body.
- **`src/modules/tickets/repository.ts`** / **`service.ts`** — upstream fetch/orchestration; they produce the `TicketDocument` and pair it with a `TicketView` before calling `presentTicket`.

## Notes

- `overdue` is **not** a stored field; it is re-derived on every read from `status` + `dueAt` + the current clock. No sweep/cron keeps it in sync.
- `storedTicketOf` relies on a single `as StoredTicket` cast after `toJSON()`. If the Mongoose schema changes (new virtuals, renamed fields), the cast will not fail at compile time.
- `assigneeName` and `earlierTickets` are omitted from the JSON entirely (not set to `null`/`[]`) when absent, via conditional spread. Consumers should treat them as optional.
- The default clock parameter (`now = new Date()`) in `withView` exists for deterministic tests; `presentTicket` does not forward it, so tests should call `withView` directly or mock `Date`.
