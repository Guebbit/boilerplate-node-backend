/**
 * @module
 * Turning a resolved caller into the one object every authorization question is asked of — a CASL
 * `Ability`, built per request from the rules the caller's role holds and the conditions they carry.
 *
 * Why CASL:   its rules compile into a database query, so the restriction rides IN the read, and
 *             they pack for the browser, so a client greys out what the server would refuse from
 *             the same rules rather than from a copy of them.
 * Not CASL's: `can('manage', ...)` is never emitted — every rule names a DECLARED rule's own action
 *             and subject, one rule at a time. Nothing declares an audit write, so nothing grants
 *             it. Whether a role reads its own rows or everyone's is the action of the rule
 *             (`read` is mine, `display` is every row), so a role states what it holds rather
 *             than reaching a wider read through a shortcut — `admin` included, who lists every
 *             declared tenant set by name like everyone else.
 *
 * See `docs/theory/authorization.md`, and `shared/authorization-keys.yaml` for the keys
 * themselves — a file the PHP twin reads byte-for-byte identically.
 */

import { AbilityBuilder, createMongoAbility, subject, type MongoAbility } from '@casl/ability';
import type { Caller } from '@types';
import { findRule, IMPLIED_ACTIONS, ruleId, type DeclaredRule } from '@kernel/permissions';

/** A caller's rules, in the form every authorization question is asked of. */
export type Ability = MongoAbility;

/** The prefix a `$caller.<field>` placeholder is written with in the shared keys file. */
const PLACEHOLDER = '$caller.';

/**
 * Substitute `$caller.<field>` throughout a rule's conditions.
 *
 * Returns `undefined` when a placeholder has no value, and the caller of this drops the rule
 * rather than emitting it. That is the fail-closed direction and it is load-bearing: a caller
 * with no id would otherwise get `{ userId: null }`, which is a perfectly good filter that
 * matches every unowned row. Same direction as the empty filter in `access/query.ts` — a gap here
 * must become "denied", never "widened".
 */
const resolveConditions = (
    conditions: Record<string, unknown>,
    caller: Caller
): Record<string, unknown> | undefined => {
    const resolved: Record<string, unknown> = {};

    for (const [field, value] of Object.entries(conditions)) {
        if (typeof value !== 'string' || !value.startsWith(PLACEHOLDER)) {
            resolved[field] = value;
            continue;
        }

        const source = caller[value.slice(PLACEHOLDER.length) as keyof Caller];

        if (source === undefined || source === null || source === '') {
            return undefined;
        }

        resolved[field] = source;
    }

    return resolved;
};

/**
 * The declared rules a caller effectively holds — the other scope's rules dropped, since a role
 * seeded with one must be INERT by construction, not merely unreachable through a route that
 * happens to guard the right thing.
 */
const effectiveRules = (caller: Caller): DeclaredRule[] => {
    const effective = new Map<string, DeclaredRule>();

    for (const id of caller.permissions) {
        const declared = findRule(id);

        if (declared?.scope === caller.scope) {
            effective.set(declared.id, declared);
        }
    }

    return [...effective.values()];
};

/**
 * Build the caller's ability.
 *
 * Every tenant-scope rule gets `tenantId` from the RESOLVED CALLER, never from a request
 * parameter and never from the shared keys file. That is what makes a cross-tenant read
 * impossible to express by accident rather than merely discouraged — no key can forget it,
 * because no key states it.
 *
 * The SYSTEM actor's rules carry no conditions at all. This is load-bearing, not an optimisation:
 * its id is the literal string `'system'`, not a real user's, and an own-rows rule's condition resolved
 * against it would bake that string into a Mongo filter as if it were an ObjectId — see
 * `access/query.ts`'s `userId` coercion. An administrator is NOT exempt: every signed-in account
 * holds the own-rows rules of its audience, and one with no condition would read everyone's
 * rows.
 */
export const buildAbility = (caller: Caller): Ability => {
    const { can, build } = new AbilityBuilder(createMongoAbility);
    const tenancy = caller.scope === 'tenant' ? { tenantId: caller.tenantId } : {};
    const unconditional = caller.system;

    for (const rule of effectiveRules(caller)) {
        const conditions = unconditional ? {} : resolveConditions(rule.conditions ?? {}, caller);

        if (!conditions) {
            continue;
        }

        // A staff action also answers the plain ones it implies (`display` answers `read`), so
        // one `accessibleBy` filter is compiled from the own-rows rule and the staff rule together.
        for (const action of [rule.action, ...(IMPLIED_ACTIONS[rule.action] ?? [])]) {
            can(action, rule.subject, { ...conditions, ...tenancy });
        }
    }

    /*
     * No `can('manage', …)` rule is ever emitted, so asking the ability for one always answers no.
     * `manage` is never a declared rule's own action, so as a CASL ACTION it means "any action at
     * all", which is precisely the unbounded grant this model does not have. An audit row is the
     * case that proves it matters: `AuditLog` declares a read key and nothing else, so even
     * `admin`, who holds every declared tenant key by name, cannot touch it.
     */
    return build();
};

/**
 * The actions whose rule also answers `action`: `read` is answered by `display`, `update` and
 * `delete` by `admin`. The inverse of `implies:` in the shared keys file, built once.
 */
const IMPLIED_BY = new Map<string, string[]>();

for (const [staff, plain] of Object.entries(IMPLIED_ACTIONS)) {
    for (const action of plain) {
        IMPLIED_BY.set(action, [...(IMPLIED_BY.get(action) ?? []), staff]);
    }
}

/**
 * Does this caller hold a rule for `action` on `subject`?
 *
 * The question a route guard asks. It reads the literal rules the ability was built from, never
 * CASL's collapsed `can(action, subject)` over a row: the staff action (`display`) and the plain
 * one (`read`) are different rules on the same subject, and every signed-in account holds the
 * plain one, so asking for the staff action is what keeps anybody from walking through a staff
 * door. A plain action is answered by the staff action that implies it. Which rows survive is the
 * read's business — see `access/query.ts`.
 *
 * @param caller - the caller, in the subject's scope
 * @param action - the action asked, e.g. `display`
 * @param subject - the CASL subject asked about, e.g. `Order`
 */
export const holds = (caller: Caller, action: string, subject: string): boolean => {
    const held = heldRules(caller);

    return (
        held.has(ruleId(action, subject)) ||
        (IMPLIED_BY.get(action) ?? []).some((staff) => held.has(ruleId(staff, subject)))
    );
};

/**
 * The ids of the literal rules a caller holds — what tells a caller holding `read:Order` from one
 * holding `display:Order`, and what the role-matrix docs generator reads.
 */
export const heldRules = (caller: Caller): ReadonlySet<string> =>
    new Set(effectiveRules(caller).map((rule) => rule.id));

/**
 * Which of `actions` the caller may take on THIS row — the per-row twin of `holds` and of the
 * compiled query filter. The conditions in the shared keys file (`userId: $caller.id`) stay the
 * only encoding of "own rows": the ability is built once, then asked about each row, so a module
 * never restates the rule in code.
 *
 * @param caller - the caller, in the subject's scope
 * @param subjectName - the CASL subject, e.g. `Example`
 * @param actions - the actions to answer, e.g. `['update', 'delete']`
 * @returns a function from a row to one boolean per action; every answer is `false` for a caller
 *   with no matching rule
 */
export const permitsOnRows = <TAction extends string>(
    caller: Caller,
    subjectName: string,
    actions: readonly TAction[]
): ((row: Record<string, unknown>) => Record<TAction, boolean>) => {
    const ability = buildAbility(caller);
    // CASL `subject(type, object)` tags a plain object with its subject type, so conditions can be
    // matched against it. The tenant comes from the caller, as in `buildAbility`'s own rules.
    // https://casl.js.org/v6/en/guide/subject-type-detection
    return (row) =>
        Object.fromEntries(
            actions.map((action) => [
                action,
                ability.can(action, subject(subjectName, { ...row, tenantId: caller.tenantId }))
            ])
        ) as Record<TAction, boolean>;
};
