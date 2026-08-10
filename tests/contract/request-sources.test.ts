/**
 * Does every controller read only the request sources its own contract declares?
 *
 * `readInput(request, { sources: [...] })` is a claim about a route: "a value for this endpoint
 * may arrive from params, and/or query, and/or body". `openapi.yaml` makes the same claim, per
 * operation, as `in: path` / `in: query` / `requestBody`. Nothing has ever compared the two, and
 * `docs/theory/request-input.md` lists five contract bugs found by reading them against each
 * other **by hand** — which is not a thing anyone will remember to do twice.
 *
 * This is that comparison, automated. It is the guard rail plan 02's generated `createResourceRouter`
 * depends on: once routes are produced from a descriptor rather than written out, a typo silently
 * mounts a route the spec never declared, and this test is the only thing that would notice.
 *
 * **Direction of the assertion.** Declared sources must be a SUBSET of what the spec allows. A
 * controller reading a source the contract does not declare is undocumented input — the class of
 * bug behind "the path-form deletes read a body they did not declare". The converse (the spec
 * declaring a source no controller reads) is not asserted here: `readInput` merges every key it
 * finds, so a route can legitimately accept a declared body it never names a field of.
 *
 * **How the mapping is recovered.** Statically, from the source: `src/app.ts` gives each router's
 * mount prefix, `src/routes/*.ts` gives each mounted path and the controller it calls, and the
 * controller module gives its `readInput` declarations. No server is booted — the point is to
 * compare two written claims, and a runtime probe would only reveal what one request happened to
 * carry.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const ROOT = path.resolve(__dirname, '../..');
const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch']);

type TSource = 'params' | 'body' | 'query';

interface IMountedRoute {
    method: string;
    /** Full express path, e.g. `/products/:id/hard`. */
    expressPath: string;
    /** The same path in OpenAPI spelling, e.g. `/products/{id}/hard`. */
    specPath: string;
    /**
     * The imported controller this route terminates in, or undefined when the handler is written
     * inline — `GET /`, `GET /observability/events` and `GET /observability/metrics` are three
     * one-line responders with no module and so no `readInput` declaration to compare. They still
     * count as mounted; they are simply skipped by the sources check.
     */
    controller?: string;
    controllerFile?: string;
}

const read = (relative: string): string => readFileSync(path.join(ROOT, relative), 'utf8');

/** `app.use('/products', productRoutes)` → which route module sits under which prefix. */
const readMountPrefixes = (): Map<string, string> => {
    const app = read('src/app.ts');
    const imports = new Map<string, string>();
    for (const [, binding, module] of app.matchAll(
        /import\s+(?:\*\s+as\s+)?{?\s*(?:router\s+as\s+)?(\w+)\s*}?\s+from\s+'([^']*routes[^']*)'/g
    ))
        imports.set(binding, module);

    const prefixes = new Map<string, string>();
    for (const [, prefix, binding] of app.matchAll(/app\.use\('([^']*)',\s*(\w+)\)/g)) {
        const module = imports.get(binding);
        if (module) prefixes.set(path.basename(module), prefix === '/' ? '' : prefix);
    }
    return prefixes;
};

/** `import { deleteOrders } from '@controllers/orders/delete-orders'` → binding → file path. */
const readControllerImports = (source: string): Map<string, string> => {
    const imports = new Map<string, string>();
    for (const [, bindings, module] of source.matchAll(
        /import\s*{([^}]+)}\s*from\s*'@controllers\/([^']+)'/g
    ))
        for (const binding of bindings.split(','))
            imports.set(binding.trim(), `src/controllers/${module}.ts`);
    return imports;
};

/**
 * Every route the app mounts, with the controller that terminates it.
 *
 * The controller is taken as the LAST identifier in the `router.method(...)` argument list —
 * everything before it is middleware, and `routeFlag('hardDelete')` in particular is a call, not
 * a bare identifier, so it never wins.
 */
const readMountedRoutes = (): IMountedRoute[] => {
    const prefixes = readMountPrefixes();
    const routes: IMountedRoute[] = [];

    for (const [file, prefix] of prefixes) {
        // `import { router } from './routes'` is a directory import — the system router is
        // `src/routes/index.ts`, not `src/routes/routes.ts`.
        const candidates = file === 'routes' ? ['src/routes/index.ts'] : [`src/routes/${file}.ts`];
        let source: string | undefined;
        for (const candidate of candidates) {
            try {
                source = read(candidate);
                break;
            } catch {
                continue;
            }
        }
        if (!source) continue;
        const imports = readControllerImports(source);

        for (const [, method, routePath, argumentList] of source.matchAll(
            /router\.(get|post|put|delete|patch)\(\s*'([^']*)',([\S\s]*?)\);/g
        )) {
            const identifiers = [...argumentList.matchAll(/(\w+)\s*(?=[\s),]*$|,\s*$)/gm)]
                .map(([, name]) => name)
                .filter((name) => imports.has(name));
            const controller = identifiers.at(-1);

            const expressPath = `${prefix}${routePath === '/' ? '' : routePath}` || '/';
            routes.push({
                method,
                expressPath,
                specPath: expressPath.replaceAll(/:(\w+)/g, '{$1}'),
                controller,
                controllerFile: controller ? imports.get(controller) : undefined
            });
        }
    }
    return routes;
};

/**
 * The sources a controller module declares.
 *
 * `extractAndValidateId` is folded in because it is `readInput` with a fixed declaration
 * (`['params', 'body']`) that happens to also respond — a controller calling it reads those two
 * sources just as surely as if it had written them out.
 */
const readDeclaredSources = (controllerFile: string): Set<TSource> => {
    const source = read(controllerFile);
    const declared = new Set<TSource>();

    for (const [, list] of source.matchAll(/sources:\s*\[([^\]]*)]/g))
        for (const [, name] of list.matchAll(/'(params|body|query)'/g))
            declared.add(name as TSource);

    if (source.includes('extractAndValidateId(')) {
        declared.add('params');
        declared.add('body');
    }
    return declared;
};

/**
 * The slice of OpenAPI this test reads. Narrow on purpose: a full spec type would be a large
 * dependency to carry for three fields, and anything this does not name is something the
 * comparison does not look at.
 */
interface ISpecParameter {
    in?: string;
    $ref?: string;
}

interface ISpecOperation {
    parameters?: ISpecParameter[];
    requestBody?: unknown;
}

type TSpecPathItem = Record<string, ISpecOperation | undefined> & {
    parameters?: ISpecParameter[];
};

interface ISpec {
    paths: Record<string, TSpecPathItem>;
}

/** The sources `openapi.yaml` allows for one operation. */
const readAllowedSources = (
    spec: ISpec,
    specPath: string,
    method: string
): Set<TSource> | undefined => {
    const pathItem = spec.paths[specPath];
    const operation = pathItem?.[method];
    if (!operation) return undefined;

    const allowed = new Set<TSource>();
    const parameters: ISpecParameter[] = [
        ...(pathItem.parameters ?? []),
        ...(operation.parameters ?? [])
    ];

    for (const parameter of parameters) {
        // A `$ref`'d parameter carries its location in the reference name, which is enough:
        // every shared parameter in this spec is a path parameter.
        const location = parameter.in ?? (parameter.$ref?.includes('Path') ? 'path' : undefined);
        if (location === 'path') allowed.add('params');
        if (location === 'query') allowed.add('query');
    }

    // A path template always supplies params, whether or not the operation lists the parameter.
    if (specPath.includes('{')) allowed.add('params');
    if (operation.requestBody) allowed.add('body');

    return allowed;
};

const spec = parse(read('openapi.yaml')) as ISpec;
const mountedRoutes = readMountedRoutes();

describe('request sources agree with openapi.yaml', () => {
    it('recovered the route table from the source', () => {
        // A regex that silently stops matching would turn every assertion below into a vacuous
        // pass. This is the tripwire for that.
        expect(mountedRoutes.length).toBeGreaterThan(30);
    });

    it('every mounted route exists in the spec', () => {
        const missing = mountedRoutes
            .filter(({ specPath, method }) => !spec.paths?.[specPath]?.[method])
            .map(({ method, specPath }) => `${method.toUpperCase()} ${specPath}`);

        expect(missing).toEqual([]);
    });

    it('every spec operation is mounted', () => {
        const mounted = new Set(
            mountedRoutes.map(({ method, specPath }) => `${method} ${specPath}`)
        );
        const unmounted: string[] = [];

        for (const [specPath, item] of Object.entries(spec.paths))
            for (const method of Object.keys(item))
                if (HTTP_METHODS.has(method) && !mounted.has(`${method} ${specPath}`))
                    unmounted.push(`${method.toUpperCase()} ${specPath}`);

        expect(unmounted).toEqual([]);
    });

    /**
     * The comparison is per CONTROLLER, against the union of every route it serves — because a
     * declaration is per controller and several controllers deliberately serve several operations.
     * `getProducts` serves `GET /products` (query) and `POST /products/search` (body) from one
     * `sources: ['body', 'query']`; asserting that declaration against either route alone would
     * report the other route's source as undeclared, which is noise, not a bug.
     *
     * What survives the union is the real defect: a controller reading a source that NO route it
     * serves declares. That is the shape of every historical case in
     * `docs/theory/request-input.md` — `hardDelete` read from a `params` no route supplied,
     * `DELETE /cart/{productId}` reading a body it could never receive, the list controllers
     * reading a `params.id` only the item routes have.
     *
     * Splitting the declaration per operation is what would let this tighten to per-route, and is
     * the open question that doc's "deliberately not done yet" section holds.
     */
    it('no controller reads a source none of its routes declare', () => {
        const byController = new Map<string, IMountedRoute[]>();
        for (const route of mountedRoutes) {
            if (!route.controllerFile) continue;
            const existing = byController.get(route.controllerFile) ?? [];
            existing.push(route);
            byController.set(route.controllerFile, existing);
        }

        const violations: string[] = [];

        for (const [controllerFile, routes] of byController) {
            const allowed = new Set<TSource>();
            for (const route of routes)
                for (const source of readAllowedSources(spec, route.specPath, route.method) ?? [])
                    allowed.add(source);

            const undeclared = [...readDeclaredSources(controllerFile)].filter(
                (source) => !allowed.has(source)
            );

            if (undeclared.length > 0)
                violations.push(
                    `${routes[0].controller} (${controllerFile}) reads ${undeclared.join(', ')} — ` +
                        `no route it serves declares ${undeclared.length > 1 ? 'those' : 'that'}. ` +
                        `Routes: ${routes.map((route) => `${route.method.toUpperCase()} ${route.specPath}`).join(', ')}`
                );
        }

        // Named rather than counted: the message is the list of controllers taking undocumented
        // input, and the routes they are reachable through, which is what someone has to act on.
        expect(violations).toEqual([]);
    });
});
