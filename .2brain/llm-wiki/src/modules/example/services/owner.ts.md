---
source: src/modules/example/services/owner.ts
sha256: e54c2350be7710a34d25a02709c2185c5ea3afc5a85f9ff5ba31df43f41192d5
generated_at: 2026-11-08T05:53:57.924668+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/owner.ts

## Purpose

The single point in the example module where another module's (users) data is read. It resolves an owner's display name and presents stored example documents as the contract's `Example` shape — either for a signed-in caller (with per-caller actions) or publicly (with actions disabled).

## Key elements

- **`ownerNameOf(userId)`** — Fetches a user's `username` via `userService.getById`; falls back to a translated placeholder (`t('example.owner-unknown')`) if the account no longer exists.
- **`ownerNamesOf(userIds)`** — Batch variant: deduplicates the input, fetches each distinct owner in parallel, returns a `Map<string, string>`. A page of rows owned by one person costs one read, not N.
- **`presentForCaller(document, context)`** — Resolves the owner name, then delegates to `presentExample` with actions computed by `actionsForRows(context)` for that specific caller.
- **`presentPublic(document)`** — Same as above but passes `NO_KEYS` (`{ update: false, delete: false }`) to `exampleActionsFor`, so the public read exposes no mutation actions.
- **`NO_KEYS`** (module-private) — The constant `{ update: false, delete: false }` representing "a stranger holds no keys."

## Relationships

- **`@modules/users`** (`src/modules/users/index.ts`) — Sole cross-module data read; calls `userService.getById`. Per the module contract this file must never reach into the users repository or model directly.
- **`@infrastructure/i18n`** — Uses `t()` for the "unknown owner" placeholder string.
- **`../model`** (`src/modules/example/model.ts`) — Consumes the `ExampleDocument` type as its input shape.
- **`../presenter`** (`src/modules/example/presenter.ts`) — Delegates final `Example` shaping to `presentExample`.
- **`../domain`** (`src/modules/example/domain/index.ts`) — Uses `exampleActionsFor` for the public (no-caller) action set.
- **`./actions`** (`src/modules/example/services/actions.ts`) — Uses `actionsForRows` to compute caller-specific permissions.
- **`@types`** (`src/types/index.ts`, `src/types/auth-context.ts`) — Imports the `Example` contract type and `CallerContext`.

## Notes

- This file is the **only** place in the example module that reads from the users module; all other reads/writes go through the example's own services. Keep it that way.
- `ownerNameOf` is async (returns `Promise<string>`), so both present helpers are also async even though they look like simple mappers.
- `ownerNamesOf` deduplicates via `Set` before issuing reads; callers can safely pass an un-deduplicated array.
- The action sets differ by path: `presentForCaller` gets per-user permissions from `actionsForRows`, while `presentPublic` hard-codes both flags to `false` via `NO_KEYS`.
