/**
 * @module
 * Contract-derived authorization sweep: every route that mounts an identity guard must answer 401
 * to a callerless request, and every route behind `requirePermission` must agree with
 * `shared/authorization-roles.yaml` for EACH tenant persona a person can log in as: the two
 * audiences with no stored role (`unverified`, `customer` — an account with no membership IS the
 * customer), and every preset tenant role, the administrator included. One table-driven case per
 * route, rather than one hand-written 401/403 case per module's own contract file: the guard
 * wiring per route is one fact per route, asserted here instead of 40-odd times over.
 *
 * This file proves a mounted guard answers right over HTTP. That no route is MISSING its guard is
 * `tests/cross-cutting/identity-guards-follow-the-spec.test.ts`'s: it picks routes by the spec,
 * where this file picks them by the guard, so a route that lost its guard would drop out of the
 * list here instead of failing. A module's contract file asserts a 401 or a 403 only when it
 * checks more than the status (an error `code`, a row left untouched).
 *
 * `request-contract.test.ts` is this file's mirror image, sweeping request BODIES against the
 * contract instead of AUTHORIZATION.
 *
 * Path parameters are filled with a syntactically valid, nonexistent id. The guard always runs
 * before any per-field validation (`@tests/routes`' `applies`-then-`chain` order), so what the id
 * resolves to cannot change a 401/403 outcome — a route where it did would be the defect this
 * sweep exists to catch.
 *
 * WHY THIS MATTERS: a route guarded by the wrong key (`update:User` where the role file only
 * grants `read:User`) makes an ALLOWED role 403 where it should not be. Asking `holds` the same
 * question the guard itself asks is what makes "should this role reach this route" a fact the
 * test derives from the model, rather than one somebody has to keep in sync by hand.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAsRole } from '@tests/http';
import { everyMountedRoute } from '@tests/contract-routes';
import { holds } from '@kernel/ability';
import { callerAs } from '@tests/callers';
import { PRESET_ROLES } from '@kernel/permissions';
import { identityGuardIndex } from '@tests/routes';

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
    // Both identity guards: `isAuth` and `isAuthOrCredential` (a session or an API key).
    const requiresAuth = routes.filter((route) => identityGuardIndex(route.guards) >= 0);

    it.each(requiresAuth.map((route) => [signature(route), route] as const))(
        '%s matches the error contract when unauthenticated',
        async (_signature, route) => {
            const response = await request(route.method as HttpMethod, fillParams(route.path));

            expect(response.status).toBe(401);
        }
    );
});

/**
 * Every tenant persona a person can log in as: the two audiences with no stored role
 * (`unverified`, `customer`) and every preset tenant role, the administrator included. The
 * administrator holds no shopping key (staff and administrators do not shop) and no platform key,
 * so there are routes it is refused, and the model's `holds` says which. Derived, so a role added
 * to the YAML is never silently skipped.
 */
const TENANT_PERSONAS: readonly string[] = [
    'unverified',
    'customer',
    // `system` is the actor a job runs as: it is never assigned to an account, so nobody logs in as it.
    ...PRESET_ROLES.filter((role) => role.scope === 'tenant' && role.name !== 'system').map(
        (role) => role.name
    )
];

describe('every guarded route agrees with the role file, for every tenant persona (contract-derived)', () => {
    const guarded = routes.filter((route) => route.permissions.length > 0);

    it.each(guarded.map((route) => [signature(route), route] as const))(
        '%s answers 403 to exactly the roles that lack its rule',
        async (_signature, route) => {
            for (const role of TENANT_PERSONAS) {
                // The same question `requirePermissionGuard` asks of the caller it resolves — a
                // tenant-scope role never holds a `platform.` key, so a platform route's answer is
                // "false" for every one of these, and the loop asserts 403 across the board.
                const caller = callerAs(role);
                // A route that stacks guards (a product write asks for the product AND the
                // translation) is open only to a role that holds every one of them.
                const allowed = route.permissions.every((ask) =>
                    holds(caller, ask.action, ask.subject)
                );
                const { bearer } = await authenticateAsRole(role);
                const response = await request(
                    route.method as HttpMethod,
                    fillParams(route.path)
                ).set('Authorization', bearer);

                if (allowed) {
                    // Not necessarily 200 — a route may still 404 or 422 on a placeholder id or an
                    // empty body — but never 403: that would be the route disagreeing with the role
                    // file about a grant the file says this role holds.
                    expect(response.status).not.toBe(403);
                } else {
                    expect(response.status).toBe(403);
                }
            }
        }
    );
});
