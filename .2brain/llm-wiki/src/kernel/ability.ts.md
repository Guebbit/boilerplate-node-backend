---
source: src/kernel/ability.ts
sha256: da3da38fd93a87c5f715fc19e178c5903a9d15ccda7a75530d64521764da5b2d
generated_at: 2026-10-14T08:20:10.956222+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/ability.ts

## Purpose

Builds a per-request CASL `MongoAbility` from a caller's declared permission keys and their attached conditions. It is the single object every authorization question in the codebase is asked of, and it is designed so that the same rules can compile into a database read filter and be shipped to the browser for client-side gating.

## Key elements

- **`Ability`** (type) — alias for `MongoAbility`; the shape every guard, query, and controller receives.
- **`buildAbility(caller)`** — main entry point. Filters the caller's keys to their scope, resolves `$caller.<field>` placeholders in conditions, injects `tenantId` from the caller (never from the key), and emits one `can(action, subject, conditions)` per effective key. Unrestricted callers get zero conditions.
- **`holdsKey(caller, key)`** — route-guard check: does the caller's ability permit the key's action on its subject? Intentionally collapses keys that share action + subject (e.g. `orders.self.read` vs `orders.any.read`).
- **`heldKeys(caller)`** — returns the literal set of declared key names the caller holds, with no action/subject collapsing. Exists specifically so consumers (e.g. the role-matrix docs generator) can distinguish breadth variants.
- **`resolveConditions`** (internal) — substitutes `$caller.<field>` placeholders; returns `undefined` (rule dropped) if any placeholder is empty — fail-closed.
- **`effectiveKeys`** (internal) — intersects `caller.permissions` with declared keys whose `scope` matches the caller's scope; a key in the wrong scope is inert.

## Relationships

- **`src/kernel/permissions.ts`** — imports `findKey`, `isUnrestricted`, and the `PermissionKey` type; the declared-key registry this file resolves against.
- **`src/kernel/access/query.ts`** — design-coupled: conditions built here are intended to compile into a Mongo read filter; the fail-closed "empty → deny" convention is shared between the two.
- **`src/kernel/middlewares/authorizations.ts`** — consumes `holdsKey` as a route guard (action/subject level check before any data is fetched).
- **`scripts/docs/generate-role-matrix.ts`** — consumes `heldKeys` to enumerate exact key names per role (the stated reason `heldKeys` exists).
- **Module services & controllers** (`orders`, `delivery`, `payments`, `api-keys`, `account`) — consumers of `buildAbility` to get the per-request `Ability` object they pass into queries or checks.

## Notes

- **Fail-closed is load-bearing.** `resolveConditions` returning `undefined` (dropping the rule) rather than emitting `{ field: null }` prevents an unowned-row wildcard. The same invariant is enforced independently in `access/query.ts`.
- **Unrestricted ≠ just empty conditions.** `SYSTEM_ACTOR` has `id: 'system'` (a string, not an ObjectId). Skipping condition resolution entirely for unrestricted callers avoids baking that string into a Mongo filter.
- **`tenantId` injection is structural.** It comes from the resolved caller, not from the key definition, so no key can accidentally omit it.
- **No `manage` action exists.** CASL treats an unknown action as "any action"; the model deliberately never emits it so that a `can('manage', …)` check always answers `false`. `AuditLog` has a read key only — even `admin` cannot write it.
- **Shared keys file.** `shared/authorization-keys.yaml` is the single source of truth for key definitions and is read byte-for-byte identically by a PHP twin; this file is the Node-side consumer.
