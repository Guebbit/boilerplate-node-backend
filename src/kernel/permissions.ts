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
 * rule — see `module-config.ts` for the same stance about configuration.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import type {
    AuthContext,
    AuthorizationScope,
    Caller,
    CallerContext,
    PlatformCaller,
    TenantCaller
} from '@types';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { PERMISSION_ACTIONS, type PermissionAction } from '@api/permission-actions';

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
 * The action vocabulary a declared KEY may carry, generated from `shared/authorization-keys.yaml`'s
 * `actions:` so the type and the Zod schema below draw on the one list. `manage` is deliberately
 * absent: there is no wildcard of any kind, so nothing declares it as ITS action.
 * See docs/tools/permission-actions.md.
 */
export type { PermissionAction } from '@api/permission-actions';

/** The two scopes a key or role may carry — kept here as a runtime array purely to validate the shared YAML against {@link AuthorizationScope} without duplicating the literal elsewhere. */
const AUTHORIZATION_SCOPES = [
    'tenant',
    'platform'
] as const satisfies readonly AuthorizationScope[];

/** How recently a caller must have proved themselves to use a key that demands it. */
export type StepUpTier = 'critical' | 'sensitive';

/** Runtime validator for {@link StepUpTier}, applied to the shared YAML's `stepUp` fields. */
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
     * Checked against the generated error-code catalogue by
     * `tests/cross-cutting/authorization-keys.test.ts`, not here: this module is read at BOOT,
     * before `npm run regenerate`'s own `contracts:bundle` step (which loads this module
     * transitively, to build the sample client collections) has produced `@api/error-codes` yet —
     * a plain `string` here breaks that ordering cycle.
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
    /**
     * `false` for a role no request may hand to an account — `system`, the actor background work
     * runs as. Absent means assignable.
     */
    assignable?: boolean;
}

/** Runtime shape for one entry of `shared/authorization-roles.yaml`'s `roles` list. */
const presetRoleSchema = z.object({
    name: z.string(),
    scope: z.enum(AUTHORIZATION_SCOPES),
    title: z.string(),
    description: z.string(),
    permissions: z.array(z.string()),
    assignable: z.boolean().optional()
}) satisfies z.ZodType<PresetRole>;

/**
 * The three audience roles, in the order a request can grow out of them.
 *
 * Never stored and never granted: {@link audienceOf} picks one per request from the session and
 * the account's `verifiedAt`.
 */
export const AUDIENCE_NAMES = ['guest', 'unverified', 'customer'] as const;

/** One of {@link AUDIENCE_NAMES}. */
export type AudienceName = (typeof AUDIENCE_NAMES)[number];

/** An audience role as `shared/authorization-roles.yaml` declares it: a name for a bundle of keys. */
export interface AudienceRole {
    title: string;
    description: string;
    permissions: readonly string[];
}

/** Runtime shape for one entry of `shared/authorization-roles.yaml`'s `audience` block. */
const audienceRoleSchema = z.object({
    title: z.string(),
    description: z.string(),
    permissions: z.array(z.string())
}) satisfies z.ZodType<AudienceRole>;

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
    audience: z.object({
        guest: audienceRoleSchema,
        unverified: audienceRoleSchema,
        customer: audienceRoleSchema
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
 * A fingerprint of a permission-key set, for `GET /account/abilities`' cache-busting `version`.
 *
 * A plain COUNT (the previous version of this) cannot tell "the same 40 keys" from "40 DIFFERENT
 * keys" — a key rename or a key-for-key swap leaves the length untouched, so a client's cached
 * rules would silently go stale. Hashing the sorted key names instead catches any change to the
 * SET: sorted first, so declaring the same keys in a different order (a YAML edit that reorders
 * without adding or removing anything) is not itself a version bump.
 *
 * `sha256`, node's own — not reimplemented — over the newline-joined, sorted names; the first 4
 * bytes of the digest, read as an unsigned integer, are enough entropy for a cache key that only
 * ever needs to change or not, never to be collision-proof against an adversary.
 * https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options
 *
 * @param keys - the declared keys' own `key` names
 * @returns a non-negative integer, stable under reordering, that changes when the SET changes
 */
export const permissionModelVersion = (keys: readonly string[]): number => {
    const digest = createHash('sha256').update(keys.toSorted().join('\n')).digest();
    return digest.readUInt32BE(0);
};

/**
 * Every CASL subject a declared key names, deduplicated and sorted — published on
 * `GET /account/abilities` so a client's `meta.can` rules can be typed against the real set
 * instead of an unchecked string.
 */
export const PERMISSION_SUBJECTS: readonly string[] = [
    ...new Set(PERMISSION_KEYS.map((entry) => entry.subject))
].toSorted();

/** Every preset role, read once at import — fixed data, not a runtime-editable set; see this module's own docblock. */
export const PRESET_ROLES: readonly PresetRole[] = rolesDocument.roles;

/**
 * The audience roles, read once at import. The keys every request holds before a staff role is
 * added: a stranger's, a signed-in account's with an unproven address, and one with a proven one.
 */
export const AUDIENCE_ROLES: Readonly<Record<AudienceName, AudienceRole>> = rolesDocument.audience;

/**
 * Is `name` one of the computed audience roles rather than a stored staff role? A staff role is
 * what a membership holds; an audience is never granted, so this is how a grant or a test persona
 * tells the two apart.
 *
 * @param name - a role or audience name
 */
export const isAudienceName = (name: string): name is AudienceName =>
    (AUDIENCE_NAMES as readonly string[]).includes(name);

/**
 * Which audience a request belongs to.
 *
 * Computed, never stored: no session is a `guest`, a session whose account has no `verifiedAt` is
 * `unverified`, and one that has it is a `customer` — staff included.
 *
 * @param context - the resolved session, or `undefined` for a request with none
 */
export const audienceOf = (context: Pick<AuthContext, 'verified'> | undefined): AudienceName => {
    if (!context) return 'guest';

    return context.verified ? 'customer' : 'unverified';
};

/** Every declared key, indexed by its own name for {@link findKey}'s O(1) lookup. */
const byKey = new Map(PERMISSION_KEYS.map((entry) => [entry.key, entry]));

/** What every caller of {@link findRole} actually reads off its result. */
export type RoleLookup = Pick<PresetRole, 'name' | 'scope' | 'permissions' | 'assignable'>;

/** Every preset role, indexed by name for {@link findRole}'s O(1) lookup. */
const byRoleName = new Map<string, RoleLookup>(PRESET_ROLES.map((role) => [role.name, role]));

/**
 * A preset role by name, or `undefined` — a plain lookup, not an assertion.
 *
 * Left as `undefined` here rather than thrown, because the two callers need different errors:
 * {@link permissionsOfRole} throws a name-only message, `access/services/grants.ts`'s `validateGrant`
 * throws a scope-aware one. Neither treats a miss as anything but a mistake — roles are fixed
 * data (see this module's own docblock), so an unknown name is never a role this deployment
 * simply hasn't heard of yet.
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
 * A value in the model rather than a null branch: `guest` is an audience role like any other,
 * declared in `shared/authorization-roles.yaml`, so "what may a stranger do" is answered in the
 * same file and by the same evaluator as every other role. Tenant scope, because an
 * unauthenticated request never acts over the installation — a stranger still browses the one
 * shop, `DEPLOYMENT_TENANT_ID`.
 */
export const anonymousCaller = (): Caller => ({
    id: null,
    tenantId: DEPLOYMENT_TENANT_ID,
    scope: 'tenant',
    permissions: AUDIENCE_ROLES.guest.permissions,
    unrestricted: false,
    system: false
});

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
 * A caller with no staff role in the key's scope still gets their audience's permissions rather
 * than an empty list, so the denial comes from the model rather than from an accident of assembly.
 *
 * @param context - the resolved session
 * @param key - the permission key about to be checked, e.g. `orders.self.read` or `platform.tenants.any.read`
 * @returns the caller as the evaluator sees them, in the key's scope
 */
export const callerFor = (context: AuthContext, key: string): Caller =>
    callerInScope(context, scopeOfKey(key));

/**
 * Every key a caller holds in a scope: their audience's, plus their staff role's.
 *
 * Tenant:   the audience role's keys UNIONED with the staff role's — signing in may only ever
 *           widen what a person can see. Without the union a role is free to hold nothing a visitor
 *           holds, and `accessibleBy` then compiles an empty-result filter for a collection the
 *           same person could read while logged out: the shop's catalogue disappearing on login,
 *           reported as an empty shop rather than as a refusal.
 * Platform: the platform role's keys alone. Folding bare tenant keys into a PLATFORM caller is the
 *           privilege confusion the two-scope split exists to prevent — an operator administers
 *           the installation and reads no shop's rows.
 *
 * Exported for `@modules/api-keys`' own floor check — re-deriving a minter's CURRENT permissions is
 * the same "never trust a cached list" shape this file's own callers already need.
 *
 * @param roleName - the staff role held in this scope, or `null` for none
 * @param scope - which world the keys are for
 * @param audience - the request's audience; `guest` when none is given, which is what an API key gets
 */
export const keysInScope = (
    roleName: string | null,
    scope: AuthorizationScope,
    audience: AudienceName = 'guest'
): readonly string[] => {
    const held = roleName ? permissionsOfRole(roleName) : [];

    if (scope !== 'tenant') {
        return held;
    }

    return [...new Set([...AUDIENCE_ROLES[audience].permissions, ...held])];
};

/**
 * `SYSTEM_ACTOR`'s id — hoisted above its own declaration so {@link assembleCaller} can compute
 * `Caller.system` without forward-referencing the constant it belongs to.
 */
const SYSTEM_ACTOR_ID = 'system';

/**
 * Assemble a `Caller` from its raw fields, `unrestricted` computed rather than trusted —
 * the one shape `callerInScope`'s two branches below, and `api-keys/module.ts`'s two
 * credential-resolution paths (the mint-time floor, then every check afterwards), each built
 * separately before this.
 *
 * @param id - who they are, `null`/`undefined` for a stranger
 * @param tenantId - the shop this caller acts in, or `null` for a platform caller
 * @param scope - which of the two worlds this caller acts in
 * @param permissions - every key this caller currently holds in `scope`
 */
export const assembleCaller = (
    id: string | null | undefined,
    tenantId: string | null,
    scope: AuthorizationScope,
    permissions: readonly string[]
): Caller =>
    // `tenantId` and `scope` are correlated by every caller of this function (`null` only ever
    // paired with 'platform', a shop id only ever paired with 'tenant') — a correlation runtime
    // code guarantees but the type checker cannot see across four independent parameters.
    ({
        id,
        tenantId,
        scope,
        permissions,
        unrestricted: holdsEveryDeclaredKey(scope, permissions),
        system: id === SYSTEM_ACTOR_ID
    }) as Caller;

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
    // Platform scope is tenant-less by definition; carrying a tenantId here would let a platform
    // rule be narrowed by a shop it does not belong to.
    const tenantId = scope === 'platform' ? null : context.tenantId;
    const permissions = keysInScope(
        scope === 'platform' ? context.roles.platform : context.roles.tenant,
        scope,
        audienceOf(context)
    );
    return assembleCaller(context.id, tenantId, scope, permissions);
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
 * Every key declared in one scope that a role has to hold itself — the set a caller must hold
 * entirely to count as unrestricted, now that no single wildcard token stands in for it. The
 * `customer` audience's keys are left out: every signed-in account gets them from its audience, so
 * a role listing them would say nothing, and an `admin` whose address is unproven must not stop
 * being unrestricted. Computed once: `PERMISSION_KEYS` is fixed for the process's lifetime.
 */
const declaredKeysOfScope = new Map<AuthorizationScope, readonly string[]>(
    AUTHORIZATION_SCOPES.map((scope) => [
        scope,
        PERMISSION_KEYS.filter(
            (entry) =>
                entry.scope === scope && !AUDIENCE_ROLES.customer.permissions.includes(entry.key)
        ).map((entry) => entry.key)
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
    const declared = declaredKeysOfScope.get(scope) ?? [];
    // A scope with nothing declared makes nobody unrestricted — `every` over an empty list is
    // vacuously true, which would mark every caller in it as an admin.
    return declared.length > 0 && declared.every((key) => held.has(key));
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
 * Its role is its own, `system`, not `admin`, so a background job's audit row never reads as an
 * admin's. `system` in `authorization-roles.yaml` aliases `admin`'s permission list through a YAML
 * anchor, unrestricted for the same reason and kept from drifting by construction, while staying an
 * identity `isSystemActor` can name apart from a real one.
 *
 * It is a value here rather than a caller assembled at each site because that is exactly the kind
 * of thing that gets assembled slightly differently the third time.
 */
export const SYSTEM_ACTOR: AuthContext = {
    id: SYSTEM_ACTOR_ID,
    email: 'system@localhost',
    username: 'system',
    roles: { tenant: 'system', platform: null },
    tenantId: DEPLOYMENT_TENANT_ID,
    authTime: 0,
    amr: [],
    twoFactorArmed: false,
    verified: true,
    analyticsConsent: false
};

/**
 * Is this caller the application acting on nobody's behalf, rather than a real account?
 *
 * `SYSTEM_ACTOR` carries `roles.tenant: 'system'`, unrestricted like `admin` — a caller asking "is
 * this a REQUEST a human made" (a lifecycle rule narrower for a background job than for an admin,
 * an audit trail distinguishing "an operator did this" from "a sweep did") needs the identity
 * question, not the scope one: the `system` ROLE is only ever unrestricted the same way `admin` is,
 * never proof of anything on its own. `id` alone: nothing
 * else on `SYSTEM_ACTOR` is unique to it, and a real account's id never collides with the literal
 * `'system'`.
 * @param caller - the caller to ask about, or `undefined` for an unauthenticated request
 */
export const isSystemActor = (caller: AuthContext | undefined): boolean =>
    caller?.id === SYSTEM_ACTOR_ID;

/**
 * The {@link CallerContext} a cron job hands `recordAudit` for a write nobody at the keyboard
 * asked for — a reaper's own hard delete, not an admin's. `caller` is {@link SYSTEM_ACTOR}'s, so
 * the resulting row's `actorRole` reads the same "unrestricted" way an admin's would; nothing
 * else on `CallerContext` is filled in, since a cron job has no IP, user agent or request id.
 *
 * @param subject - the entity being audited, e.g. `'User'` — picks tenant or platform scope the
 * same way {@link callerForSubject} does for the write itself
 */
export const systemCallerContext = (subject: string): CallerContext => ({
    caller: callerForSubject(SYSTEM_ACTOR, subject),
    analyticsConsent: false
});

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
