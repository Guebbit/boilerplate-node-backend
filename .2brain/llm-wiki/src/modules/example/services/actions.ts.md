---
source: src/modules/example/services/actions.ts
generated_at: 2026-11-22T05:11:37.246511+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/services/actions.ts

## Purpose
Decides, server-side and in one place, what a caller may do to an `Example` record, so clients don't re-derive it. It asks the kernel's ability layer about the `update` and `delete` keys (as stated in `authorization.yaml`, covering own rows or all rows) and lets the domain layer add lifecycle-dependent moves. The module header notes it can be deleted if the module has nothing a client must grey out per row.

## Key elements
- `actionsForRows(context: CallerContext)`: takes the caller context and returns a function `(row: ActionRow) => ExampleActions`. The ability is built once per call, so a page of rows costs one ability rather than one per row.
- `ActionRow` (internal interface): the slice of a row that is read, with `userId` (the owner, compared to the caller by own-rows conditions) and `status` (`ExampleStatus`, the lifecycle position).

## Relationships
- `src/kernel/ability.ts`: provides `permitsOnRows`, called with the caller taken from the context, subject `'Example'` and actions `['update', 'delete']`. It yields a per-row permission check taking `{ userId }`.
- `src/modules/example/domain/index.ts`: provides `exampleActionsFor(status, permits)`, which combines the row's lifecycle status with the permission result into the final `ExampleActions`.
- `src/modules/example/domain/lifecycle.ts`: a graph neighbor, the lifecycle rules in the domain. This file does not import it directly, and reaches the lifecycle's moves through `domain/index.ts`.
- `src/types/auth-context.ts` / `src/types/index.ts`: supply the `CallerContext`, `ExampleActions` and `ExampleStatus` types, imported via the `@types` alias.
- `src/modules/example/services/crud.ts` and `src/modules/example/services/owner.ts`: sibling services in the same module. This file does not import them.

## Notes
- The file only computes actions. It holds no authorization rules or lifecycle logic itself.
- Call `actionsForRows` once per request or page and reuse the returned function for every row.
