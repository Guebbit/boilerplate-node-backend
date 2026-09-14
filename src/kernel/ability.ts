/**
 * @module
 * Turning a resolved caller into the one object every authorization question is asked of — a CASL
 * `Ability`, built per request from the keys the caller's role holds and the conditions they carry.
 *
 * Why CASL:   its rules compile into a database query, so the restriction rides IN the read, and
 *             they pack for the browser, so a client greys out what the server would refuse from
 *             the same rules rather than from a copy of them.
 * Not CASL's: the one expansion here is NARROWER than CASL's own wildcard — `all.manage` expands
 *             to every key DECLARED in the caller's scope, never to an unbounded
 *             `can('manage', 'all')`. Nothing declares an audit write, so nothing grants it.
 *             Breadth (a role reading its own rows or everyone's) is a segment on the key itself
 *             (`<family>.self.read` vs `<family>.any.read`), so an ORDINARY role states what it
 *             holds rather than reaching a wider read through a wildcard. The scope wildcard
 *             alone still drops every key's own conditions when it expands: `SYSTEM_ACTOR`'s id
 *             is `'system'`, not a real user's, and a `self` key resolved against it would bake
 *             that string into a Mongo filter as if it were an ObjectId — see `access/query.ts`'s
 *             `userId` coercion. The wildcard already means unconditional; this is what makes that
 *             true of every key it reaches, not only the ones with nothing to drop.
 *
 * See `docs/theory/authorization.md`, and `shared/authorization-keys.yaml` for the keys
 * themselves — a file the PHP twin reads byte-for-byte identically.
 */

import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import type { Caller } from '@types';
import { findKey, PERMISSION_KEYS, wildcardKeyFor, type PermissionKey } from '@kernel/permissions';

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
 * The keys a caller effectively holds, the scope wildcard expanded and the other scope's keys
 * dropped. `wide` marks a key reached THROUGH the scope wildcard, because that grant is
 * unconditional by definition — see the module doc comment.
 */
const effectiveKeys = (caller: Caller): { key: PermissionKey; wide: boolean }[] => {
    const effective = new Map<string, { key: PermissionKey; wide: boolean }>();

    /*
     * The one place a key becomes a rule, and therefore the one place the scope check belongs.
     * A key from the other scope is dropped here rather than filtered earlier, so a role seeded
     * with one is INERT by construction — not merely unreachable through a route that happens to
     * guard the right thing.
     */
    const add = (key: PermissionKey, wide: boolean) => {
        if (key.scope !== caller.scope) {
            return;
        }

        const existing = effective.get(key.key);

        if (!existing || (wide && !existing.wide)) {
            effective.set(key.key, { key, wide });
        }
    };

    /** What one held key stands for: the whole scope, or just itself. */
    const expand = (name: string): void => {
        if (name === wildcardKeyFor(caller.scope)) {
            for (const key of PERMISSION_KEYS) {
                add(key, true);
            }

            return;
        }

        const declared = findKey(name);

        if (declared) {
            add(declared, false);
        }
    };

    for (const name of caller.permissions) {
        expand(name);
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
 */
export const buildAbility = (caller: Caller): Ability => {
    const { can, build } = new AbilityBuilder(createMongoAbility);
    const tenancy = caller.scope === 'tenant' ? { tenantId: caller.tenantId } : {};

    for (const { key, wide } of effectiveKeys(caller)) {
        const conditions = wide ? {} : resolveConditions(key.conditions ?? {}, caller);

        if (!conditions) {
            continue;
        }

        can(key.action, key.subject, { ...conditions, ...tenancy });
    }

    /*
     * No `can('manage', …)` rule is ever emitted, so asking the ability for one always answers no.
     * `manage` is the SCOPE wildcard's action only; it is never a declared key's own action, so as
     * a CASL ACTION it means "any action at all", which is precisely the unbounded grant this
     * model does not have. An audit row is the case that proves it matters: `AuditLog` declares a
     * read key and nothing else, so a caller holding `all.manage` reads it and cannot touch it.
     */
    return build();
};

/**
 * Does this caller hold `key`?
 *
 * The question a route guard asks, and it is not simply `ability.can(...)`, because one of the two
 * kinds of key is not something CASL can be asked about directly: **the scope wildcard**
 * (`all.manage`) is not a declared key at all — it is the grant of every declared key in the scope
 * — so it is answered from what the role holds. **A concrete key** is the ordinary case, answered
 * by the ability.
 *
 * Asked about the action and subject rather than about a row, because a route guard runs before
 * anything is fetched. Which rows survive is the read's business — see `access/query.ts`. That
 * also means this collapses two keys that share an action and a subject but differ in breadth
 * (`orders.self.read` and `orders.any.read` both answer `can('read', 'Order')`) — never a problem
 * for a guard, since no route in this repo guards a read on the wide-breadth key specifically, but
 * the wrong question for anything ENUMERATING which keys a caller holds. Use {@link heldKeys} for
 * that.
 */
export const holdsKey = (caller: Caller, key: string): boolean => {
    if (key === wildcardKeyFor(caller.scope)) {
        return caller.permissions.includes(key);
    }

    const declared = findKey(key);

    if (!declared) {
        return false;
    }

    return buildAbility(caller).can(declared.action, declared.subject);
};

/**
 * The literal keys a caller holds, the scope wildcard expanded — never collapsed to an action and
 * a subject the way {@link holdsKey} is. Two declared keys can share both (`orders.self.read` and
 * `orders.any.read` are both `read` on `Order`), so this is what tells a caller holding one from a
 * caller holding the other — the role-matrix docs generator is why it exists.
 */
export const heldKeys = (caller: Caller): ReadonlySet<string> =>
    new Set(effectiveKeys(caller).map(({ key }) => key.key));
