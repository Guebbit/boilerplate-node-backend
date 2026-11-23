/**
 * @module
 * Contract-derived authorization sweep. Every route that mounts an identity guard answers 401 to
 * a callerless request, and every route behind `requirePermission` agrees with
 * `shared/rules/authorization-roles.yaml` for EACH tenant persona: the two audiences with no
 * stored role (`unverified`, `customer`; no membership IS the customer) and every preset tenant
 * role, the administrator included. One table-driven case per route, instead of a 401/403 case in
 * each module's contract file.
 *
 * Picks routes:   by the guard. That no route is MISSING its guard is
 *                 `tests/cross-cutting/identity-guards-follow-the-spec.test.ts`, which picks by the
 *                 spec; a route that lost its guard drops out of this list instead of failing.
 * Siblings:       `ownership-contract.test.ts` aims a role that DOES reach a route at another
 *                 customer's row; `request-contract.test.ts` sweeps request BODIES.
 * Module files:   assert a 401 or 403 only when they check more than the status.
 * Path params:    a valid, nonexistent id. The guard runs before per-field validation (`@tests/routes`'
 *                 `applies`-then-`chain` order), so the id cannot change a 401/403; a route where
 *                 it did is the defect this sweep exists to catch.
 * Why:            a route guarded by the wrong key (`update:User` where the file grants only
 *                 `read:User`) 403s an ALLOWED role. Asking `holds` what the guard asks makes the
 *                 answer derived from the model, not kept in sync by hand.
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

/** A well-formed id no record has, so a route is reached without a real resource. */
const PLACEHOLDER_ID = '000000000000000000000000';

/** `/inventory/:id` → `/inventory/000000000000000000000000`. */
const fillParams = (path: string): string => path.replaceAll(/:[^/]+/g, () => PLACEHOLDER_ID);

/** The verbs a route can be mounted with. */
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

/** Every mounted route, as the real router lists them. */
const routes = everyMountedRoute();

/** A route written as `METHOD path`, the key the cases compare on. */
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
 * administrator holds no platform key, so there are routes it is refused, and the model's `holds`
 * says which. Derived, so a role added
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
                /**
                 * The same question `requirePermissionGuard` asks of the caller it resolves — a
                 * tenant-scope role never holds a `platform.` key, so a platform route's answer is
                 * "false" for every one of these, and the loop asserts 403 across the board.
                 */
                const caller = callerAs(role);
                /**
                 * A route that stacks guards (a write to translated content asks for the record AND the
                 * translation) is open only to a role that holds every one of them.
                 */
                const allowed = route.permissions.every((ask) =>
                    holds(caller, ask.action, ask.subject)
                );
                const { bearer } = await authenticateAsRole(role);
                const response = await request(
                    route.method as HttpMethod,
                    fillParams(route.path)
                ).set('Authorization', bearer);

                /**
                 * Allowed is not necessarily 200 — a route may still 404 or 422 on a placeholder id or
                 * an empty body — but never 403: that would be the route disagreeing with the role
                 * file about a grant the file says this role holds.
                 */
                expect(response.status === 403).toBe(!allowed);
            }
        }
    );
});
