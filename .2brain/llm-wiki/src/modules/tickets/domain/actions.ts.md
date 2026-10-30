---
source: src/modules/tickets/domain/actions.ts
sha256: f519c9807b75f411bcf33eb6c91f2464d47bbde859d4c8444c8c64bd374eef15
generated_at: 2026-10-29T06:02:15.128244+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/domain/actions.ts

## Purpose

Pure, server-side decision logic that maps a caller's standing and a ticket's status to the set of actions the caller may perform. It centralizes the "what is this user allowed to do?" rule so no client or other layer re-implements the ticket lifecycle.

## Key elements

- **`ActionFacts`** (interface) — Input shape: the ticket's current `TicketStatus`, the caller's `mayWork` / `mayDelete` booleans, and whether the ticket is `assigned`.
- **`TicketActionFlags`** (interface) — Output shape: the seven wire flags (`resolve`, `markSpam`, `reopen`, `assign`, `unassign`, `note`, `delete`) that travel as `actions` on the API response.
- **`actionsOf`** (function) — Single pure function that takes `ActionFacts` and returns `TicketActionFlags`. Each flag is a conjunction of a permission bit (`mayWork` or `mayDelete`) and a status/assignment guard.

## Relationships

- **`src/modules/tickets/domain/lifecycle.ts`** — Provides `isOpen`, which `actionsOf` uses to gate `reopen`, `assign`, and `unassign`.
- **`src/types/index.ts`** — Source of the `TicketStatus` enum referenced in both interfaces and the flag logic.
- **`src/modules/tickets/domain/index.ts`** — Barrel file for the domain layer; re-exports this module so consumers can import from the domain root.
- **`src/modules/tickets/presenter.ts`** / **`src/modules/tickets/views.ts`** — Downstream consumers that receive `TicketActionFlags` (the `actions` field on the wire) to decide which UI controls to render or which mutations to permit.

## Notes

- The module is intentionally pure and stateless: the service layer is responsible for resolving `mayWork`/`mayDelete` (including the system-ticket route check noted in the JSDoc) and passing the finished `ActionFacts` in. This file never touches auth, DB, or HTTP.
- `note` requires only `mayWork` with no status guard—any non-deleted ticket the caller can work is note-able regardless of resolved/spam/reopen state.
- `delete` is the only flag driven by `mayDelete` rather than `mayWork`; it is not constrained by status or assignment.
