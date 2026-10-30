---
source: src/modules/example/services/owner.ts
sha256: e54c2350be7710a34d25a02709c2185c5ea3afc5a85f9ff5ba31df43f41192d5
generated_at: 2026-10-29T03:56:10.446630+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/owner.ts

## Purpose

The single cross-module read boundary for the example module. It fetches the owner's display name from the `users` module (strictly via its barrel) and provides the two presentation paths that turn a stored `ExampleDocument` into the public contract type `Example` — one for an authenticated caller, one for anonymous readers.

## Key elements

- **`NO_KEYS`** — module-private constant `{ update: false, delete: false }`; the action set handed to the public presentation (no one is acting).
- **`ownerNameOf(userId)`** — resolves a single user's display name via `userService.getById`; returns the i18n placeholder `example.owner-unknown` when the account is missing.
- **`ownerNamesOf(userIds)`** — deduplicates the input, resolves each distinct owner once, and returns a `Map<string, string>`. A page of rows belonging to one person costs one user read.
- **`presentForCaller(document, context)`** — assembles an `Example` with the owner's name and caller-specific permissions (computed by `actionsForRows`).
- **`presentPublic(document)`** — assembles an `Example` with the owner's name and all-false actions (computed by `exampleActionsFor` with `NO_KEYS`).

## Relationships

- **`@modules/users`** — sole cross-module dependency; accessed only through the barrel (`userService`).
- **`@infrastructure/i18n`** — provides `t()` for the fallback placeholder string.
- **`@types`** — supplies the `CallerContext` and `Example` contract types used in signatures.
- **`../model`** — imports `ExampleDocument`, the stored shape being presented.
- **`../presenter`** — `presentExample` performs the final document → `Example` assembly.
- **`../domain`** — `exampleActionsFor` derives the public (no-caller) action set.
- **`./actions`** — `actionsForRows` derives the caller-specific action set.

## Notes

- The module docstring states this is *the only* file in the example module that reads another module's data, and it must go through the barrel — never the users repository or model directly.
- `document.userId` is wrapped in `String(...)` before use, implying it may carry a non-string runtime type at the document layer.
- The two presentation paths use different action sources: caller path → `actionsForRows` (service-local), public path → `exampleActionsFor` (domain). Keep them aligned if the action shape changes.
