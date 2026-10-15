/**
 * @module
 * Contract-derived authorization sweep: every route `@tests/contract-routes` finds behind `isAuth`
 * must answer 401 to a callerless request, every route behind `requirePermission` must answer 403 to a
 * logged-in non-admin, and — the sweep that closes the gap left by every intermediate tenant role
 * never being driven through the HTTP surface — every such route must agree with
 * `shared/authorization-roles.yaml` for EACH of the seven non-admin tenant roles, not just one
 * generic non-admin. `request-contract.test.ts` is this file's mirror image, sweeping request
 * BODIES against the contract instead of AUTHORIZATION. One table-driven case per route, rather
 * than one hand-written case per module's own contract file: the guard wiring per route is still
 * one fact per route, asserted here instead of 40-odd times over.
 *
 * Path parameters are filled with a syntactically valid, nonexistent id. The guard always runs
 * before any per-field validation (`@tests/routes`' `applies`-then-`chain` order), so what the id
 * resolves to cannot change a 401/403 outcome — a route where it did would be the defect this
 * sweep exists to catch.
 *
 * WHY THIS MATTERS: a route guarded by the wrong key (`update:User` where the role file only
 * grants `read:User`) makes an ALLOWED role 403 where it should not be — a bug the single-generic-caller
 * version of this sweep could never see, because that caller was always refused everywhere. Asking
 * `holds` the same question the guard itself asks is what makes "should this role reach this
 * route" a fact the test derives from the model, rather than one somebody has to keep in sync by
 * hand.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { everyMountedRoute, type MountedRoute } from '@tests/contract-routes';
import type { PermissionAsk } from '@tests/routes';
import { holds } from '@kernel/ability';
import { callerAs } from '@tests/callers';
import { isUnrestrictedRole, PRESET_ROLES } from '@kernel/permissions';

setupTestDb();

const PLACEHOLDER_ID = '000000000000000000000000';

/** `/inventory/:id` → `/inventory/000000000000000000000000`. */
const fillParams = (path: string): string => path.replaceAll(/:[^/]+/g, () => PLACEHOLDER_ID);

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/** Dispatches through supertest by method name — avoids an unsafe indexed/`any` call. */
const request = (method: HttpMethod, path: string) => {
    switch (method) {
        case 'GET': {
            return api().get(path);
        }
        case 'POST': {
            return api().post(path);
        }
        case 'PUT': {
            return api().put(path);
        }
        case 'DELETE': {
            return api().delete(path);
        }
        case 'PATCH': {
            return api().patch(path);
        }
    }
};

const routes = everyMountedRoute();
const signature = ({ method, path }: { method: string; path: string }) => `${method} ${path}`;

describe('every route requiring a caller (contract-derived)', () => {
    const requiresAuth = routes.filter((route) => route.guards.includes('isAuth'));

    it.each(requiresAuth.map((route) => [signature(route), route] as const))(
        '%s matches the error contract when unauthenticated',
        async (_signature, route) => {
            const response = await request(route.method as HttpMethod, fillParams(route.path));

            expect(response.status).toBe(401);
        }
    );
});

describe('every route requiring an admin (contract-derived)', () => {
    // A key a plain `customer` holds by design (`checkout:Cart`, the `Notification`
    // rules; see `shared/authorization-roles.yaml`) is excluded: `authenticateAs('user')` below is
    // genuinely allowed through those routes. The per-role sweep below already covers them correctly.
    const requiresAdmin = routes.filter(
        (route) =>
            route.guards.includes('requirePermissionGuard') &&
            (route.permission === undefined ||
                !holds(callerAs('customer'), route.permission.action, route.permission.subject))
    );

    it.each(requiresAdmin.map((route) => [signature(route), route] as const))(
        '%s matches the error contract for a non-admin',
        async (_signature, route) => {
            const { bearer } = await authenticateAs('user');
            const response = await request(route.method as HttpMethod, fillParams(route.path)).set(
                'Authorization',
                bearer
            );

            expect(response.status).toBe(403);
        }
    );
});

/**
 * Every tenant persona a person can log in as, except the unrestricted ones: the two audiences with
 * no stored role (`unverified`, `customer`) and every preset tenant role that does not hold every
 * declared key. `admin` and `system` are excluded for the one reason they share: they hold every
 * declared tenant key by construction, so a case for them here would just re-assert the role file
 * one key at a time — `tests/unit/kernel/permissions.test.ts` already covers that at the model
 * level, once, for every key. Derived, so a role added to the YAML is never silently skipped.
 */
const NON_ADMIN_TENANT_ROLES: readonly string[] = [
    'unverified',
    'customer',
    ...PRESET_ROLES.filter(
        (role) => role.scope === 'tenant' && !isUnrestrictedRole(role.name, 'tenant')
    ).map((role) => role.name)
];

describe('every guarded route agrees with the role file, for every non-admin role (contract-derived)', () => {
    const guarded = routes.filter(
        (route): route is MountedRoute & { permission: PermissionAsk } =>
            route.permission !== undefined
    );

    it.each(guarded.map((route) => [signature(route), route] as const))(
        '%s answers 403 to exactly the roles that lack its rule',
        async (_signature, route) => {
            for (const role of NON_ADMIN_TENANT_ROLES) {
                // The same question `requirePermissionGuard` asks of the caller it resolves — a
                // tenant-scope role never holds a `platform.` key, so a platform route's answer is
                // "false" for every one of these, and the loop asserts 403 across the board.
                const caller = callerAs(role);
                const allowed = holds(caller, route.permission.action, route.permission.subject);
                const { bearer } = await authenticateAsRole(role);
                const response = await request(
                    route.method as HttpMethod,
                    fillParams(route.path)
                ).set('Authorization', bearer);

                if (allowed) {
                    // Not necessarily 200 — a route may still 404 or 422 on a placeholder id or an
                    // empty body — but never 403: that would be the route disagreeing with the role
                    // file about a grant the file says this role holds, which is A1's exact bug.
                    expect(response.status).not.toBe(403);
                } else {
                    expect(response.status).toBe(403);
                }
            }
        }
    );
});
