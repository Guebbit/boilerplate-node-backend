---
source: src/modules/tickets/domain/lifecycle.ts
sha256: 17255d117cd9bdd8a3975df8ba94ff80d7f08fcb324f5d9eee60d623ce70710d
generated_at: 2026-10-29T06:02:37.618237+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/domain/lifecycle.ts

## Purpose

Pure-function transition logic for ticket status. Each exported "door" takes a ticket's current facts and returns either a concrete patch (fields to set/unset) or a typed refusal. This file contains no I/O, no side effects, and no framework imports beyond `TicketStatus`—it exists so that the rules for how a ticket moves between `new`, `in_progress`, `resolved`, and `spam` are testable in isolation and shared by every caller.

## Key elements

- **`TicketFacts`** — minimal shape of the ticket state a transition reads (status, closedAt, respondedAt, assigned, openKey, kind, link).
- **`TicketPatch`** — the output shape: `{ set: Record<string, unknown>, unset: string[] }`.
- **`Transition`** — discriminated union: `{ patch: TicketPatch }` | `{ refusal: TicketRefusal }`.
- **`TicketRefusal`** — `'already_resolved' | 'already_spam' | 'already_open'`.
- **`OPEN_STATUSES` / `isOpen`** — constant array and helper identifying statuses that still owe work (`new`, `in_progress`).
- **`openKeyOf(kind, link)`** — builds the dedup key string (`kind:type:id`) used to prevent duplicate open system tickets.
- **`initialTicketStatus(suspectedSpam)`** — returns `spam` (closed at birth) or `new`.
- **`resolve(ticket, now)`** — transitions to `resolved`; keeps existing `closedAt` (spam→resolved case), stamps `respondedAt` once, unsets `openKey`.
- **`markSpam(ticket, now)`** — transitions to `spam`; same `closedAt` logic, no `respondedAt`, unsets `openKey`.
- **`reopen(ticket)`** — transitions back to `new` or `in_progress` (based on `assigned`); unsets `closedAt`/`resolution`; restores `openKey` if a `link` exists.
- **`clear(now)`** — system-initiated close to `resolved` with `resolution: 'cleared'`; returns a bare `TicketPatch` (no refusal path) because the caller guarantees the ticket is still open.

## Relationships

- **`src/types/index.ts`** — provides the `TicketStatus` enum used throughout.
- **`src/modules/tickets/domain/index.ts`** — barrel re-export; consumers import lifecycle symbols via the domain index.
- **`src/modules/tickets/domain/actions.ts`** — defines the action/domain-event layer that invokes these transitions and interprets their `Transition` results.
- **`src/modules/tickets/services/workflow.ts`** — orchestration layer that calls `resolve`, `markSpam`, `reopen`, then delegates the resulting `TicketPatch` to the repository.
- **`src/modules/tickets/services/system.ts`** — calls `clear` for system-initiated closures and `initialTicketStatus` at intake.
- **`src/modules/tickets/repository.ts`** — persists the `TicketPatch` (applies `set`/`unset`) to storage.
- **`src/modules/tickets/service.ts`** — top-level ticket service that composes workflow and system services.
- **`src/modules/tickets/presenter.ts`** — reads the resulting status/resolution for display shaping.
- **`src/modules/tickets/tests/unit/lifecycle.test.ts`** — direct unit tests for every exported function.
- **`src/modules/tickets/tests/unit/system-openings.test.ts`** — exercises `initialTicketStatus` and `openKeyOf` in the system-opening flow.

## Notes

- `dueAt` is deliberately **not** touched by any door. The retention/deadline clock belongs to the situation, not to the ticket's status, so reopening does not reset it.
- `resolve` and `markSpam` both preserve an existing `closedAt` (via `ticket.closedAt ?? now`). This matters for the spam→resolved edge: the original close time is kept so the retention clock is not silently extended.
- `clear` returns a raw `TicketPatch` rather than a `Transition`. Callers are contractually responsible for checking openness before applying it; there is no `already_*` refusal here.
- `reopen` re-derives `openKey` from `kind` + `link`. Tickets without a `link` (e.g. visitor messages) get no dedup key on reopen.
- The file is a `@module` (no default export); all symbols are named exports.
