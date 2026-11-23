---
source: src/kernel/ability.ts
source_sha256: 72b63ca79447b059a419e4c28ca86272bc071efde55bb2f488329278c436f793
context_sha256: 7516f0b52d615454beab0afddfee77b44eaa16ec2e63f65111af7085b7b01f7e
generated_at: 2026-11-22T03:11:28.775096+00:00
model: claude-code:claude-sonnet-5-5
---

# src/kernel/ability.ts

## Purpose
Turns a resolved `Caller` into a CASL `Ability`, built per request from the declared permission rules the caller's role holds and the conditions those rules carry. It also provides the route-guard and per-row questions asked of that ability. CASL is used so rules can compile into database queries and be packed for the browser. The rule keys come from `shared/authorization-keys.generated.yaml`, which the PHP twin also reads.

## Key elements
- `Ability` — type alias for `MongoAbility`.
- `buildAbility(caller)` — builds the ability from the caller's effective rules.
  - It emits `can(action, subject, conditions)` for each rule, and also for each action the rule implies (`IMPLIED_ACTIONS`, e.g. `display` also answers `read`).
  - Tenant-scope rules get `tenantId` from the caller, never from the keys file or a request parameter.
  - The SYSTEM actor (`caller.system`) gets rules with no conditions.
  - It never emits `can('manage', …)`.
- `holds(caller, action, subject)` — the route-guard question: does the caller hold a rule for that action on that subject? It checks the literal held rule ids, not CASL's collapsed answer. A plain action is also satisfied by a staff action that implies it, via the inverse map `IMPLIED_BY`.
- `holdsSet(caller, setName)` — true if the caller holds every rule in a named `PERMISSION_SETS` entry. `unrestricted` callers hold every set; an unknown set name is held by nobody.
- `heldRules(caller)` — returns the `ReadonlySet` of rule ids the caller effectively holds.
- `permitsOnRows(caller, subjectName, actions)` — builds the ability once and returns a function mapping a row to a `{action: boolean}` record. It tags the row with `subject()` and the caller's `tenantId`.
- Internal helpers:
  - `resolveConditions` substitutes `$caller.<field>` placeholders.
  - `effectiveRules` filters the caller's permissions to declared rules in the caller's scope.

## Relationships
- Imports `findRule`, `isRuleId`, `ruleId`, `IMPLIED_ACTIONS`, `PERMISSION_SETS` and related types from `@kernel/permissions` (`src/kernel/permissions.ts`), which holds the declared rules.
- It is paired with `src/kernel/access/query.ts`:
  - `src/kernel/access/query.ts` compiles the ability's rules into read filters; `holds` and `permitsOnRows` are the guard and per-row counterparts.
  - Both fail closed on an unresolved value.
  - `src/kernel/access/query.ts` also owns the `userId` coercion that the system actor's unconditional rules avoid.
- `heldRules` is documented as what the role-matrix docs generator reads (`scripts/docs/generate-role-matrix.ts`).
- The remaining neighbors are in the graph but this file shows no direct interaction with them. They are the authorization middleware, the contract script, the staff-read helper, and the access, api-keys, delivery and account modules.

## Notes
- **Fail closed:** if a `$caller.<field>` placeholder is undefined, null or empty, the whole rule is dropped. Otherwise `{ userId: null }` would match every unowned row.
- **Staff vs. plain actions:** `read` means own rows and `display` means all rows. Guards should ask for the staff action, because every signed-in account holds the plain one.
- **No `manage`:** every rule names a declared rule's own action and subject. `AuditLog` declares only a read key, so even `admin` cannot write it. `admin` has no shortcut and lists every declared tenant set by name.
- **Scope filtering:** a rule from the other scope is dropped, so a role seeded with one is inert.
- **Admin is not exempt:** only the SYSTEM actor skips conditions. An administrator still gets the own-rows conditions.
- `permitsOnRows` always sets `tenantId` from `caller.tenantId`, so its answers assume the subject is tenant-scoped.
