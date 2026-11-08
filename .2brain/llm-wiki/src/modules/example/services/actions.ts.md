---
source: src/modules/example/services/actions.ts
sha256: 0fc6eb9311690965d661dccee7ccc1cd4ee8cbd761a7c311df519ba89d44bf7c
generated_at: 2026-11-08T05:52:55.382996+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/actions.ts

## Purpose

Centralizes the per-row authorization and lifecycle answer for the **example** module. Given a caller and a row, it determines which actions (`update`, `delete`, and status transitions) are available, so no client re-derives permissions. The ability check is built once per page, then applied row-by-row.

## Key elements

- **`actionsForRows(context: CallerContext)`** — exported function. Builds a `permitsOnRows` ability for the caller against the `Example` resource (keys: `update`, `delete`) and returns a closure that maps an `ActionRow` to an `ExampleActions` object by delegating to `exampleActionsFor`.
- **`ActionRow`** — local interface (`userId`, `status`) representing the minimal slice of a row the keys and lifecycle need to read.
- **Module doc comment** — documents the "delete this file if" criterion and links to the tactical-DDD capabilities theory.

## Relationships

- **`src/kernel/ability.ts`** — imports `permitsOnRows`, which compiles the caller's ability for a given resource/key set into a row-scoped predicate.
- **`src/modules/example/domain/index.ts`** — imports `exampleActionsFor`, which merges the permission flags with the lifecycle's allowed status transitions into the final `ExampleActions` shape.
- **`src/modules/example/domain/lifecycle.ts`** — indirectly consumed through the domain's `exampleActionsFor`; supplies the status-transition moves that appear in the returned actions.
- **`src/types/auth-context.ts`** / **`src/types/index.ts`** — source of the `CallerContext`, `ExampleActions`, and `ExampleStatus` type imports.
- **`src/modules/example/services/crud.ts`** — graph neighbor; the most likely consumer that calls `actionsForRows` to annotate result rows before returning them to the API layer.

## Notes

- The ability is constructed **once** per `actionsForRows` call, not once per row. Callers should invoke `actionsForRows` at the page/query level and pass the returned closure into each row mapping.
- `ActionRow` is intentionally narrow: if the authorization keys or lifecycle need additional fields (e.g., a tenant id), the interface must be extended and every caller's row projection must supply it.
- The file is deliberately small; the module doc states it should be deleted entirely if the module has no per-row UI greying-out needs.
