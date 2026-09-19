/**
 * @module
 * The declared permission keys and the preset roles, read from the two shared artefacts that the
 * PHP twin reads byte-for-byte identically — `shared/authorization-keys.yaml` and
 * `shared/authorization-roles.yaml`.
 *
 * ROLES ARE DATA, PERMISSIONS ARE CODE. What a role holds is fixed by these two files, the same
 * for every deployment; a deployment may never invent a key, because a key nothing checks grants
 * nothing while looking like it grants something. `assertDeclared` is where that stops being a
 * sentence.
 *
 * Read once at import, not per request: the file is small, it cannot change while the process
 * lives, and parsing it per request would put YAML on the hot path of every authorization
 * decision. A malformed file throws here, at boot, rather than on the first request that needs a
 * rule — see `required-config.ts` for the same stance about configuration.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import type { AuthContext, AuthorizationScope, Caller, PlatformCaller, TenantCaller } from '@types';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';

/**
 * The prefix that marks a platform key.
 *
 * Bare keys are tenant keys and prefixed ones are platform keys, and that asymmetry is the whole
 * safety property: a bare key can never be satisfied by a platform-scope caller, and a
 * `platform.` key can never be satisfied by a tenant-scope one.
 */
const PLATFORM_PREFIX = 'platform.';

/** Which scope a key belongs to, read from its spelling rather than from a lookup. */
export const scopeOfKey = (key: string): AuthorizationScope =>
    key.startsWith(PLATFORM_PREFIX) ? 'platform' : 'tenant';

/**
 * The action vocabulary a declared KEY may carry, as a runtime array so both the type below and
 * the Zod schema that validates the shared YAML are drawn from the one list. `manage` is
 * deliberately absent: there is no wildcard of any kind, so nothing declares it as ITS action.
 * `checkout` and `sweep` are the two additions beyond CASL's own CRUD set —
 * `cart.self.checkout`'s and `inventory.any.sweep`'s actions, and nowhere else. See each key's own
 * description in `shared/authorization-keys.yaml`.
 */
const PERMISSION_ACTIONS = [
    'read',
    'create',
    'update',
    'delete',
    'checkout',
    'sweep',
    'override'
] as const;

/** See {@link PERMISSION_ACTIONS}. */
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** The two scopes a key or role may carry — kept here as a runtime array purely to validate the shared YAML against {@link AuthorizationScope} without duplicating the literal elsewhere. */
const AUTHORIZATION_SCOPES = [
    'tenant',
    'platform'
] as const satisfies readonly AuthorizationScope[];

/** How recently a caller must have proved themselves to use a key that demands it. */
export type StepUpTier = 'critical' | 'sensitive';

const stepUpTierSchema = z.enum(['critical', 'sensitive']);

/**
 * One declared key.
 *
 * `subject` is the CASL subject type — the concrete thing a rule is about — while the key's own
 * first segment is the resource family. `orders.self.read` is a permission, `Order` is a thing.
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
    /**
     * The `errors[].code` a refusal of THIS key answers, in place of `requirePermission`'s generic
     * `FORBIDDEN`. Absent for almost every key — a generic "you do not have permission" is the
     * right answer everywhere the caller genuinely lacks a role. `cart.self.checkout` is the exception:
     * the caller has a role, just not this key yet, and the actionable answer is "confirm your
     * email", not a permissions error. The message is looked up as `generic.error-<code,
     * kebab-cased>` — the same locale key `FORBIDDEN` itself resolves to via that same rule.
     */
    deniedCode?: string;
}

/** Runtime shape for one entry of `shared/authorization-keys.yaml`'s `keys` list. */
const permissionKeySchema = z.object({
    key: z.string(),
    module: z.string(),
    subject: z.string(),
    action: z.enum(PERMISSION_ACTIONS),
    scope: z.enum(AUTHORIZATION_SCOPES),
    description: z.string(),
    stepUp: stepUpTierSchema.optional(),
    conditions: z.record(z.string(), z.unknown()).optional(),
    deniedCode: z.string().optional()
}) satisfies z.ZodType<PermissionKey>;

/** A role the seeders create, and the keys it holds. Roles are data; the keys they name are not. */
export interface PresetRole {
    name: string;
    scope: AuthorizationScope;
    title: string;
    description: string;
    permissions: readonly string[];
}

/** Runtime shape for one entry of `shared/authorization-roles.yaml`'s `roles` list. */
const presetRoleSchema = z.object({
    name: z.string(),
    scope: z.enum(AUTHORIZATION_SCOPES),
    title: z.string(),
    description: z.string(),
    permissions: z.array(z.string())
}) satisfies z.ZodType<PresetRole>;

/**
 * The full shape of `shared/authorization-keys.yaml`. `version`, `actions` and `scopes` are
 * validated for shape (a malformed one should still fail loudly) even though only `keys` is read
 * downstream today. Exported so a unit test can assert on malformed fixtures directly, rather than
 * reaching for the private `readShared`/filesystem path this module resolves at import.
 */
export const keysDocumentSchema = z.object({
    version: z.number(),
    actions: z.array(z.enum(PERMISSION_ACTIONS)),
    scopes: z.record(z.enum(AUTHORIZATION_SCOPES), z.string()),
    keys: z.array(permissionKeySchema)
});

/** The full shape of `shared/authorization-roles.yaml`. See {@link keysDocumentSchema}. */
export const rolesDocumentSchema = z.object({
    version: z.number(),
    roles: z.array(presetRoleSchema),
    anonymous: z.object({
        name: z.string(),
        scope: z.enum(AUTHORIZATION_SCOPES),
        permissions: z.array(z.string())
    })
});

/** The repo-root `shared/` directory every authorization YAML file lives under. */
const SHARED = path.join(__dirname, '..', '..', 'shared');

/**
 * Parse one shared authorization file against `schema`, failing loudly and specifically — the
 * "parse, don't validate" boundary this file's docblock promises. A YAML syntax error surfaces
 * from `parse` itself; a shape error surfaces here, naming the file, the offending path and what
 * was expected, via {@link z.prettifyError}.
 * @param file - the filename under `shared/`
 * @param schema - the Zod schema the parsed document must satisfy
 * @throws Error naming `file` and every issue `schema` found
 */
const readShared = <T>(file: string, schema: z.ZodType<T>): T => {
    const parsed: unknown = parse(readFileSync(path.join(SHARED, file), 'utf8'));
    const result = schema.safeParse(parsed);

    if (!result.success) {
        throw new Error(
            `[permissions] shared/${file} does not match its schema:\n${z.prettifyError(result.error)}`
        );
    }

    return result.data;
};

/** The parsed, validated `authorization-keys.yaml`. */
const keysDocument = readShared('authorization-keys.yaml', keysDocumentSchema);

/** The parsed, validated `authorization-roles.yaml`. */
const rolesDocument = readShared('authorization-roles.yaml', rolesDocumentSchema);

/** Every declared key, in the order the shared file lists them. */
export const PERMISSION_KEYS: readonly PermissionKey[] = keysDocument.keys;

/**
 * Every CASL subject a declared key names, deduplicated and sorted — published on
 * `GET /account/abilities` so a client's `meta.can` rules can be typed against the real set
 * instead of an unchecked string.
 */
export const PERMISSION_SUBJECTS: readonly string[] = [
    ...new Set(PERMISSION_KEYS.map((entry) => entry.subject))
].toSorted();

/** The preset roles a deployment starts with, and may edit afterwards. */
export const PRESET_ROLES: readonly PresetRole[] = rolesDocument.roles;

/** What an unauthenticated request resolves to — a value in the model, not a null to handle. */
export const ANONYMOUS_ROLE = rolesDocument.anonymous;

/** Every declared key, indexed by its own name for {@link findKey}'s O(1) lookup. */
const byKey = new Map(PERMISSION_KEYS.map((entry) => [entry.key, entry]));

/**
 * What every caller of {@link findRole} actually reads off its result — `anonymous` in
 * `shared/authorization-roles.yaml` carries no `title`/`description`, so this is the true shared
 * shape rather than a cast pretending it does.
 */
export type RoleLookup = Pick<PresetRole, 'name' | 'scope' | 'permissions'>;

/** Every preset role plus `anonymous`, indexed by name for {@link findRole}'s O(1) lookup. */
const byRoleName = new Map<string, RoleLookup>(
    [...PRESET_ROLES, ANONYMOUS_ROLE].map((role) => [role.name, role])
);

/**
 * A preset role by name, or `undefined`.
 *
 * A deployment may add roles at runtime, so an unknown name here is not automatically a mistake —
 * it is a role this build did not ship. What it must never be is a caller with no permissions and
 * no complaint, which is why `permissionsOfRole` throws instead of returning an empty list.
 */
export const findRole = (name: string): RoleLookup | undefined => byRoleName.get(name);

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
 * never acts over the installation — a stranger still browses the one shop, `DEPLOYMENT_TENANT_ID`.
 *
 * @throws Error if `shared/authorization-roles.yaml` ever moves `anonymous` out of tenant scope —
 *   the discriminated `Caller` union needs the literal, and this is what keeps it honest against
 *   the file rather than merely asserting it in a comment.
 */
export const anonymousCaller = (): Caller => {
    if (ANONYMOUS_ROLE.scope !== 'tenant') {
        throw new Error(
            '[permissions] the anonymous role must stay tenant-scoped — a stranger has no ' +
                'installation to operate, only a shop to browse.'
        );
    }

    return {
        id: null,
        tenantId: DEPLOYMENT_TENANT_ID,
        scope: 'tenant',
        permissions: ANONYMOUS_ROLE.permissions,
        unrestricted: holdsEveryDeclaredKey('tenant', ANONYMOUS_ROLE.permissions)
    };
};

/** A declared key by name, or `undefined`. Wildcards are not declared keys and never resolve. */
export const findKey = (key: string): PermissionKey | undefined => byKey.get(key);

/**
 * Refuse a key no module declares — on ASSIGNMENT, not at check time.
 *
 * At check time an undeclared key is merely inert, which reads as a role that grants nothing and
 * looks like a role that grants something. Failing where the grant is made is the only place the
 * mistake is still attached to whoever made it.
 *
 * @throws Error when no module declares the key
 */
export const assertDeclared = (key: string): void => {
    if (byKey.has(key)) {
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
 * @param key - the permission key about to be checked, e.g. `orders.self.read` or `platform.tenants.any.read`
 * @returns the caller as the evaluator sees them, in the key's scope
 */
export const callerFor = (context: AuthContext, key: string): Caller =>
    callerInScope(context, scopeOfKey(key));

/**
 * Every key a caller holds in a scope: their role's, never fewer than the anonymous baseline.
 *
 * No role:  the anonymous role's keys, so a denial comes from the model rather than from an
 *           accident of assembly.
 * A role:   that role's keys UNIONED with the baseline — signing in may only ever widen what a
 *           person can see. Without the union a role is free to hold nothing a visitor holds, and
 *           `accessibleBy` then compiles an empty-result filter for a collection the same person
 *           could read while logged out: the shop's catalogue disappearing on login, reported as
 *           an empty shop rather than as a refusal.
 * Scope:    the baseline is the anonymous role's own, and applies only there. Folding bare tenant
 *           keys into a PLATFORM caller is the privilege confusion the two-scope split exists to
 *           prevent — an operator administers the installation and reads no shop's rows.
 *
 * Exported for `@modules/api-keys/module.ts`'s own floor check — re-deriving a minter's CURRENT
 * permissions is the same "never trust a cached list" shape this file's own callers already need.
 */
export const keysInScope = (
    roleName: string | null,
    scope: AuthorizationScope
): readonly string[] => {
    const held = roleName ? permissionsOfRole(roleName) : [];

    if (scope !== ANONYMOUS_ROLE.scope) {
        return roleName ? held : [];
    }

    return [...new Set([...held, ...ANONYMOUS_ROLE.permissions])];
};

/**
 * The `Caller` an `AuthContext` becomes in a named scope — the primitive {@link callerFor} and
 * {@link callerForSubject} both resolve to.
 *
 * Overloaded on `scope`, because the argument already decides the arm: a literal `'tenant'` gets a
 * `TenantCaller` whose `tenantId` is a `string`, so a caller built for a shop needs no narrowing
 * back. A `scope` only known at runtime still gets the union.
 *
 * @param context - the resolved session
 * @param scope - which of the two worlds this request acts in
 */
export function callerInScope(context: AuthContext, scope: 'tenant'): TenantCaller;
export function callerInScope(context: AuthContext, scope: 'platform'): PlatformCaller;
export function callerInScope(context: AuthContext, scope: AuthorizationScope): Caller;
export function callerInScope(context: AuthContext, scope: AuthorizationScope): Caller {
    if (scope === 'platform') {
        const permissions = keysInScope(context.roles.platform, scope);
        return {
            id: context.id,
            // Platform scope is tenant-less by definition; carrying a tenantId here would let a
            // platform rule be narrowed by a shop it does not belong to.
            tenantId: null,
            scope,
            permissions,
            unrestricted: holdsEveryDeclaredKey(scope, permissions)
        };
    }

    const permissions = keysInScope(context.roles.tenant, scope);
    return {
        id: context.id,
        tenantId: context.tenantId,
        scope,
        permissions,
        unrestricted: holdsEveryDeclaredKey(scope, permissions)
    };
}

/**
 * Which scope a SUBJECT's rows live in, read from the keys that declare it.
 *
 * A scope-narrowing rule knows its subject (`Order`, `Product`) but no single key, so this is how
 * it reaches a caller. Defaults to `tenant` for a subject nothing declares — the narrower of the
 * two, so an unknown subject is restricted rather than opened.
 */
const scopeOfSubject = (subject: string): AuthorizationScope =>
    PERMISSION_KEYS.find((entry) => entry.subject === subject)?.scope ?? 'tenant';

/** The `Caller` an `AuthContext` becomes for a SUBJECT's rows — see {@link scopeOfSubject}. */
export const callerForSubject = (context: AuthContext, subject: string): Caller =>
    callerInScope(context, scopeOfSubject(subject));

/**
 * Every key declared in one scope — the set a caller must hold entirely to count as unrestricted,
 * now that no single wildcard token stands in for it. Computed once: `PERMISSION_KEYS` is fixed
 * for the process's lifetime.
 */
const declaredKeysOfScope = new Map<AuthorizationScope, readonly string[]>(
    AUTHORIZATION_SCOPES.map((scope) => [
        scope,
        PERMISSION_KEYS.filter((entry) => entry.scope === scope).map((entry) => entry.key)
    ])
);

/**
 * Holds every key a scope declares — the property "unrestricted" actually tests, independent of
 * any particular `Caller` shape. `callerInScope` calls this directly (a `Caller` isn't built yet
 * at that point — this is what its own `unrestricted` field is filled from); {@link isUnrestricted}
 * is the same question asked of one already built.
 */
const holdsEveryDeclaredKey = (
    scope: AuthorizationScope,
    permissions: readonly string[]
): boolean => {
    const held = new Set(permissions);
    return (declaredKeysOfScope.get(scope) ?? []).every((key) => held.has(key));
};

/**
 * Does this caller hold EVERY declared key in their own scope — unrestricted, within that scope
 * only.
 *
 * Role names are data a deployment may rename or add to; "holds every key" is a property of the
 * permission model itself, which is why `requirePermission` and the domain actor ask this rather
 * than comparing a name. There is no single token for it: `admin` is unrestricted because
 * `authorization-roles.yaml` lists every tenant key by name, not because it holds a shortcut that
 * means the same thing — see `authorization-keys.yaml`'s closing note. Equivalent to reading
 * `caller.unrestricted`, kept for callers that only have a permission list without a full `Caller`.
 */
export const isUnrestricted = (caller: Pick<Caller, 'scope' | 'permissions'>): boolean =>
    holdsEveryDeclaredKey(caller.scope, caller.permissions);

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
    roles: { tenant: 'admin', platform: null },
    tenantId: DEPLOYMENT_TENANT_ID,
    authTime: 0,
    amr: [],
    analyticsConsent: false
};

/**
 * Is this ROLE unrestricted in its scope — the audit trail's word for "admin"?
 *
 * Roles are data a deployment may rename or add to; the trail's vocabulary is closed and its
 * values outlive them. So the question asked of a role name is never "is it called admin" but
 * "does it hold every key its scope declares", which stays true through any renaming.
 *
 * @param name - a role name, or `null`/`undefined` for an account with none in that scope
 * @param scope - which world the question is about; the shop unless stated
 */
export const isUnrestrictedRole = (
    name: string | null | undefined,
    scope: AuthorizationScope = 'tenant'
): boolean => (name ? holdsEveryDeclaredKey(scope, permissionsOfRole(name)) : false);
