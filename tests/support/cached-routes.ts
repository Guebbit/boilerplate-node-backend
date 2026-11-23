/**
 * The GET routes a module mounts behind `privateNoCache`, `publicNoCache` or `setCache`, as OpenAPI paths.
 *
 * Reads the real routers back, so it needs the app's modules loaded: it belongs to tests, never
 * to the contract bundler (which would have to boot the app before the files that app imports exist).
 */
import type { RouteMount } from '@kernel/registry';
import { privateNoCache, publicNoCache } from '@infrastructure/http/middlewares/cache';

/** The slice of an Express router layer this walk reads (undocumented internals, pinned by `router-internals.test.ts`). */
interface Layer {
    /** Set on a route layer, absent on middleware layers (those are skipped). */
    route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: { handle: unknown }[];
    };
}

/** `setCache` returns a closure named `setCacheMiddleware` (cache.ts), the one way to spot it. */
const isSetCache = (handle: unknown): boolean =>
    typeof handle === 'function' && handle.name === 'setCacheMiddleware';

/**
 * The `x-cache` spelling a route handler declares: `privateNoCache` is `private-no-cache`,
 * `publicNoCache` is `revalidate`, a `setCache` carries its own `cachePolicy`, anything else
 * declares none.
 */
const policyOf = (handle: unknown): string | undefined => {
    if (handle === privateNoCache) return 'private-no-cache';
    if (handle === publicNoCache) return 'revalidate';
    // `isSetCache` proved `handle` is the closure `setCache` returns, which carries `cachePolicy`.
    return isSetCache(handle) ? (handle as { cachePolicy?: string }).cachePolicy : undefined;
};

/** Express `/:id` to OpenAPI `/{id}`, and no trailing slash. */
const toOpenApiPath = (basePath: string, routePath: string): string => {
    const joined = `${basePath}${routePath}`.replaceAll(/:(\w+)/g, '{$1}');
    return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
};

/**
 * Every `privateNoCache`, `publicNoCache` or `setCache` GET across one module's mounts, with the `x-cache` value
 * its middleware declares.
 *
 * @param mounts - the module's `mounts`
 * @returns `[OpenAPI path, x-cache value]` pairs, sorted
 */
export const cachedReadPolicies = (mounts: readonly RouteMount[]): [string, string][] =>
    mounts
        .flatMap(({ basePath, routes }) =>
            (routes.stack as Layer[]).flatMap<[string, string]>(({ route }) => {
                const policy = route?.stack.map(({ handle }) => policyOf(handle)).find(Boolean);
                return route?.methods.get === true && policy !== undefined
                    ? [[toOpenApiPath(basePath, route.path), policy]]
                    : [];
            })
        )
        .toSorted();

/**
 * Every GET across one module's mounts whose `setCache` declares `languageNeutral`, as OpenAPI
 * paths: what the module's own `languageNeutralReads` (collected for `attachLocale`) must list.
 *
 * @param mounts - the module's `mounts`
 * @returns the OpenAPI paths, sorted
 */
export const languageNeutralReads = (mounts: readonly RouteMount[]): string[] =>
    mounts
        .flatMap(({ basePath, routes }) =>
            (routes.stack as Layer[]).flatMap<string>(({ route }) =>
                route?.methods.get === true &&
                route.stack.some(
                    ({ handle }) =>
                        isSetCache(handle) &&
                        // `isSetCache` proved `handle` is the closure `setCache` returns, which carries `languageNeutral`.
                        (handle as { languageNeutral?: boolean }).languageNeutral === true
                )
                    ? [toOpenApiPath(basePath, route.path)]
                    : []
            )
        )
        .toSorted();
