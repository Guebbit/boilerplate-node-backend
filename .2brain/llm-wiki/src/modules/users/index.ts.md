---
source: src/modules/users/index.ts
sha256: 70d127f544625d0b7fe5d303cb7aa65445b8db2d802d5d843bf11e656a1ddc82
generated_at: 2026-09-27T15:37:24.595766+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/index.ts

## Purpose

Public barrel for the `users` module — the sole import surface available to sibling modules (enforced per `docs/theory/strategic-ddd.md` §5). It re-exports the service, events, and selected model members so that external code never reaches into internal files directly.

## Key elements

- **`export * from './service'`** — exposes `userService` (and any other service members) as the only sanctioned path for reads/writes.
- **`export * from './events'`** — exposes the module's event definitions/subscriptions.
- **Named exports from `./model`** — `TokenType`, `zodUserSchema`, `hashToken`, `isLiveRefreshSession`, `normalizeEmail`, `DEFAULT_USER_IMAGE_URL`: the schema, token-type enum, pure helpers, and default avatar URL.
- **`export type * from './model'`** — re-exports all type-only members (interfaces, type aliases) from the model.
- **`userModel` and `userRepository`** — deliberately **not** exported; no external code may call them.

## Relationships

- **`account` module** (controllers, services, routes, module) is the one shared-kernel consumer in the repo. `account` authenticates and co-administers the same user document this module owns. All of `account`'s reads and writes flow through `userService` — never through `userRepository` or `userModel` directly.
- **Scripts** (`scripts/db/access-grant.ts`, `scripts/ops/reap-inactive-accounts.ts`) appear as graph neighbors, implying they consume exports from this barrel for their respective DB/ops tasks.

## Notes

- `userModel` stays unexported by design; nothing outside this module calls it. Any new external need must go through `userService`.
- The barrel is intentionally wider than a typical module's because of the `account` shared-kernel coupling — but the internal repo and model runtime remain private.
- For the architectural rationale see `docs/theory/strategic-ddd.md` §5; for module-level docs see `docs/modules/users.md`.
