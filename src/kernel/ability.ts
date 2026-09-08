/**
 * @module
 * Turning a resolved caller into the one object every authorization question is asked of — a CASL
 * `Ability`, built per request from the keys the caller's role holds plus the conditions those
 * keys carry.
 *
 * WHY CASL AND NOT A HAND-ROLLED CHECK. The rules it holds compile into a database query
 * (`@casl/mongoose`'s `accessibleBy`), which is the only way to keep the property this repository
 * already had before roles existed: *the restriction rides IN the read*. Anything that answers
 * yes/no about a document already in memory opens a window between the check and its use, and
 * lets "not yours" and "does not exist" answer differently. The same rules also pack for the
 * browser, so the frontend greys out what the server would refuse — from the same rules, so the
 * two cannot drift.
 *
 * WHAT IS NOT CASL'S, and why. Two expansions happen here before any rule is built, and both are
 * narrower than CASL's own wildcard semantics:
 *
 *   - `all.manage` expands to every key DECLARED in the caller's scope, not to an unbounded
 *     `can('manage', 'all')`. A shop owner therefore cannot edit an audit row merely because no
 *     module thought to forbid it — nothing declares `audit.update`, so nothing grants it.
 *   - `<module>.manage` expands to every key that module declares, unconditionally. That is what
 *     makes staff see drafts without a second `products.read-drafts` key: the narrow read key
 *     carries `published: true`, and the wide one carries nothing.
 *
 * See `docs/theory/authorization.md`, and `shared/authorization-keys.yaml` for the keys
 * themselves — a file the PHP twin reads byte-for-byte identically.
 */

import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import {
    findKey,
    PERMISSION_KEYS,
    wildcardKeyFor,
    WILDCARD_ACTION,
    type AuthorizationScope,
    type PermissionKey
} from '@kernel/permissions';

/**
 * What an authorization decision is allowed to know about the caller.
 *
 * Narrower than the resolved session on purpose: `email`, `username` and `imageUrl` are identity,
 * not permission, and a rule that reads them is one nobody can audit by its type.
 */
export interface Caller {
    id?: string | null;
    /** The shop this request acts in. `null` in platform scope, and only there. */
    tenantId?: string | null;
    scope: AuthorizationScope;
    permissions: readonly string[];
}

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
 * matches every unowned row. Same reasoning as the empty-id throw in `authorization.ts` — a gap
 * here must become "denied", never "widened".
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
 * The drop is the §7 invariant doing its work, and it happens here rather than at check time so
 * that a mis-seeded role is inert instead of dangerous: a bare key on a platform caller never
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
     * grant an action nothing declares.
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
            for (const key of PERMISSION_KEYS) {
                if (key.module === declared.module) {
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
