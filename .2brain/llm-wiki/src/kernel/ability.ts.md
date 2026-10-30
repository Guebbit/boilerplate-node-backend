---
source: src/kernel/ability.ts
sha256: 9ee591dd9b68df823762e64fa95427b8ad1fc9994a369714c7c06e131ef1b3a3
generated_at: 2026-10-29T02:18:07.502112+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/ability.ts

## Purpose

The single choke-point that turns a resolved `Caller` into a CASL `MongoAbility`. Every authorization question in the system — whether a route guard may proceed, which rows a read filter should include, or whether a per-row action is permitted — is ultimately asked of the object produced here. It exists so that the server-side enforcement, the compiled Mongo query filter, and the client-side UI greying all derive from the *same* declared rules rather than from parallel copies.

## Key elements

- **`Ability`** (type alias) — re-export of `MongoAbility`; the type every consumer passes around.
- **`buildAbility(caller)`** — core builder. Filters the caller's declared rules to in-scope ones, resolves `$caller.<field>` placeholders, injects `tenantId` for tenant-scoped rules, expands staff actions into their implied plain actions via `IMPLIED_ACTIONS`, and returns a CASL `Ability`. No `manage` rule is ever emitted.
- **`holds(caller, action, subject)`** — boolean guard check. Returns true if the caller holds the literal rule *or* a staff rule that implies the plain action (e.g. `display` answers `read`). Used by route-level guards.
- **`holdsSet(caller, setName)`** — true only if the caller holds *every* rule in a named permission set (from `PERMISSION_SETS`). Unrestricted callers pass automatically; unknown set names return false.
- **`heldRules(caller)`** — returns a `ReadonlySet<string>` of rule ids the caller effectively holds. Distinctly separates `read:Order` from `display:Order`. Consumed by the role-matrix docs generator.
- **`permitsOnRows(caller, subjectName, actions)`** — returns a row-level checker function. Builds an ability once, then per row asks CASL whether each action is permitted, using `subject(type, object)` so conditions match against the row's fields.
- **`resolveConditions`** (internal) — substitutes `$caller.<field>` placeholders; returns `undefined` (→ rule dropped) if any placeholder resolves to empty, enforcing fail-closed.
- **`effectiveRules`** (internal) — filters `caller.permissions` to rules whose `scope` matches the caller's scope; out-of-scope rules are inert by construction.
- **`IMPLIED_BY`** (internal) — reverse map of `IMPLIED_ACTIONS`, built once at module load. Used by `holds` to answer plain actions via their staff action.

## Relationships

- **`src/kernel/permissions.ts`** — direct import: `findRule`, `IMPLIED_ACTIONS`, `PERMISSION_SETS`, `ruleId`, `DeclaredRule`. This file is the consumer of the declared-rule registry.
- **`src/kernel/access/query.ts`** — referenced in comments as the sibling that compiles the *same* conditions into a Mongo `$filter`. Both share the fail-closed contract: an unresolved condition means "deny," never "match-all."
- **`scripts/docs/generate-role-matrix.ts`** — reads `heldRules` (per its JSDoc) to produce the role-matrix documentation.
- **`src/kernel/middlewares/authorizations.ts`, `src/modules/*` services** — downstream consumers of `holds`, `holdsSet`, and `permitsOnRows` for route guards, per-row permission checks, and set-level checks respectively.

## Notes

- **Fail-closed is load-bearing.** `resolveConditions` returning `undefined` (dropping the rule) is not an edge case; it prevents a caller with a missing `id` from getting `{ userId: null }`, which in Mongo would match every unowned row.
- **No `manage` action exists.** Asking the ability for `manage` always returns false. `manage` is never a declared rule's action, so it cannot be granted. This is the mechanism that keeps even `admin` out of audit logs.
- **`tenantId` comes only from the resolved caller**, never from request parameters or the keys file. This makes cross-tenant reads structurally unexpressible rather than merely discouraged.
- **System actor** (`caller.system === true`) bypasses condition resolution entirely — its rules carry no conditions. This is not an optimisation: the literal string `'system'` would otherwise be baked into a Mongo filter as a pseudo-ObjectId.
- **Scope filtering is structural, not advisory.** A rule seeded in one scope is inert in another regardless of what routes guard. The check is `declared.scope === caller.scope`, not a route-level check.
- **`IMPLIED_BY` is a module-level constant** built from `IMPLIED_ACTIONS` at import time. It is the inverse of the `implies:` mapping in `shared/authorization-keys.yaml`.
