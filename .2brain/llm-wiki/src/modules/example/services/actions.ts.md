---
source: src/modules/example/services/actions.ts
sha256: 6900bc68b67fcecc7de1a63e98548372caa8ea142997e1748a60d1049239507d
generated_at: 2026-11-14T20:00:22.776515+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/actions.ts

## Purpose

Centralises the per-row answer to "what may this caller do?" for the Example module. It combines kernel-level ability checks (`update`, `delete`, own-rows) with the domain's lifecycle-derived moves so that clients receive a ready-made action set and never re-derive permissions themselves. The file exists to be deleted if the module has no per-row actions that need to be greyed out or enabled.

## Key elements

- **`actionsForRows(context: CallerContext)`** — The sole export. Accepts the caller's context, builds a single ability via `permitsOnRows`, and returns a closure `(row: ActionRow) => ExampleActions`. Building the ability once means a page of N rows costs one ability lookup, not N.
- **`ActionRow`** (local, not exported) — The minimal row shape the ability and lifecycle need: `userId` (for own-row comparisons) and `status` (the current lifecycle position).

## Relationships

- **`src/kernel/ability.ts`** — Calls `permitsOnRows(caller, 'Example', ['update', 'delete'])` to obtain a per-row predicate.
- **`src/modules/example/domain/index.ts`** — Calls `exampleActionsFor(status, permitResult)` to fold the lifecycle's allowed transitions into the final action set.
- **`src/types/index.ts`** — Imports `CallerContext`, `ExampleActions`, and `ExampleStatus` as type-only dependencies.

## Notes

- The file is intentionally thin: it is a *wiring* layer between the kernel's ability engine and the domain's lifecycle logic, not a place for business rules.
- If the module's `authorization.yaml` changes keys (e.g. adds `archive`), the `['update', 'delete']` array and the `ActionRow` shape must be updated in lockstep.
- The returned closure is designed to be called once per row in a list-render loop; it is not memoised and will re-invoke `exampleActionsFor` on each call.
