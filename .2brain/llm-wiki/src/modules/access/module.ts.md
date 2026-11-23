---
source: src/modules/access/module.ts
generated_at: 2026-11-22T03:16:33.004575+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/module.ts

## Purpose
Manifest entry for the `access` module, which owns the tenant and membership collections (the identity-and-access domain that `src/kernel/permissions.ts` and `src/kernel/ability.ts` query). It is deliberately routeless: nothing exposes shop creation or role grants over HTTP, so there is no URL to mount. Its only declared contribution is a personal-data section for data export and erasure.

## Key elements
- **Default export** — an object typed with `satisfies AppModule` (from `@kernel/registry`), with `name: 'access'` and a single `personalData` entry.
- **`personalData` section `'roles'`**
  - `collect(subject)` — calls `accessService.membershipsOf(subject.userId)` and returns only `{ role, scope }` per membership. The tenant id is intentionally omitted: this deployment ships one shop, so the id adds nothing a data subject would recognise, and role/scope answer the Art. 15 "what can this account do" question.
  - `erase({ userId }, session)` — delegates to `accessService.eraseMemberships(userId, session)`, so erasure runs inside the caller's own hard-delete transaction.

## Relationships
- **`src/kernel/registry.ts`** — supplies the `AppModule` type that the manifest must satisfy.
- **`src/modules/access/services/index.ts`** — provides `accessService`, used for both `membershipsOf` and `eraseMemberships`. Other modules also consume access only through this barrel.
- **`src/modules.ts`** — the module list that registers this manifest.
- **`src/modules/account/module.ts`**, **`src/modules/api-keys/module.ts`**, **`src/modules/audit-logs/module.ts`** — sibling module manifests in the same registry.
- **`src/modules/access/authorization.yaml`** — the module's authorization definition, a graph neighbor of this module. This file doesn't reference it directly.
- **`tests/integration/erasure.test.ts`** — integration test covering erasure, which exercises the `erase` hook.

## Notes
- The header names `account`, `api-keys`, `example`, `orders`, `payments`, `returns` and `users` as consumers of this module, all via the services barrel.
- `./model.ts` explains why a routeless domain is still a module rather than kernel code. The header also points to `docs/understand/authorization.md#where-it-lives` for further background.
