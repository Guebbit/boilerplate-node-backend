---
source: src/kernel/ability.ts
sha256: 219ffb62f0fe742ae20395d169e01898379bd4be0aa62654395e260792a25fc3
generated_at: 2026-09-23T17:54:17.436093+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/ability.ts

## Purpose

Builds a per-request CASL `MongoAbility` from a caller's declared permission keys and their scope. This is the single object every authorization question in the system is asked of — route guards, row-level reads, and key-enumeration endpoints all consume it or its helpers.

## Key elements

- **`Ability`** (type alias for `MongoAbility`) — the concrete rule set a caller holds.
- **`resolveConditions(conditions, caller)`** (internal) — substitutes `$caller.<field>` placeholders in a key's condition map. Returns `undefined` if _any_ placeholder resolves to a missing/null/empty value, causing the caller to drop that rule entirely (fail-closed).
- **`effectiveKeys(caller)`** (internal) — intersects the caller's `permissions` list against the declared-key registry, keeping only keys whose `scope` matches the caller's scope.
- **`buildAbility(caller)`** (export) — the main factory. For each effective key it resolves conditions (or uses `{}` for unrestricted callers), injects `tenantId` for tenant-scope callers, and emits a single `can(action, subject, filter)` rule. Returns the built ability.
- **`holdsKey(caller, key)`** (export) — boolean "does this caller hold this key?" for route guards. Checks action + subject only (not a specific row), so it collapses breadth variants (`orders.self.read` / `orders.any.read`).
- **`heldKeys(caller)`** (export) — returns the literal `Set<string>` of key names the caller holds. Does **not** collapse shared action/subject pairs; used when enumeration fidelity matters (e.g. the role-matrix docs generator).

## Relationships

- **`src/kernel/permissions.ts`** — direct import: `findKey`, `isUnrestricted`, and the `PermissionKey` type are the declared-key registry this file reads from.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — source of the `Caller` type that every function here accepts.
- **`src/kernel/access/query.ts`** — the read-side companion: the rules this file emits are what `query.ts` compiles into Mongo filters. Fail-closed semantics (empty filter ⇒ denied, not widened) are coordinated between the two.
- **`src/kernel/middlewares/authorizations.ts`** — route-guard middleware that calls `holdsKey` (or `buildAbility` + `.can`) before a handler runs.
- **`src/modules/account/controllers/get-my-abilities.ts`** — consumer that calls `heldKeys` to enumerate a caller's literal keys.
- **`scripts/docs/generate-role-matrix.ts`** — the role-matrix docs generator referenced in `heldKeys`'s doc comment as the reason that non-collapsing export exists.
- **`tests/contract/authorization-contract.test.ts`**, **`tests/cross-cutting/authorization-conformance.test.ts`** — test suites that exercise the ability-building and key-holding behavior defined here.

## Notes

- **No `manage` action is ever emitted.** `can('manage', …)` always answers _false_ because no declared key uses `manage` as its own action; in CASL it would mean "any action," which this model deliberately forbids. Even `admin` cannot act on a subject that declares no `manage` key (e.g. `AuditLog`).
- **`tenantId` is sourced exclusively from the resolved caller**, never from request parameters or the keys file. A cross-tenant read is structurally inexpressible rather than merely guarded.
- **Unrestricted callers get `{}` conditions**, computed once. This is load-bearing: `SYSTEM_ACTOR`'s id is the literal string `'system'`; running a `self`-key condition against it would bake that string into a Mongo filter as a bogus ObjectId.
- **`holdsKey` ≠ `heldKeys`.** `holdsKey` answers a guard question (action + subject); `heldKeys` answers an enumeration question (exact key names). Do not use `holdsKey` to list which keys a role holds.
- The shared keys file (`shared/authorization-keys.yaml`) is read byte-for-byte by a PHP twin; changes to the placeholder format (`$caller.<field>`) are a cross-language contract.
