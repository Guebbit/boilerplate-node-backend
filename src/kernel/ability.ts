/**
 * @module
 * Turning a resolved caller into the one object every authorization question is asked of — a CASL
 * `Ability`, built per request from the keys the caller's role holds and the conditions they carry.
 *
 * Why CASL:   its rules compile into a database query, so the restriction rides IN the read, and
 *             they pack for the browser, so a client greys out what the server would refuse from
 *             the same rules rather than from a copy of them.
 * Not CASL's: two expansions happen here first, and both are NARROWER than its own wildcard —
 *
 *   - `all.manage` expands to every key DECLARED in the caller's scope, never to an unbounded
 *     `can('manage', 'all')`. Nothing declares `audit.update`, so nothing grants it.
 *   - `<family>.manage` expands to that FAMILY's keys, unconditionally — which is what lets staff
 *     see drafts: the narrow read key carries `published: true`, the wide one carries nothing.
 *     The family is the key's own prefix (`products`, `translations`), NOT the declaring module:
 *     `locales` declares both `locales.*` and `translations.*`, and expanding over the module
 *     handed `translations.manage` the power to delete a language.
 *
 * See `docs/theory/authorization.md`, and `shared/authorization-keys.yaml` for the keys
 * themselves — a file the PHP twin reads byte-for-byte identically.
 */

import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import type { Caller } from '@types';
import {
    findKey,
    PERMISSION_KEYS,
    wildcardKeyFor,
    WILDCARD_ACTION,
    type PermissionKey
} from '@kernel/permissions';

/** A caller's rules, in the form every authorization question is asked of. */
export type Ability = MongoAbility;

/** The prefix a `$caller.<field>` placeholder is written with in the shared keys file. */
const PLACEHOLDER = '$caller.';

/**
 * A key's FAMILY — everything before its action. `products.read` is `products`,
 * `platform.observability.read` is `platform.observability`.
 *
 * This, not `module`, is what a `manage` key expands over. One module may declare two families
 * (`locales` owns both `locales.*` and `translations.*`), and expanding over the module let a
 * translations key grant locale writes — a role documented as reading the dictionary could delete
 * a language from it.
 */
const familyOf = (key: string): string => key.slice(0, key.lastIndexOf('.'));

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
 * The keys a caller effectively holds, wildcards expanded and the other scope's keys dropped.
 *
 * The drop is the scope invariant doing its work, and it happens here rather than at check time
 * so that a mis-seeded role is inert instead of dangerous: a bare key on a platform caller never
 * becomes a rule at all. `wide` marks a key reached through a `manage` wildcard, because those
 * grant their module unconditionally.
 */
const effectiveKeys = (caller: Caller): { key: PermissionKey; wide: boolean }[] => {
    const effective = new Map<string, { key: PermissionKey; wide: boolean }>();

    /*
     * The one place a key becomes a rule, and therefore the one place the scope check belongs.
     * A key from the other scope is dropped here rather than filtered earlier, so a role seeded
     * with one is INERT by construction — not merely unreachable through a route that happens to
     * guard the right thing.
     *
     * A `manage` key is never itself a grant: it is an instruction to expand, and its own entry
     * would emit CASL's unbounded `manage` action — the thing this model deliberately does not
     * have. `products.manage` grants read, create, update and delete on `Product`; it does not
     * grant an action nothing declares, and it does not reach a sibling family its module happens
     * to declare too.
     */
    const add = (key: PermissionKey, wide: boolean) => {
        if (key.scope !== caller.scope || key.action === WILDCARD_ACTION) {
            return;
        }

        const existing = effective.get(key.key);

        if (!existing || (wide && !existing.wide)) {
            effective.set(key.key, { key, wide });
        }
    };

    /** What one held key stands for: the whole scope, one module, or just itself. */
    const expand = (name: string): void => {
        if (name === wildcardKeyFor(caller.scope)) {
            for (const key of PERMISSION_KEYS) {
                add(key, true);
            }

            return;
        }

        const declared = findKey(name);

        if (!declared) {
            return;
        }

        if (declared.action === WILDCARD_ACTION) {
            const family = familyOf(declared.key);

            for (const key of PERMISSION_KEYS) {
                if (familyOf(key.key) === family) {
                    add(key, true);
                }
            }

            return;
        }

        add(declared, false);
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
    const tenancy = caller.scope === 'tenant' ? { tenantId: caller.tenantId ?? null } : {};

    for (const { key, wide } of effectiveKeys(caller)) {
        const conditions = wide ? {} : resolveConditions(key.conditions ?? {}, caller);

        if (!conditions) {
            continue;
        }

        can(key.action, key.subject, { ...conditions, ...tenancy });
    }

    /*
     * No `can('manage', …)` rule is ever emitted, so asking the ability for one always answers no.
     * `manage` is a wildcard on the KEY side, expanded in `effectiveKeys` into the concrete
     * actions its module declares; as a CASL ACTION it means "any action at all", which is
     * precisely the unbounded grant this model does not have. An audit row is the case that
     * proves it matters: `AuditLog` declares a read key and nothing else, so a caller holding
     * `all.manage` reads it and cannot touch it.
     */
    return build();
};

/**
 * Does this caller hold `key`?
 *
 * The question a route guard asks, and it is not simply `ability.can(...)`, because two of the
 * three kinds of key are not things CASL can be asked about directly:
 *
 *   - **the scope wildcard** (`all.manage`) is not a declared key at all — it is the grant of
 *     every declared key in the scope — so it is answered from what the role holds;
 *   - **a `manage` key** (`feedback.manage`) is an instruction to expand, and no `manage` RULE is
 *     ever built, so it is answered as "every action this module declares";
 *   - **a concrete key** is the ordinary case, answered by the ability.
 *
 * Asked about the action and subject rather than about a row, because a route guard runs before
 * anything is fetched. Which rows survive is the read's business — see `access/query.ts`.
 */
export const holdsKey = (caller: Caller, key: string): boolean => {
    if (key === wildcardKeyFor(caller.scope)) {
        return caller.permissions.includes(key);
    }

    const declared = findKey(key);

    if (!declared) {
        return false;
    }

    const ability = buildAbility(caller);

    if (declared.action !== WILDCARD_ACTION) {
        return ability.can(declared.action, declared.subject);
    }

    const family = familyOf(declared.key);
    const concrete = PERMISSION_KEYS.filter(
        (candidate) => familyOf(candidate.key) === family && candidate.action !== WILDCARD_ACTION
    );

    /*
     * A family with no concrete WRITE cannot answer this question honestly: "holds every concrete
     * key" would reduce to "holds the read", and a read-only role would pass a guard asking for
     * `manage`. That is how `apikeys.read` once satisfied `apikeys.manage` and could mint a
     * credential. Fail closed instead — only the literal key, or the scope wildcard above, grants
     * it — and declare a concrete write key if a route needs to be reachable.
     */
    if (!concrete.some((candidate) => candidate.action !== 'read')) {
        return caller.permissions.includes(key);
    }

    return concrete.every((candidate) => ability.can(candidate.action, candidate.subject));
};
