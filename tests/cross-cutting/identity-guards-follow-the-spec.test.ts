/**
 * Deny by default, held in one place: the contract says which operations need a caller, and the
 * route table says which routes ask for one. Both directions must agree.
 *
 * - A route the spec marks as needing a credential mounts the guard that scheme names. Without
 *   this, a route that loses its `isAuth` simply drops out of the authorization sweep's list
 *   (`tests/contract/authorization-contract.test.ts` picks routes BY the guard) instead of
 *   failing.
 * - A route that mounts an identity guard is one the spec marks as needing a credential. An
 *   undocumented lock is a route a client was never told about.
 *
 * Which guard a scheme names is read off the spec's own scheme names (`bearerAuth` and
 * `apiKeyAuth` are the identity guards, `cookieAuth` the cookie guard, `metricsBearer` the scrape
 * token), not off a second list of routes. An operation with `security: []`, or with an empty
 * alternative that makes the credential optional, must mount none of them.
 *
 * Route table and bundled spec only: no database, so it runs in the commit gate and under Stryker,
 * which has no mutator that removes an argument and so cannot see a guard dropped from a route.
 *
 * See: docs/tools/contract-testing.md
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { everyMountedRoute, type MountedRoute } from '@tests/contract-routes';
import { REPO_ROOT } from '@tests/paths';
import { identityGuardIndex } from '@tests/routes';

/** One alternative of an operation's `security`: scheme name → scopes. */
type Requirement = Record<string, string[]>;

/** The slice of the bundled spec this file reads. */
interface SpecDocument {
    paths: Record<string, Record<string, { security?: Requirement[] }>>;
}

/** The guard each credential scheme of the spec is checked by. */
const GUARD_OF_SCHEME = {
    cookieAuth: 'requirePermissionViaCookieGuard',
    metricsBearer: 'isMetricsScraper'
} as const;

/** The two schemes a session or an API key travels under: both are checked by an identity guard. */
const IDENTITY_SCHEMES = new Set(['bearerAuth', 'apiKeyAuth']);

/** How the spec says an operation is reached. */
interface Access {
    /** Whether a request with no credential is one of the accepted shapes. */
    optional: boolean;
    /** Every scheme named by any alternative. */
    schemes: Set<string>;
}

const spec = parse(readFileSync(path.join(REPO_ROOT, 'openapi.yaml'), 'utf8')) as SpecDocument;

/** `METHOD /spec/{path}` → how the spec says it is reached. */
const accessByOperation = new Map<string, Access>(
    Object.entries(spec.paths).flatMap(([specPath, item]) =>
        ['get', 'post', 'put', 'patch', 'delete']
            .filter((method) => method in item)
            .map((method): [string, Access] => {
                const security = item[method].security ?? [];
                return [
                    `${method.toUpperCase()} ${specPath}`,
                    {
                        // `[]` is public; an empty alternative `{}` makes the list optional.
                        optional:
                            security.length === 0 ||
                            security.some((alternative) => Object.keys(alternative).length === 0),
                        schemes: new Set(
                            security.flatMap((alternative) => Object.keys(alternative))
                        )
                    }
                ];
            })
    )
);

/** A route's operation key, spelled the way the spec spells it. */
const operationOf = (route: MountedRoute): string =>
    `${route.method} ${route.path.replaceAll(/:(\w+)/g, '{$1}').replace(/\/$/, '')}`;

/**
 * The operations the app answers itself, outside every module's router (`src/app.ts`), so the
 * route table cannot see them. All of them are public in the spec; the canary below counts them,
 * so a route added at the app level fails here until it is listed.
 */
const APP_LEVEL_OPERATIONS = [
    'GET /',
    'GET /livez',
    'GET /readyz',
    'GET /.well-known/security.txt'
];

const mounted = everyMountedRoute().map((route) => ({ route, operation: operationOf(route) }));

describe('the route table and the contract agree on who must be signed in', () => {
    it('reads every mounted route against an operation of the spec, and the other way round', () => {
        const undocumented = mounted
            .filter(({ operation }) => !accessByOperation.has(operation))
            .map(({ operation }) => operation);
        const mountedKeys = new Set(mounted.map(({ operation }) => operation));
        const unmounted = [...accessByOperation.keys()].filter(
            (operation) => !mountedKeys.has(operation)
        );

        expect({ undocumented, unmounted }).toEqual({
            undocumented: [],
            unmounted: APP_LEVEL_OPERATIONS
        });
        // Exact, not "at least": the walk covers every operation, or it fails.
        expect(mounted.length + APP_LEVEL_OPERATIONS.length).toBe(accessByOperation.size);
    });

    it.each(mounted.map(({ route, operation }) => [operation, route] as const))(
        '%s mounts exactly the guard its security names',
        (operation, route) => {
            const access = accessByOperation.get(operation);
            const needsIdentity =
                !access?.optional &&
                [...(access?.schemes ?? [])].some((s) => IDENTITY_SCHEMES.has(s));

            expect(identityGuardIndex(route.guards) >= 0).toBe(needsIdentity);

            for (const [scheme, guard] of Object.entries(GUARD_OF_SCHEME))
                expect(route.guards.includes(guard)).toBe(
                    !access?.optional && access?.schemes.has(scheme) === true && !needsIdentity
                );
        }
    );
});
