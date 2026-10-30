---
source: src/modules/example/services/actions.ts
sha256: 0fc6eb9311690965d661dccee7ccc1cd4ee8cbd761a7c311df519ba89d44bf7c
generated_at: 2026-10-29T03:55:06.956963+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/actions.ts

## Purpose

Resolves, per row, which actions a given caller is allowed to take on an `Example` record. It composes the kernel's ability check (which `authorization.yaml` keys apply) with the domain's lifecycle-based moves, so the client never re-derives permissions. Exists to centralise the "what may I do?" answer for one module in a single place.

## Key elements

- **`actionsForRows(context: CallerContext)`** — The sole export. Builds the ability once for the caller, then returns a closure `(row: ActionRow) => ExampleActions`. Calling the returned function per row costs no additional ability construction, so a page of rows shares one ability.
- **`ActionRow`** (local interface) — The minimal row shape the ability and lifecycle need: `userId` (for own-row comparisons) and `status` (for lifecycle moves).
- **`permitsOnRows`** (from `@kernel/ability`) — Constructs the row-scoped ability for the `'Example'` aggregate with the keys `['update', 'delete']`.
- **`exampleActionsFor`** (from `../domain`) — Maps a lifecycle `status` + the permits result to the concrete `ExampleActions` set.

## Relationships

- **`src/kernel/ability.ts`** — Supplies `permitsOnRows`, the kernel-side function that evaluates authorization keys against a specific row.
- **`src/modules/example/domain/index.ts`** — Supplies `exampleActionsFor`, which folds the lifecycle state into the final action set.
- **`src/modules/example/domain/lifecycle.ts`** — Defines the `ExampleStatus` transitions that `exampleActionsFor` consults (reached indirectly through the domain barrel).
- **`src/types/index.ts`** / **`src/types/auth-context.ts`** — Provide the `CallerContext`, `ExampleActions`, and `ExampleStatus` type contracts.
- **`src/modules/example/services/crud.ts`** / **`src/modules/example/services/owner.ts`** — Graph neighbors that consume the per-row action set produced here to drive UI affordances (grey-out, hide) in their respective views.

## Notes

- The file header documents an explicit deletion criterion: if the module has no per-row grey-out logic, this file should be removed. Don't keep it as a passthrough.
- `ActionRow` is intentionally narrower than a full entity record — only the fields the ability and lifecycle actually read are included. Add a field here only if a new authorization key or lifecycle transition needs it.
- The returned closure captures `permits` (the built ability). If the caller context can change within a single page render, you must call `actionsForRows` again; there is no memoisation or invalidation built in.
- See `docs/theory/tactical-ddd.md#2-capabilities-the-server-answers-what-a-client-may-do` for the design rationale behind this pattern.
