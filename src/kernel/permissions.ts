/**
 * @module
 * The declared permission keys and the preset roles, read from the two shared artefacts that the
 * PHP twin reads byte-for-byte identically — `shared/authorization-keys.yaml` and
 * `shared/authorization-roles.yaml`.
 *
 * ROLES ARE DATA, PERMISSIONS ARE CODE. A deployment may create roles at runtime; it may never
 * invent a key, because a key nothing checks grants nothing while looking like it grants
 * something. `assertDeclared` is where that stops being a sentence.
 *
 * Read once at import, not per request: the file is small, it cannot change while the process
 * lives, and parsing it per request would put YAML on the hot path of every authorization
 * decision. A malformed file throws here, at boot, rather than on the first request that needs a
 * rule — see `required-config.ts` for the same stance about configuration.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import type { AuthContext, AuthorizationScope, Caller } from '@types';
import {
    scopeOfKey,
    wildcardKeyFor,
    WILDCARD_ACTION,
    WILDCARD_SUBJECT
} from '@infrastructure/authorization/keys';

/** The action vocabulary, CASL's own. `manage` is the wildcard meaning any declared action. */
export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'manage';

/**
 * One declared key.
 *
 * `subject` is the CASL subject type — the concrete thing a rule is about — while the key's own
 * first segment is the resource family. `orders.read` is a permission, `Order` is a thing.
 */
/** How recently a caller must have proved themselves to use a key that demands it. */
export type StepUpTier = 'critical' | 'sensitive';

/**
 *
 */
export interface PermissionKey {
    key: string;
    module: string;
    subject: string;
    action: PermissionAction;
    scope: AuthorizationScope;
    description: string;
    /**
     * Whether this key demands a recently proved session, and how recently.
     *
     * On the KEY rather than on a route because the tier is a property of what the action IS:
     * erasing somebody's account deserves a fresh session wherever it is reached from, and a
     * second route reaching the same key would otherwise have to remember. Absent for almost
     * everything — a challenge people learn to dismiss protects nothing.
     */
    stepUp?: StepUpTier;
    /**
     * The ABAC half: a filter fragment that must ALSO hold of the row, in the shape both
     * repositories already spread into a query. `$caller.<field>` is substituted from the
     * resolved caller; there is no expression language beyond that.
     */
    conditions?: Record<string, unknown>;
}

/**
 *
 */
export interface PresetRole {
    name: string;
    scope: AuthorizationScope;
    title: string;
    description: string;
    permissions: readonly string[];
}

const SHARED = path.join(__dirname, '..', '..', 'shared');

const readShared = (file: string): unknown => parse(readFileSync(path.join(SHARED, file), 'utf8'));

const keysDocument = readShared('authorization-keys.yaml') as {
    actions: PermissionAction[];
    wildcards: { subject: string; action: PermissionAction };
    keys: PermissionKey[];
};

const rolesDocument = readShared('authorization-roles.yaml') as {
    roles: PresetRole[];
    anonymous: { name: string; scope: AuthorizationScope; permissions: readonly string[] };
};

/*
 * The grammar is owned by `@infrastructure/authorization/keys` — the audit trail needs it and may
 * not reach the kernel. What the kernel owns is the guarantee that the shared file still agrees
 * with it: a rename of either wildcard in `authorization-keys.yaml` would otherwise leave the two
 * halves of the model quietly answering different questions.
 */
if (
    keysDocument.wildcards.subject !== WILDCARD_SUBJECT ||
    keysDocument.wildcards.action !== WILDCARD_ACTION
) {
    throw new Error(
        `[permissions] shared/authorization-keys.yaml spells its wildcards ` +
            `"${keysDocument.wildcards.subject}.${keysDocument.wildcards.action}", but the grammar in ` +
            `infrastructure/authorization/keys.ts says "${WILDCARD_SUBJECT}.${WILDCARD_ACTION}". ` +
            `Change both, or neither.`
    );
}

/** Every declared key, in the order the shared file lists them. */
export const PERMISSION_KEYS: readonly PermissionKey[] = keysDocument.keys;

/** The preset roles a deployment starts with, and may edit afterwards. */
export const PRESET_ROLES: readonly PresetRole[] = rolesDocument.roles;

/** What an unauthenticated request resolves to — a value in the model, not a null to handle. */
export const ANONYMOUS_ROLE = rolesDocument.anonymous;

const byKey = new Map(PERMISSION_KEYS.map((entry) => [entry.key, entry]));

const byRoleName = new Map(
    [...PRESET_ROLES, ANONYMOUS_ROLE as PresetRole].map((role) => [role.name, role])
);

/**
 * A preset role by name, or `undefined`.
 *
 * A deployment may add roles at runtime, so an unknown name here is not automatically a mistake —
 * it is a role this build did not ship. What it must never be is a caller with no permissions and
 * no complaint, which is why `permissionsOfRole` throws instead of returning an empty list.
 */
export const findRole = (name: string): PresetRole | undefined => byRoleName.get(name);

/**
 * The keys a role holds.
 *
 * @throws Error when no role of that name is declared — a caller resolved to a role nothing
 *   defines would be denied everything, which reads as a permissions bug and is really a typo.
 */
export const permissionsOfRole = (name: string): readonly string[] => {
    const role = findRole(name);

    if (!role) {
        throw new Error(
            `[permissions] "${name}" is not a declared role. ` +
                `Add it to shared/authorization-roles.yaml, or correct the caller's role.`
        );
    }

    return role.permissions;
};

/**
 * The caller a request with no session is evaluated as.
 *
 * A value in the model rather than a null branch: `guest` is a role like any other, seeded from
 * `shared/authorization-roles.yaml`, so "what may a stranger do" is answered in the same file and
 * by the same evaluator as every other role. Tenant scope, because an unauthenticated request
 * never acts over the installation.
 */
export const anonymousCaller = (): Caller => ({
    id: null,
    tenantId: null,
    scope: ANONYMOUS_ROLE.scope,
    permissions: ANONYMOUS_ROLE.permissions
});

/** A declared key by name, or `undefined`. Wildcards are not declared keys and never resolve. */
export const findKey = (key: string): PermissionKey | undefined => byKey.get(key);

/**
 * Every declared key in one scope. This is what `all.manage` EXPANDS TO, which is narrower than
 * CASL's unbounded wildcard and deliberately so: a shop owner cannot edit an audit row merely
 * because no module thought to forbid it, and adding a key stays the only way to widen anybody.
 */
export const keysInScope = (scope: AuthorizationScope): readonly PermissionKey[] =>
    PERMISSION_KEYS.filter((entry) => entry.scope === scope);

/**
 * Refuse a key no module declares — on ASSIGNMENT, not at check time.
 *
 * At check time an undeclared key is merely inert, which reads as a role that grants nothing and
 * looks like a role that grants something. Failing where the grant is made is the only place the
 * mistake is still attached to whoever made it.
 *
 * @throws Error when no module declares the key and it is not this scope's wildcard
 */
export const assertDeclared = (key: string): void => {
    if (byKey.has(key) || key === wildcardKeyFor(scopeOfKey(key))) {
        return;
    }

    throw new Error(
        `[permissions] "${key}" is not declared in shared/authorization-keys.yaml. ` +
            `Roles are data; permissions are code — declare the key beside its module's routes first.`
    );
};

/**
 * The `Caller` an `AuthContext` becomes, for ONE key.
 *
 * A person may hold a role in the shop AND over the installation; a REQUEST acts in exactly one
 * scope. The key being checked is what settles which — a bare key is answered from the tenant
 * role, a `platform.` key from the platform one. That is why this takes the key: answering from
 * the wrong role is precisely the privilege confusion the two-role split exists to prevent.
 *
 * A caller with no role in the key's scope gets the anonymous role's permissions rather than an
 * empty list, so the denial comes from the model rather than from an accident of assembly.
 *
 * @param context - the resolved session
 * @param key - the permission key about to be checked, e.g. `orders.read` or `platform.tenants.manage`
 * @returns the caller as the evaluator sees them, in the key's scope
 */
export const callerFor = (context: AuthContext, key: string): Caller =>
    callerInScope(context, scopeOfKey(key));

/**
 * The `Caller` an `AuthContext` becomes in a named scope — the primitive {@link callerFor} and
 * {@link callerForSubject} both resolve to.
 *
 * A caller with no role in that scope gets the anonymous role's permissions rather than an empty
 * list, so a denial comes from the model rather than from an accident of assembly.
 *
 * @param context - the resolved session
 * @param scope - which of the two worlds this request acts in
 */
export const callerInScope = (context: AuthContext, scope: AuthorizationScope): Caller => {
    const roleName = scope === 'platform' ? context.roles.platform : context.roles.tenant;

    return {
        id: context.id,
        // Platform scope is tenant-less by definition; carrying a tenantId there would let a
        // platform rule be narrowed by a shop it does not belong to.
        tenantId: scope === 'platform' ? null : context.tenantId,
        scope,
        permissions: roleName ? permissionsOfRole(roleName) : ANONYMOUS_ROLE.permissions
    };
};

/**
 * Which scope a SUBJECT's rows live in, read from the keys that declare it.
 *
 * A scope-narrowing rule knows its subject (`Order`, `Product`) but no single key, so this is how
 * it reaches a caller. Defaults to `tenant` for a subject nothing declares — the narrower of the
 * two, so an unknown subject is restricted rather than opened.
 */
export const scopeOfSubject = (subject: string): AuthorizationScope =>
    PERMISSION_KEYS.find((entry) => entry.subject === subject)?.scope ?? 'tenant';

/** The `Caller` an `AuthContext` becomes for a SUBJECT's rows — see {@link scopeOfSubject}. */
export const callerForSubject = (context: AuthContext, subject: string): Caller =>
    callerInScope(context, scopeOfSubject(subject));

/**
 * Does this caller hold the wildcard key in a scope — the honest spelling of the old `admin: true`.
 *
 * Role names are data a deployment may rename or add to; "holds the wildcard" is a property of
 * the permission model itself, which is why the audit trail, `requireUnrestricted` and the domain actor all
 * ask this rather than comparing a name.
 */
export const isUnrestricted = (caller: Caller): boolean =>
    caller.permissions.includes(wildcardKeyFor(caller.scope));

/**
 * The application acting on nobody's behalf — a sweep, a job, a domain event with no request
 * behind it.
 *
 * Unrestricted inside the shop, because that is what these jobs do: an expired reservation
 * cancels its order regardless of whose order it was, and narrowing the read to "own rows" would
 * make the sweep find nothing and report success. Its id is `system` rather than a user's, which
 * is the same word the audit trail already uses for the actor on these paths.
 *
 * It is a value here rather than a caller assembled at each site because that is exactly the kind
 * of thing that gets assembled slightly differently the third time.
 */
export const SYSTEM_ACTOR: AuthContext = {
    id: 'system',
    email: 'system@localhost',
    username: 'system',
    roles: { tenant: 'owner', platform: null },
    tenantId: null,
    authTime: 0,
    amr: [],
    analyticsConsent: false,
    verified: true
};

/**
 * Is this ROLE unrestricted in its scope — the audit trail's word for "admin"?
 *
 * Roles are data a deployment may rename or add to; the trail's vocabulary is closed and its
 * values outlive them. So the question asked of a role name is never "is it called owner" but
 * "does it hold the scope's wildcard", which stays true through any renaming.
 *
 * @param name - a role name, or `null`/`undefined` for an account with none in that scope
 * @param scope - which world the question is about; the shop unless stated
 */
export const isUnrestrictedRole = (
    name: string | null | undefined,
    scope: AuthorizationScope = 'tenant'
): boolean => Boolean(name) && permissionsOfRole(name!).includes(wildcardKeyFor(scope));

export {
    scopeOfKey,
    wildcardKeyFor,
    WILDCARD_ACTION,
    WILDCARD_SUBJECT
} from '@infrastructure/authorization/keys';
