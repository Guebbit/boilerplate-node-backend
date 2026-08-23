/**
 * Does every controller read only the request sources its own contract declares?
 *
 * `readInput(request, { sources: [...] })` is a claim about a route: "a value for this endpoint
 * may arrive from params, and/or query, and/or body". `openapi.yaml` makes the same claim, per
 * operation, as `in: path` / `in: query` / `requestBody`. Nothing has ever compared the two, and
 * `docs/theory/request-input.md` lists five contract bugs found by reading them against each
 * other **by hand** — which is not a thing anyone will remember to do twice.
 *
 * This is that comparison, automated. It is also what keeps the module registry honest: a domain
 * mounts itself from its own manifest, so a wrong `basePath` or a module missing from
 * `src/modules.ts` makes real operations unreachable, and this test is the only thing that notices.
 *
 * **Direction of the assertion.** Declared sources must be a SUBSET of what the spec allows. A
 * controller reading a source the contract does not declare is undocumented input — the class of
 * bug behind "the path-form deletes read a body they did not declare". The converse (the spec
 * declaring a source no controller reads) is not asserted here: `readInput` merges every key it
 * finds, so a route can legitimately accept a declared body it never names a field of.
 *
 * **How the mapping is recovered.** Statically, from the source: `src/modules.ts` and each
 * `src/modules/<name>/module.ts` give the enabled modules and their base paths, `src/app/routes.ts`
 * gives the prefix for the system router, the router files give each mounted path and the
 * controller it calls, and the controller module gives its `readInput` declarations. No server is
 * booted — the point is to compare two written claims, and a runtime probe would only reveal what
 * one request happened to carry.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const ROOT = path.resolve(__dirname, '../..');
const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch']);

type Source = 'params' | 'body' | 'query';

interface MountedRoute {
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

/**
 * Every router file the app mounts, with the prefix it is mounted under.
 *
 * Every domain mounts itself: `src/modules/<name>/module.ts` declares a `basePath` and a router,
 * and `src/modules.ts` decides which modules are enabled. `src/app/routes.ts` mounts exactly one
 * thing by name — the system router, which belongs to no domain — and that is read too, so
 * `GET /` is held to the contract like everything else.
 */
const readMountPrefixes = (): Map<string, string> => {
    const prefixes = new Map<string, string>();

    // Enabled modules only. A module folder that exists but is absent from the `enabledModules`
    // array is absent from the build, so its routes must not count as mounted — which is exactly
    // the mistake this check should catch rather than paper over.
    const registry = read('src/modules.ts');
    const listed = new Set(
        (/enabledModules[^=]*=\s*\[([^\]]*)]/.exec(registry)?.[1] ?? '')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
    );

    for (const [, binding, name] of registry.matchAll(
        /import\s+(\w+)\s+from\s+'\.\/modules\/([^'/]+)\/module'/g
    )) {
        if (!listed.has(binding)) continue;
        const basePath = /basePath:\s*'([^']*)'/.exec(read(`src/modules/${name}/module.ts`))?.[1];
        if (basePath !== undefined)
            prefixes.set(`src/modules/${name}/routes.ts`, basePath === '/' ? '' : basePath);
    }

    // The one router `src/app/routes.ts` still names, resolved through its import so a rename of
    // the file is caught rather than silently dropping `GET /` from this check.
    const app = read('src/app/routes.ts');
    const imports = new Map<string, string>();
    for (const [, binding, module] of app.matchAll(
        /import\s+(?:\*\s+as\s+)?{?\s*(?:router\s+as\s+)?(\w+)\s*}?\s+from\s+'([^']*)'/g
    ))
        imports.set(binding, module);

    for (const [, prefix, binding] of app.matchAll(/app\.use\('([^']*)',\s*(\w+)\)/g)) {
        const module = imports.get(binding);
        if (!module) continue;
        prefixes.set(`src/app/${path.basename(module)}.ts`, prefix === '/' ? '' : prefix);
    }

    return prefixes;
};

/**
 * Maps each controller binding a router imports to the file that defines it.
 *
 * Every router reaches its own controllers relatively (`./controllers/get-products`), so the owning
 * directory is what resolves them. That is the only form there is: a controller belongs to the
 * module whose router calls it, and the module boundary forbids reaching for anyone else's.
 */
const readControllerImports = (source: string, routeFile: string): Map<string, string> => {
    const imports = new Map<string, string>();

    for (const [, bindings, module] of source.matchAll(
        /import\s*{([^}]+)}\s*from\s*'\.\/controllers\/([^']+)'/g
    ))
        for (const binding of bindings.split(','))
            imports.set(binding.trim(), `${path.dirname(routeFile)}/controllers/${module}.ts`);

    return imports;
};

/**
 * Every route the app mounts, with the controller that terminates it.
 *
 * The controller is taken as the LAST identifier in the `router.method(...)` argument list —
 * everything before it is middleware, and `routeFlag('hardDelete')` in particular is a call, not
 * a bare identifier, so it never wins.
 */
const readMountedRoutes = (): MountedRoute[] => {
    const prefixes = readMountPrefixes();
    const routes: MountedRoute[] = [];

    for (const [routeFile, prefix] of prefixes) {
        let source: string | undefined;
        try {
            source = read(routeFile);
        } catch {
            continue;
        }
        const imports = readControllerImports(source, routeFile);

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
 * `SURFACE_SOURCES` as `@infrastructure/http/request` declares it, read from the source rather
 * than imported.
 *
 * Read, not duplicated: a copy here would drift the moment a surface is added, and a fifth row is
 * exactly the change this comparison exists to police. Read STATICALLY rather than imported
 * because importing that module pulls in express, mongoose and i18next to answer a question about
 * four lines of literal — this whole test compares two written claims and boots nothing.
 *
 * The `expect` below is deliberate. A regex that stops matching is how this check went quiet the
 * last time (see `readDeclaredSources`), and a table that parsed to `{}` would make every
 * declaration below read as "declares nothing" and every assertion pass vacuously.
 */
const readSurfaceSources = (): Record<string, Source[]> => {
    const block = /SURFACE_SOURCES[^=]*=\s*{([^}]*)}/.exec(
        read('src/infrastructure/http/request.ts')
    )?.[1];
    const table: Record<string, Source[]> = {};

    for (const [, surface, list] of (block ?? '').matchAll(/(\w+):\s*\[([^\]]*)]/g))
        table[surface] = [...list.matchAll(/'(params|body|query)'/g)].map(
            ([, name]) => name as Source
        );

    return table;
};

const SURFACE_SOURCES = readSurfaceSources();

/**
 * Controllers that declare nothing themselves because a shared factory declares it for them.
 *
 * `createDeleteController` IS the delete controller — the module file is a six-line spec of what
 * makes that entity's delete different — so the sources it reads are the module's sources, and a
 * scanner that only looked at the module file would find an empty declaration and wave all three
 * delete controllers through.
 */
const SHARED_DECLARATION_FILES: Record<string, string> = {
    'createDeleteController(': 'src/infrastructure/http/delete-controller.ts'
};

/**
 * The sources a controller module declares.
 *
 * A controller names a SURFACE — `surface: 'delete'` — and the table above maps that to the
 * sources it reads. This used to scan for `sources: ['params', ...]`, the spelling that predates
 * the surface refactor; when the last of those disappeared the regex kept matching nothing and
 * this check passed for every controller in the repo without reading a single declaration. Hence
 * the tripwire test below, which asserts the scanner still finds declarations at all.
 *
 * `extractAndValidateId` is folded in because it is `readInput` with the same surface parameter
 * that happens to also respond — a controller calling it reads those sources just as surely as if
 * it had written them out. Its surface is the optional fourth argument, defaulting to `'write'`.
 */
const readDeclaredSources = (controllerFile: string, seen = new Set<string>()): Set<Source> => {
    // A shared factory is followed once; the guard is for a cycle, not for performance.
    if (seen.has(controllerFile)) return new Set();
    seen.add(controllerFile);

    const source = read(controllerFile);
    const declared = new Set<Source>();

    const add = (surface: string) => {
        for (const name of SURFACE_SOURCES[surface] ?? []) declared.add(name);
    };

    for (const [, surface] of source.matchAll(/surface:\s*'(\w+)'/g)) add(surface);

    for (const [, argumentList] of source.matchAll(/extractAndValidateId\(([^)]*)\)/g)) {
        // The surface is the last argument when it is given at all. A trailing string that is not
        // a surface name is the three-argument form, whose default the signature spells `'write'`.
        const trailing = /'(\w+)'\s*$/.exec(argumentList.trim())?.[1];
        add(trailing !== undefined && trailing in SURFACE_SOURCES ? trailing : 'write');
    }

    for (const [marker, file] of Object.entries(SHARED_DECLARATION_FILES))
        if (source.includes(marker))
            for (const name of readDeclaredSources(file, seen)) declared.add(name);

    return declared;
};

/**
 * The slice of OpenAPI this test reads. Narrow on purpose: a full spec type would be a large
 * dependency to carry for three fields, and anything this does not name is something the
 * comparison does not look at.
 */
interface SpecParameter {
    in?: string;
    $ref?: string;
}

interface SpecOperation {
    parameters?: SpecParameter[];
    requestBody?: unknown;
}

type SpecPathItem = Record<string, SpecOperation | undefined> & {
    parameters?: SpecParameter[];
};

interface Spec {
    paths: Record<string, SpecPathItem>;
    components?: { parameters?: Record<string, SpecParameter> };
}

/**
 * Follow a `#/components/parameters/X` reference to the parameter it names.
 *
 * Local references only, which is all the bundle contains: `npm run contracts:bundle` resolves
 * every module's `../../../shared/contracts/...` reference into `#/components/...` on the way in.
 */
const resolveParameter = (spec: Spec, reference?: string): SpecParameter | undefined => {
    const name = /^#\/components\/parameters\/(.+)$/.exec(reference ?? '')?.[1];
    return name === undefined ? undefined : spec.components?.parameters?.[name];
};

/** The sources `openapi.yaml` allows for one operation. */
const readAllowedSources = (
    spec: Spec,
    specPath: string,
    method: string
): Set<Source> | undefined => {
    const pathItem = spec.paths[specPath];
    const operation = pathItem?.[method];
    if (!operation) return undefined;

    const allowed = new Set<Source>();
    const parameters: SpecParameter[] = [
        ...(pathItem.parameters ?? []),
        ...(operation.parameters ?? [])
    ];

    for (const parameter of parameters) {
        // Resolved, not guessed from the name. This used to read `$ref.includes('Path')` on the
        // claim that "every shared parameter in this spec is a path parameter" — which was never
        // true (`PageParam`, `TextParam` and `IdParam` are all `in: query`) and survived only
        // because every route using them also had an inline query parameter to be found instead.
        // The bundle inlines every component, so the reference resolves here with no I/O.
        const location = parameter.in ?? resolveParameter(spec, parameter.$ref)?.in;
        if (location === 'path') allowed.add('params');
        if (location === 'query') allowed.add('query');
    }

    // A path template always supplies params, whether or not the operation lists the parameter.
    if (specPath.includes('{')) allowed.add('params');
    if (operation.requestBody) allowed.add('body');

    return allowed;
};

const spec = parse(read('openapi.yaml')) as Spec;
const mountedRoutes = readMountedRoutes();

describe('request sources agree with openapi.yaml', () => {
    it('recovered the route table from the source', () => {
        // A regex that silently stops matching would turn every assertion below into a vacuous
        // pass. This is the tripwire for that.
        expect(mountedRoutes.length).toBeGreaterThan(30);
    });

    /**
     * The check below is a subset assertion, and a subset assertion over an empty set passes. Both
     * halves of it are recovered by regex from source that is free to be re-spelled, and both have
     * gone quiet in this repo's history: `SURFACE_SOURCES` parsed from a table whose name could
     * change, and `readDeclaredSources` scanning for a `sources: [...]` spelling that no longer
     * exists. Neither failure would have shown up as a red test — the suite would simply have
     * stopped comparing anything, which is worse than not having the test.
     *
     * So: assert the scanner found the table, and that it recovers a declaration from a
     * substantial share of the controllers rather than from none.
     */
    it('recovered the surface table and the declarations that use it', () => {
        // Pinned, not merely non-empty. `RequestSurface` is a CLOSED set on purpose — precedence
        // is meant to be a property of the route's kind, not an ordering the newest controller
        // picked — so a sixth row should fail here once and be added deliberately, alongside its
        // row in `docs/theory/request-input.md` and a look at what the spec declares for it.
        expect(Object.keys(SURFACE_SOURCES).toSorted()).toEqual([
            'delete',
            'list',
            'path',
            'search',
            'write'
        ]);

        const controllerFiles = new Set(
            mountedRoutes.map(({ controllerFile }) => controllerFile).filter(Boolean) as string[]
        );
        const declaring = [...controllerFiles].filter((file) => readDeclaredSources(file).size > 0);

        expect(declaring.length).toBeGreaterThan(10);
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
     * `surface: 'search'`; asserting that declaration against either route alone would
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
        const byController = new Map<string, MountedRoute[]>();
        for (const route of mountedRoutes) {
            if (!route.controllerFile) continue;
            const existing = byController.get(route.controllerFile) ?? [];
            existing.push(route);
            byController.set(route.controllerFile, existing);
        }

        const violations: string[] = [];

        for (const [controllerFile, routes] of byController) {
            const allowed = new Set<Source>();
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
