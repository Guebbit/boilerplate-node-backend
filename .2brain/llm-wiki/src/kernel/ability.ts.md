---
source: src/kernel/ability.ts
sha256: 8b027cff25844960a1752219fb1f41f0a26ee082b6b5341ff8d8b71b23202916
generated_at: 2026-11-14T18:20:27.016851+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/ability.ts

## Purpose

Builds a per-request CASL `Ability` (a `MongoAbility`) from a caller's declared permission rules and their contextual conditions. Every authorization question in the system—route guards, per-row checks, permission-set membership—is answered against this single object, so that the server's read filter and the browser's UI greying derive from the same ruleset rather than parallel copies.

## Key elements

- **`Ability`** (type) — alias for `MongoAbility`; the canonical shape returned by the builder.
- **`buildAbility(caller)`** — the main entry point. Filters the caller's rules to their scope, resolves `$caller.<field>` placeholders, injects `tenantId` for tenant-scope callers, and registers each rule (plus its implied plain actions) via CASL's `can()`. System-actor rules are registered unconditionally.
- **`holds(caller, action, subject)`** — boolean check used by route guards. Answers "does this caller hold a rule for this action on this subject?", also matching a staff action (`display`) as answering its implied plain action (`read`).
- **`holdsSet(caller, setName)`** — true when the caller holds every rule in a named permission set (or is unrestricted).
- **`heldRules(caller)`** — returns a `ReadonlySet<PermissionRuleId>` of the caller's effective rule IDs; consumed by the role-matrix docs generator.
- **`permitsOnRows(caller, subjectName, actions)`** — returns a row-level predicate function that asks the built ability about each individual row, so modules never restate ownership conditions in code.
- **`resolveConditions`** (internal) — substitutes `$caller.*` placeholders; returns `undefined` (→ rule dropped) when any placeholder has no value, enforcing fail-closed.
- **`effectiveRules`** (internal) — keeps only rules whose `scope` matches the caller's scope, making cross-scope rules inert by construction.
- **`IMPLIED_BY`** (internal) — inverse of `IMPLIED_ACTIONS`; maps a plain action to the staff action(s) that also answer it.

## Relationships

- **`src/kernel/permissions.ts`** — sole source of rule metadata: `findRule`, `isRuleId`, `ruleId`, `IMPLIED_ACTIONS`, `PERMISSION_SETS`, and all rule/subject types are imported from here. This file never defines a rule; it only interprets them.
- **`src/kernel/access/query.ts`** — the compiled ability filter is consumed there to produce Mongo query conditions. Both files share the fail-closed convention: an unresolved condition becomes "denied," never a widened match.
- **`src/kernel/middlewares/authorizations.ts`** — calls `holds` (or `buildAbility`) as the route-level gate before a handler runs.
- **`src/kernel/staff-read.ts`** — builds on the `display`/`read` implied-action distinction that this file encodes; staff reads compose an own-rows rule with a staff rule into one filter.
- **`scripts/docs/generate-role-matrix.ts`** — reads `heldRules` to render the role → rule matrix documentation.
- **`scripts/contracts/permission-security.ts`** — contract-level validation of the declared rules that this file interprets at runtime.
- **Module service files** (`src/modules/access/services/grants.ts`, `src/modules/access/services/protection.ts`, `src/modules/api-keys/services/*`, `src/modules/delivery/services/*`, `src/modules/account/session/account-view.ts`) — consume `holds`, `holdsSet`, and `permitsOnRows` to gate their respective actions without re-encoding ownership logic.

## Notes

- `manage` is deliberately **never** emitted as a `can()` rule. In CASL, `can('manage', …)` means "any action at all," which would be an unbounded grant. No declared rule uses it, so asking the ability for it always answers `false`.
- The SYSTEM actor's rules are registered with **zero conditions**. This is load-bearing: the system id is the literal string `'system'`, and resolving an own-rows condition against it would bake that string into a Mongo filter as if it were an ObjectId.
- An administrator is **not** exempt from conditions. Every signed-in account holds the own-rows rules of its audience; the only difference is which rule IDs appear in `caller.permissions`.
- The `$caller.` placeholder prefix is the sole coupling point between the shared keys file (`shared/authorization-keys.generated.yaml`, read byte-for-byte by the PHP twin) and the runtime ability. If a placeholder has no value in the caller, the rule is dropped entirely rather than substituted with `null`/empty—this prevents `{ userId: null }` from matching unowned rows.
