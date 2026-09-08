/**
 * @module
 * Contract-derived authorization sweep: every route `@tests/contract-routes` finds behind `isAuth`
 * must answer 401 to a callerless request, and every route behind `requirePermission` must answer 403 to a
 * logged-in non-admin — mirror image of `request-contract.test.ts`, which sweeps request BODIES
 * against the contract instead of AUTHORIZATION. One table-driven case per route, rather than one
 * hand-written "matches the error contract when unauthenticated" (or "for a non-admin") per
 * module's own contract file: the guard wiring per route is still one fact per route, asserted
 * here instead of 40-odd times over.
 *
 * Path parameters are filled with a syntactically valid, nonexistent id. The guard always runs
 * before any per-field validation (`@tests/routes`' `applies`-then-`chain` order), so what the id
 * resolves to cannot change a 401/403 outcome — a route where it did would be the defect this
 * sweep exists to catch.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { everyMountedRoute } from '@tests/contract-routes';

setupTestDb();

const PLACEHOLDER_ID = '000000000000000000000000';

/** `/inventory/:id` → `/inventory/000000000000000000000000`. */
const fillParams = (path: string): string => path.replaceAll(/:[^/]+/g, PLACEHOLDER_ID);

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
            expect(response).toSatisfyApiSpec();
        }
    );
});

describe('every route requiring an admin (contract-derived)', () => {
    const requiresAdmin = routes.filter((route) => route.guards.includes('requirePermissionGuard'));

    it.each(requiresAdmin.map((route) => [signature(route), route] as const))(
        '%s matches the error contract for a non-admin',
        async (_signature, route) => {
            const { bearer } = await authenticateAs('user');
            const response = await request(route.method as HttpMethod, fillParams(route.path)).set(
                'Authorization',
                bearer
            );

            expect(response.status).toBe(403);
            expect(response).toSatisfyApiSpec();
        }
    );
});
