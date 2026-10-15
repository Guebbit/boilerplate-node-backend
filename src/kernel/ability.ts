/**
 * @module
 * Turning a resolved caller into the one object every authorization question is asked of — a CASL
 * `Ability`, built per request from the keys the caller's role holds and the conditions they carry.
 *
 * Why CASL:   its rules compile into a database query, so the restriction rides IN the read, and
 *             they pack for the browser, so a client greys out what the server would refuse from
 *             the same rules rather than from a copy of them.
 * Not CASL's: `can('manage', ...)` is never emitted — every rule names a DECLARED key's own action
 *             and subject, one key at a time. Nothing declares an audit write, so nothing grants
 *             it. Breadth (a role reading its own rows or everyone's) is a segment on the key
 *             itself (`<family>.self.read` vs `<family>.any.read`), so a role states what it
 *             holds rather than reaching a wider read through a shortcut — `admin` included, who
 *             holds every declared tenant key by name like everyone else.
 *
 * See `docs/theory/authorization.md`, and `shared/authorization-keys.yaml` for the keys
 * themselves — a file the PHP twin reads byte-for-byte identically.
 */

import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import type { Caller } from '@types';
import { findKey, type PermissionKey } from '@kernel/permissions';

/** A caller's rules, in the form every authorization question is asked of. */
export type Ability = MongoAbility;

/** The prefix a `$caller.<field>` placeholder is written with in the shared keys file. */
const PLACEHOLDER = '$caller.';

/**
 * Substitute `$caller.<field>` throughout a key's conditions.
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
 * The declared keys a caller effectively holds — the other scope's keys dropped, since a role
 * seeded with one must be INERT by construction, not merely unreachable through a route that
 * happens to guard the right thing.
 */
const effectiveKeys = (caller: Caller): PermissionKey[] => {
    const effective = new Map<string, PermissionKey>();

    for (const name of caller.permissions) {
        const declared = findKey(name);

        if (declared?.scope === caller.scope) {
            effective.set(declared.key, declared);
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
 * its id is the literal string `'system'`, not a real user's, and a `self` key's condition resolved
 * against it would bake that string into a Mongo filter as if it were an ObjectId — see
 * `access/query.ts`'s `userId` coercion. An administrator is NOT exempt: every signed-in account
 * holds the `self` keys of its audience, and a `self` key with no condition would read everyone's
 * rows.
 */
export const buildAbility = (caller: Caller): Ability => {
    const { can, build } = new AbilityBuilder(createMongoAbility);
    const tenancy = caller.scope === 'tenant' ? { tenantId: caller.tenantId } : {};
    const unconditional = caller.system;

    for (const key of effectiveKeys(caller)) {
        const conditions = unconditional ? {} : resolveConditions(key.conditions ?? {}, caller);

        if (!conditions) {
            continue;
        }

        can(key.action, key.subject, { ...conditions, ...tenancy });
    }

    /*
     * No `can('manage', …)` rule is ever emitted, so asking the ability for one always answers no.
     * `manage` is never a declared key's own action, so as a CASL ACTION it means "any action at
     * all", which is precisely the unbounded grant this model does not have. An audit row is the
     * case that proves it matters: `AuditLog` declares a read key and nothing else, so even
     * `admin`, who holds every declared tenant key by name, cannot touch it.
     */
    return build();
};

/**
 * Does this caller hold `key`?
 *
 * The question a route guard asks. It reads the literal keys the ability was built from, never
 * CASL's collapsed `can(action, subject)`: two declared keys can share both (`orders.self.read`
 * and `orders.any.read` are both `read` on `Order`), and every signed-in account holds the `self`
 * one, so collapsing them would let anybody through a staff door. Which rows survive is the read's
 * business — see `access/query.ts`.
 */
export const holdsKey = (caller: Caller, key: string): boolean => heldKeys(caller).has(key);

/**
 * The literal keys a caller holds — what tells a caller holding `orders.self.read` from one
 * holding `orders.any.read`, and what the role-matrix docs generator reads.
 */
export const heldKeys = (caller: Caller): ReadonlySet<string> =>
    new Set(effectiveKeys(caller).map((key) => key.key));
