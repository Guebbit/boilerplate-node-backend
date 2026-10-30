/**
 * @module
 * Prints the GET routes that mount `privateNoCache` or `setCache`, as OpenAPI paths, for the bundler.
 *
 * Runs as its own process (see {@link revalidatingReads} in `openapi-bundle.ts`): reading the
 * mounted routers back is the only exact answer, and importing the whole app into the bundler
 * itself would drag every module's runtime into a build step.
 */

import { enabledModules } from '../../src/modules';
import { privateNoCache } from '../../src/infrastructure/http/middlewares/cache';

/** What the parent looks for in stdout (the app's own logger writes there too); `openapi-bundle.ts` spells the same string. */
const ROUTES_MARKER = 'PRIVATE_NO_CACHE_ROUTES=';

/** The slice of an Express router layer this walk reads (undocumented internals, pinned by `router-internals.test.ts`). */
interface Layer {
    route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: { handle: unknown }[];
    };
}

/** `setCache` returns a closure named `setCacheMiddleware` (cache.ts), the one way to spot it. */
const isSetCache = (handle: unknown): boolean =>
    typeof handle === 'function' && handle.name === 'setCacheMiddleware';

/** Express `/:id` to OpenAPI `/{id}`, and no trailing slash. */
const toOpenApiPath = (basePath: string, routePath: string): string => {
    const joined = `${basePath}${routePath}`.replaceAll(/:(\w+)/g, '{$1}');
    return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
};

/** Every `privateNoCache` or `setCache` GET across the mounted modules. */
const paths = enabledModules.flatMap(({ mounts = [] }) =>
    mounts.flatMap(({ basePath, routes }) =>
        (routes.stack as Layer[]).flatMap(({ route }) =>
            route?.methods.get === true &&
            route.stack.some(({ handle }) => handle === privateNoCache || isSetCache(handle))
                ? [toOpenApiPath(basePath, route.path)]
                : []
        )
    )
);

process.stdout.write(`\n${ROUTES_MARKER}${JSON.stringify(paths.toSorted())}\n`);
process.exit(0);
