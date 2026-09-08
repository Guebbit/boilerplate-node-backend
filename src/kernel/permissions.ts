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

/** Which of the two worlds a caller acts in. Never both, never derived from a flag. */
export type AuthorizationScope = 'tenant' | 'platform';

/** The action vocabulary, CASL's own. `manage` is the wildcard meaning any declared action. */
export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'manage';

/**
 * One declared key.
 *
 * `subject` is the CASL subject type — the concrete thing a rule is about — while the key's own
 * first segment is the resource family. `orders.read` is a permission, `Order` is a thing.
 */
export interface PermissionKey {
    key: string;
    module: string;
    subject: string;
    action: PermissionAction;
    scope: AuthorizationScope;
    description: string;
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

/** `all` — the wildcard subject. `all.manage` is the honest spelling of the old `admin: true`. */
export const WILDCARD_SUBJECT = keysDocument.wildcards.subject;

/** `manage` — the wildcard action, with CASL's exact semantics. */
export const WILDCARD_ACTION = keysDocument.wildcards.action;

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

/** The prefix that marks a platform key. Bare keys are tenant keys; that asymmetry is the guard. */
const PLATFORM_PREFIX = 'platform.';

/** Which scope a key belongs to, read from its spelling rather than from a lookup. */
export const scopeOfKey = (key: string): AuthorizationScope =>
    key.startsWith(PLATFORM_PREFIX) ? 'platform' : 'tenant';

/** The wildcard key for a scope: `all.manage` in a tenant, `platform.all.manage` outside one. */
export const wildcardKeyFor = (scope: AuthorizationScope): string =>
    scope === 'platform'
        ? `${PLATFORM_PREFIX}${WILDCARD_SUBJECT}.${WILDCARD_ACTION}`
        : `${WILDCARD_SUBJECT}.${WILDCARD_ACTION}`;

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
