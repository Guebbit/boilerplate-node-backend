/**
 * Does the contract say which operations an API key can use, and say it truthfully?
 *
 * An operation lists `apiKeyAuth` in its `security` exactly when its route mounts
 * `isAuthOrCredential` and its permission has no step-up: a key can never re-authenticate, so the
 * four `users` deletes it cannot finish are not offered to it. Derived from the mounted routers,
 * so a route that gains or loses the guard fails here until the spec follows.
 *
 * The three optional product reads mount no identity guard at all (`getAuth` alone: an anonymous
 * caller reads the public catalogue, a key holding the wider keys sees drafts and stock), so the
 * guards cannot name them. They are listed by hand below, while `products` is deployed, and the
 * canary holds the list to the spec, in both directions.
 *
 * See: docs/tools/security.md#machine-to-machine-credentials
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { everyMountedRoute } from '@tests/contract-routes';
import { isDeployed, REPO_ROOT } from '@tests/paths';
import { findRule, ruleId } from '@kernel/permissions';

/** An operation's security requirements, as the bundle holds them. */
type Security = Record<string, string[]>[];

/** Operations that stay anonymous-readable but give an API key the wider view. */
const KEY_AWARE_OPTIONAL_READS = new Set(
    isDeployed('products') ? ['GET /products', 'POST /products/search', 'GET /products/{id}'] : []
);

/** `METHOD /spec/{path}` for each operation's security list, read from the bundle. */
const specSecurity = (): Map<string, Security | undefined> => {
    const spec = parse(readFileSync(path.join(REPO_ROOT, 'openapi.yaml'), 'utf8')) as {
        paths: Record<string, Record<string, { security?: Security }>>;
    };
    const rows = Object.entries(spec.paths).flatMap(([specPath, item]) =>
        ['get', 'post', 'put', 'patch', 'delete']
            .filter((method) => method in item)
            .map(
                (method) => [`${method.toUpperCase()} ${specPath}`, item[method].security] as const
            )
    );
    return new Map(rows);
};

/** Whether an operation's security lists the API key scheme. */
const listsApiKey = (security: Security | undefined): boolean =>
    security?.some((requirement) => 'apiKeyAuth' in requirement) ?? false;

const security = specSecurity();

/** Every mounted route that has an operation in the spec, keyed the way the spec spells it. */
const mounted = everyMountedRoute()
    .map((route) => ({
        route,
        operation: `${route.method} ${route.path.replaceAll(/:(\w+)/g, '{$1}').replace(/\/$/, '')}`
    }))
    .filter(({ operation }) => security.has(operation));

describe('apiKeyAuth in the contract matches the routes that admit a key', () => {
    it('reads a route table and a spec, rather than comparing two empty lists', () => {
        expect(mounted.length).toBeGreaterThan(100);
        expect([...security.values()].filter((entry) => listsApiKey(entry)).length).toBeGreaterThan(
            20
        );
    });

    it.each(mounted.map(({ route, operation }) => [operation, route] as const))(
        '%s',
        (operation, route) => {
            const admitsKey =
                route.guards.includes('isAuthOrCredential') &&
                (route.permission === undefined ||
                    findRule(ruleId(route.permission.action, route.permission.subject))?.stepUp ===
                        undefined);

            expect(listsApiKey(security.get(operation))).toBe(
                admitsKey || KEY_AWARE_OPTIONAL_READS.has(operation)
            );
        }
    );

    it('keeps the hand-listed optional reads real: mounted, optional in the spec, and no others', () => {
        const optional = [...security]
            .filter(([, entry]) =>
                entry?.some((requirement) => Object.keys(requirement).length === 0)
            )
            .map(([operation]) => operation);

        for (const operation of KEY_AWARE_OPTIONAL_READS) expect(optional).toContain(operation);
        expect(
            optional.filter((operation) => listsApiKey(security.get(operation))).toSorted()
        ).toEqual([...KEY_AWARE_OPTIONAL_READS].toSorted());
    });
});
