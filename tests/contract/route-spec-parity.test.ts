/**
 * Does the router the app MOUNTS match the contract it PUBLISHES, operation for operation?
 *
 * The route table is read from the live Express routers — each enabled module's `routes` under its
 * `basePath`, plus the system router `app/routes.ts` mounts at `/` — not from the source text, so a
 * route registered through a loop, a helper or a renamed import counts. The other side is the
 * bundled `openapi.yaml`. Compared both ways: a mounted route the spec does not declare is an
 * undocumented endpoint, a declared operation nothing serves is a promise the API breaks.
 *
 * Why `enabledModules` and not the booted app: Express 5's router stack keeps no mount paths, so a
 * booted `app` cannot say where a sub-router was mounted. The registry can.
 *
 * Out of scope on purpose:
 * - `/__test/*` — the demo extension's levers, mounted by a process option, never part of the API.
 * - `express.static` (`app/static-assets.ts`) — it has no route table and the contract declares no
 *   operation for it.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { enabledModules } from '../../src/modules';
import { router as systemRouter } from '../../src/app/system-routes';
import { routeTable } from '@tests/routes';

/** The HTTP methods an OpenAPI path item may carry as operations. */
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

/** Operation keys as `METHOD /spec/{path}`, the one spelling both sides are reduced to. */
type OperationKey = string;

/**
 * An Express path in OpenAPI spelling: `:id` becomes `{id}`.
 *
 * @param expressPath - the path as Express holds it
 */
const toSpecPath = (expressPath: string): string => expressPath.replaceAll(/:(\w+)/g, '{$1}');

/**
 * Every operation one router serves, under the prefix it is mounted at.
 *
 * @param prefix - the mount path, `''` for the root
 * @param router - the router to read back
 */
const operationsOf = (prefix: string, router: Parameters<typeof routeTable>[0]): OperationKey[] =>
    routeTable(router).map(({ method, path: routePath }) => {
        const full = `${prefix}${routePath === '/' ? '' : routePath}` || '/';
        return `${method} ${toSpecPath(full)}`;
    });

/** Every operation the app mounts: each enabled module's router, then the system router. */
const mountedOperations = (): OperationKey[] => [
    ...enabledModules.flatMap(({ basePath, routes }) =>
        basePath && routes ? operationsOf(basePath, routes) : []
    ),
    ...operationsOf('', systemRouter)
];

/** Every operation the bundled contract declares. */
const declaredOperations = (): OperationKey[] => {
    const spec = parse(readFileSync(path.resolve(__dirname, '../../openapi.yaml'), 'utf8')) as {
        paths: Record<string, Record<string, unknown>>;
    };
    return Object.entries(spec.paths).flatMap(([specPath, item]) =>
        Object.keys(item)
            .filter((method) => HTTP_METHODS.has(method))
            .map((method) => `${method.toUpperCase()} ${specPath}`)
    );
};

/** Whether an operation belongs to the demo extension rather than the API. */
const isTestLever = (operation: OperationKey): boolean => operation.includes(' /__test/');

const mounted = mountedOperations().filter((operation) => !isTestLever(operation));
const declared = declaredOperations().filter((operation) => !isTestLever(operation));

describe('mounted routes and the published contract', () => {
    it('read a route table at all, rather than comparing two empty lists', () => {
        // A walker that stopped finding routes would turn both assertions below into a vacuous pass.
        expect(mounted.length).toBeGreaterThan(100);
        expect(declared.length).toBeGreaterThan(100);
    });

    it('declares every operation the app mounts', () => {
        const declaredSet = new Set(declared);

        expect(mounted.filter((operation) => !declaredSet.has(operation)).toSorted()).toEqual([]);
    });

    it('mounts every operation the contract declares', () => {
        const mountedSet = new Set(mounted);

        expect(declared.filter((operation) => !mountedSet.has(operation)).toSorted()).toEqual([]);
    });

    it('mounts no operation twice', () => {
        // Two registrations of one method and path: the second is unreachable, and the contract
        // can only describe one of them.
        const duplicates = mounted.filter(
            (operation, index) => mounted.indexOf(operation) !== index
        );

        expect(duplicates).toEqual([]);
    });
});
