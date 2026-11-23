---
source: src/modules/example/services/owner.ts
source_sha256: 83389be304eb1b0af3a6ebcf29fa056eb073c0a4f56138f93cb8cedd0d7d6d84
context_sha256: 07a804255f1b5c397aad0cfbfd0c705c18bc67528d513a05c3d7ca1a2a1bc4c4
generated_at: 2026-11-22T05:12:42.829489+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/services/owner.ts

## Purpose
Resolves the owner's display name for an example and uses it to build the contract's `Example` shape. The collection stores only the owner's `userId`, so this file reads the name from the `users` module (through its barrel, `@modules/users`) and offers two presentation paths: one for a signed-in caller and one for anyone.

## Key elements
- `ownerNameOf(userId)`: calls `userService.getById` and returns the username. If the account no longer exists, it returns the translated `example.owner-unknown` placeholder.
- `ownerNamesOf(userIds)`: resolves names for a page of rows. It de-duplicates the ids, so there is one `users` read per distinct owner, and returns a `Map<userId, name>`.
- `presentForCaller(document, context)`: returns an `Example` with the owner's name filled in and `actions` computed for this caller via `actionsForRows(context)`, using the row's `userId` and `status`.
- `presentPublic(document)`: returns an `Example` with the owner's name and `actions` computed with no keys. `NO_KEYS` is `{ update: false, delete: false }`, so all actions come out false.
- `NO_KEYS` (private constant): the permissions a stranger holds on an example, which is none.

## Relationships
- `src/modules/users/index.ts`: the source of owner data. `userService` is imported from the `@modules/users` barrel, the only cross-module read, and it never touches the users repository or model.
- `src/infrastructure/i18n/index.ts`: `t()` supplies the unknown-owner placeholder.
- `src/modules/example/presenter.ts`: `presentExample(document, name, actions)` does the final shaping into `Example`.
- `src/modules/example/domain/index.ts`: `exampleActionsFor(status, keys)` computes the actions for the public path.
- `src/modules/example/services/actions.ts`: `actionsForRows(context)` computes the actions for the caller path.
- `src/modules/example/model.ts`: supplies the `ExampleDocument` type.
- `src/types/index.ts`: supplies `CallerContext` and `Example`.

## Notes
- `userId` is stringified with `String(document.userId)` before lookup and before building the row passed to `actionsForRows`.
- `ownerNamesOf` exists to avoid one read per row, but `presentForCaller` and `presentPublic` each resolve a single document's owner on their own.
