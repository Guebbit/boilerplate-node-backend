import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Router } from 'express';
import { effectiveRouteTable } from '@tests/routes';
import { ROUTED_MODULES } from '@tests/routed-modules';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/route-flag', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').routeFlagMock()
);
jest.mock('@infrastructure/http/middlewares/upload', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').storageMock()
);
jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);

/**
 * Guard: a controller that reads `request.authContext!` is mounted behind `isAuth`.
 *
 * `Request.authContext` is optional, correctly — it is absent until the auth middleware resolves
 * it. A controller asserting it with `!` is claiming its route is authenticated; this is the half
 * no type can carry, because whether the ROUTE is authenticated lives in `routes.ts`.
 *
 * That claim is what this file checks. A controller that starts reading the caller and is mounted
 * on a public route fails here rather than answering `undefined.id` at runtime.
 *
 * `isAuth` and NOT `isAuthOrCredential`, deliberately — this is the file that enforces the
 * difference. An `sk_...` credential resolves to `request.caller` with no `authContext` at all,
 * so a `!` read behind the credential guard is the same broken claim as a `!` read behind no
 * guard, and is reported the same way. Widening the filter to accept both guards would delete
 * the only check standing between that split and a 500.
 *
 * The second half of the question — which routes are unauthenticated — is answered from
 * {@link effectiveRouteTable}, not by reading `routes.ts` as text. Regexing the source answers a
 * weaker question: a guard written through a variable, a spread, or a multi-line `router.use`
 * reads as unguarded. By the time this runs, Express has already resolved every spelling of a
 * guard to the same stack.
 */

/** Every module directory under `src/modules/`, router or not. */
const MODULES_ROOT = path.join(__dirname, '..', '..', 'src', 'modules');
const moduleNames = (): string[] => readdirSync(MODULES_ROOT);

/**
 * A non-null ASSERTION of `authContext` — `request.authContext!` or, after destructuring,
 * `authContext!` — never an optional read (`authContext?.x`, or `authContext` passed as an
 * optional parameter to a helper like `callerScope`). Those stay unflagged on purpose: a route
 * behind `isAuthOrCredential` legitimately reads `authContext` when it is there and falls back
 * to `caller` when it is not, which is the whole point of the split guard. Matched on
 * `authContext!` alone, not `request.authContext!`, so destructuring `const { authContext } =
 * request` first does not hide the same assertion from this check.
 */
const ASSERTS_AUTH_CONTEXT = /\bauthContext!/;

/** Controllers that assert an auth context, by exported handler name. */
const handlersReadingAuthContext = (moduleRoot: string): Set<string> => {
    const controllers = path.join(moduleRoot, 'controllers');
    if (!existsSync(controllers)) return new Set();

    const names = new Set<string>();
    for (const file of readdirSync(controllers).filter((f) => f.endsWith('.ts'))) {
        const source = readFileSync(path.join(controllers, file), 'utf8');
        if (!ASSERTS_AUTH_CONTEXT.test(source)) continue;
        for (const [, name] of source.matchAll(/export const (\w+) = /g)) names.add(name);
    }
    return names;
};

/**
 * Every handler name mounted on a route that {@link effectiveRouteTable} does not report as
 * carrying `isAuth` — router-level or per-route, in the same order a real request sees them.
 */
const handlersMountedUnauthenticated = (router: Router): Set<string> => {
    const mounted = new Set<string>();
    for (const row of effectiveRouteTable(router)) {
        if ([...row.applies, ...row.chain].includes('isAuth')) continue;
        for (const handler of row.chain) mounted.add(handler);
    }
    return mounted;
};

/**
 * Every `requirePermission` key guarding a route mounted behind `isAuthOrCredential`, module by
 * module — router-level `use` or per-route, same lookup {@link handlersMountedUnauthenticated}
 * makes for `isAuth`.
 */
const permissionKeysBehindCredentialGuard = (router: Router): string[] =>
    effectiveRouteTable(router)
        .filter((row) => [...row.applies, ...row.chain].includes('isAuthOrCredential'))
        .map((row) => row.permissionKey)
        .filter((key): key is string => key !== undefined);

describe('every controller reading the caller is mounted behind isAuth', () => {
    it('finds no handler asserting an auth context its route does not guarantee', () => {
        const offenders = moduleNames().flatMap((name) => {
            const reading = handlersReadingAuthContext(path.join(MODULES_ROOT, name));
            const router = ROUTED_MODULES[name];
            if (reading.size === 0 || router === undefined) return [];

            return [...handlersMountedUnauthenticated(router)]
                .filter((handler) => reading.has(handler))
                .map((handler) => `${name}: ${handler}`);
        });

        expect(offenders).toEqual([]);
    });

    it('actually finds controllers to check', () => {
        // A canary: an empty result must mean "all guarded", never "nothing was read".
        const total = moduleNames().reduce(
            (count, name) => count + handlersReadingAuthContext(path.join(MODULES_ROOT, name)).size,
            0
        );
        expect(total).toBeGreaterThan(10);
    });
});

/**
 * The other half of `isAuthOrCredential`'s own docblock claim (`src/kernel/middlewares/
 * authorizations.ts`): every guard behind it is a tenant-scoped `<family>.any.<action>` key. A
 * `<family>.self.<action>` key behind this guard would be satisfied by
 * `callerInScope(authContext, 'tenant')` for a human caller and by nothing for a credential,
 * which is real breakage the first time a credential reaches the route — not a policing rule.
 */
describe('every requirePermission key behind isAuthOrCredential is tenant-scoped .any.', () => {
    it('finds no key with a different breadth segment', () => {
        const offenders = moduleNames().flatMap((name) => {
            const router = ROUTED_MODULES[name];
            if (router === undefined) return [];

            return permissionKeysBehindCredentialGuard(router)
                .filter((key) => !key.split('.').includes('any'))
                .map((key) => `${name}: ${key}`);
        });

        expect(offenders).toEqual([]);
    });

    it('actually finds keys to check', () => {
        // A canary matching the one above `handlersReadingAuthContext` has: an empty result must
        // mean "every key is .any.", never "no route mounts isAuthOrCredential at all".
        const total = moduleNames().reduce(
            (count, name) =>
                count +
                (ROUTED_MODULES[name] ? permissionKeysBehindCredentialGuard(ROUTED_MODULES[name]).length : 0),
            0
        );
        expect(total).toBeGreaterThan(10);
    });
});
