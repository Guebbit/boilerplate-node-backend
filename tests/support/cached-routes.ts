/**
 * The GET routes a module mounts behind `privateNoCache` or `setCache`, as OpenAPI paths.
 *
 * Reads the real routers back, so it needs the app's modules loaded: it belongs to tests, never
 * to the contract bundler (which would have to boot the app before the files that app imports exist).
 */
import type { RouteMount } from '@kernel/registry';
import { privateNoCache } from '@infrastructure/http/middlewares/cache';

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

/**
 * Every `privateNoCache` or `setCache` GET across one module's mounts.
 *
 * @param mounts - the module's `mounts`
 * @returns sorted OpenAPI paths
 */
export const cachedReadPaths = (mounts: readonly RouteMount[]): string[] =>
    mounts
        .flatMap(({ basePath, routes }) =>
            (routes.stack as Layer[]).flatMap(({ route }) =>
                route?.methods.get === true &&
                route.stack.some(({ handle }) => handle === privateNoCache || isSetCache(handle))
                    ? [toOpenApiPath(basePath, route.path)]
                    : []
            )
        )
        .toSorted();
