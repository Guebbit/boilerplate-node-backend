---
source: src/modules/tickets/views.ts
sha256: ec08b69f462c2e014502f748b42e401dabc7e3cf8490bc1b85e8e39805bc9a34
generated_at: 2026-10-29T06:10:08.927213+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/views.ts

## Purpose

Transforms raw stored tickets into a viewer-facing `TicketView` by attaching the assignee's display name and the set of actions the caller is permitted to perform. Both enrichments are resolved **once per page** (one user lookup, one standing check) so that rendering N rows costs the same as rendering one.

## Key elements

- **`Viewable` (interface)** – Minimal shape a ticket must satisfy before it can be projected. Exposes `source`, `routeSet`, `status`, and an optional `assigneeId` (string or ObjectId-like with `toString()`).
- **`assigneeNamesOf`** – Batch-looks up assignee usernames via `userService.search`, returning a `Map<string, string>`. Skips undefined ids and deduplicates; ids with no account are simply absent from the map.
- **`viewerOf(caller, names)`** – Returns a `{ of(ticket): TicketView }` object. The caller's standing (`mayWork`, `mayDelete`) is captured in the closure *once*, so each `of()` call is a pure mapping that reads pre-resolved names and pre-computed permissions. `assigneeName` is included only when a name was found.

## Relationships

- **`src/modules/tickets/access.ts`** – Imports `mayWork` and `mayDelete` to evaluate the caller's standing against a single ticket.
- **`src/modules/tickets/domain/index.ts`** (re-exporting `domain/actions.ts`) – Imports `actionsOf`, which maps status + permissions into the final action list.
- **`src/modules/tickets/presenter.ts`** – Imports the `TicketView` type that `viewerOf.of` produces.
- **`src/modules/users/index.ts`** – Imports `userService` to perform the single batch user search for assignee names.
- **`src/types/index.ts` / `src/types/auth-context.ts`** – Source of the `Caller`, `TicketStatus`, and `TicketSource` types used in signatures.

## Notes

- `assigneeId` may be a `string` **or** an object exposing `toString()` (e.g. a MongoDB ObjectId). Callers pass the raw stored value; `viewerOf` normalises it with `String()` before the map lookup.
- `assigneeName` is emitted via a conditional spread, so tickets with an unassigned or unknown assignee carry **no** `assigneeName` key at all—not `null`/`undefined`.
- The module is a pure presentation helper: it holds no mutable state and performs no writes. Side effects are limited to the single `userService.search` call made by the caller *before* invoking `viewerOf`.
