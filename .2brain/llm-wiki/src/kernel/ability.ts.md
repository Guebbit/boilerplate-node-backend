---
source: src/kernel/ability.ts
sha256: fbe5b762b21578144b7c466b580e47e77fab241ff5d938e77ae97ace34b5e69f
generated_at: 2026-11-08T03:52:02.680084+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/ability.ts

## Purpose

Builds a per-request CASL `MongoAbility` from a resolved `Caller`'s declared rules, so that every authorization question in the codebase is answered against a single, consistent object. Rules compile into a database filter (so restrictions ride inside the read) and are identical between server and browser. The file also exposes row-level and set-level query helpers that modules use instead of restating rules in their own code.

## Key elements

- **`Ability`** (type export) — alias for CASL `MongoAbility`; the unit every authorization check is expressed against.
- **`buildAbility(caller)`** (export) — constructs the caller's ability. Filters rules to the caller's scope, resolves `$caller.<field>` placeholders (dropping the rule if any value is missing — fail-closed), injects `tenantId` from the caller for tenant-scoped rules, and skips conditions entirely for the `system` actor. Expands each rule to its `IMPLIED_ACTIONS` so one filter covers e.g. `display` answering `read`.
- **`resolveConditions`** (internal) — substitutes `$caller.*` placeholders in a rule's conditions; returns `undefined` when a value is absent, causing the caller to drop the rule rather than widen it.
- **`effectiveRules`** (internal) — intersects `caller.permissions` with `caller.scope`, discarding rules whose scope doesn't match.
- **`holds(caller, action, subject)`** (export) — boolean "does this caller hold a rule for this action on this subject?" Used by route guards. A plain action is also answered by the staff action that implies it (e.g. `read` answered by `display`).
- **`holdsSet(caller, setName)`** (export) — true when the caller holds every rule in a named permission set (from `PERMISSION_SETS`), or when the caller is `unrestricted`. Unknown set names return `false`.
- **`heldRules(caller)`** (export) — `ReadonlySet<PermissionRuleId>` of the literal rule ids the caller holds; consumed by the role-matrix docs generator.
- **`permitsOnRows(caller, subjectName, actions)`** (export) — returns a closure that, given a row object, answers each requested action via CASL's `ability.can` with the row tagged as the subject. Re-uses `buildAbility` internally; `tenantId` is merged from the caller.
- **`IMPLIED_BY`** (internal) — reverse lookup map built once from `IMPLIED_ACTIONS`, mapping plain actions → the staff actions that satisfy them.

## Relationships

- **`src/kernel/permissions.ts`** — direct import: `findRule`, `isRuleId`, `IMPLIED_ACTIONS`, `PERMISSION_SETS`, `ruleId`, and all permission types. This file is the single source of declared rules; `ability.ts` is its runtime consumer.
- **`src/kernel/access/query.ts`** — the compiled ability filter produced here is the input that `query.ts` splices into the Mongo read. The fail-closed convention (missing condition → deny, never widen) is shared between the two, as is the `userId` ObjectId coercion noted in `buildAbility`'s comment.
- **`src/kernel/middlewares/authorizations.ts`** — consumes `holds` as the route-level gate ("the question a route guard asks"), checking a caller's rule before the handler runs.
- **`scripts/docs/generate-role-matrix.ts`** — reads `heldRules` to render the role × action matrix documentation.
- **Module services** (`src/modules/{delivery,api-keys,example}/services/actions.ts`, etc.) — call `holds`, `holdsSet`, and/or `permitsOnRows` to gate their own actions without re-encoding rules.

## Notes

- **No `can('manage', …)` is ever emitted.** `manage` is intentionally absent from the declared rule set; in CASL it means "any action," which this model forbids. Asking the ability for it always returns `false`.
- **Fail-closed on missing placeholders.** If any `$caller.<field>` resolves to `undefined`/`null`/`''`, the *entire rule* is dropped, not partially applied. This is deliberate: a `null` value would match unowned rows in Mongo.
- **`tenantId` is never a key placeholder.** It is injected structurally from the resolved caller at build time, so no rule can accidentally omit it or read it from a request parameter.
- **System actor bypasses conditions, not rules.** `caller.system` removes condition evaluation but the rule still must be in `caller.permissions` and in the correct scope. It is not an implicit grant.
- **`permitsOnRows` builds a fresh ability per call site.** There is no caching; the caller is the unit of resolution, and abilities are cheap relative to a query.
- **Shared keys file (`shared/authorization-keys.yaml`).** Both the Node and PHP twins read it byte-for-byte identically; the `$caller.` prefix convention and `implies:` direction live there, not in this file.
