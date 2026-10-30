/**
 * The contract's `x-cache` and the routers must name the same GETs: the bundler adds the shared
 * `304` from `x-cache` alone (it cannot boot the app), so a drift either way is a documented
 * answer the route never gives, or a `304` the contract never mentions.
 */
import { existsSync } from 'node:fs';
import { enabledModules } from '../../src/modules';
import { cachedReadPaths } from '@tests/cached-routes';
import { MODULES_ROOT } from '../../scripts/modules-on-disk';
import { readModuleFragment } from '../../scripts/contracts/fragments';

/** The spellings the contract allows. */
const X_CACHE_VALUE = /^(private-no-cache|revalidate|max-age: \d+|no-store)$/;

/**
 * `no-store` is DECLARED ONLY: no router middleware marks it (the controller sets the header on
 * a file it streams), so the both-ways comparison covers the other three values alone.
 */
const isMounted = (policy: string): boolean => policy !== 'no-store';

/** Every `get` a module's fragment marks with `x-cache`, with the value it wrote. */
const declaredReads = (module: string): Record<string, string | undefined> =>
    Object.fromEntries(
        Object.entries(readModuleFragment(MODULES_ROOT, module).paths ?? {}).flatMap(
            ([route, item]) => {
                const policy = item.get?.['x-cache'];
                return item.get && policy !== undefined ? [[route, policy]] : [];
            }
        )
    );

/** Modules that ship a contract: one without (the `example` template) has nothing to declare. */
const contracted = enabledModules.filter(({ name }) =>
    existsSync(`${MODULES_ROOT}/${name}/openapi.yaml`)
);

describe('x-cache is declared exactly where a router mounts a cache policy', () => {
    it('finds cached reads to compare (canary against a vacuous walk)', () => {
        expect(
            contracted.flatMap(({ mounts = [] }) => cachedReadPaths(mounts)).length
        ).toBeGreaterThan(0);
    });

    it.each(contracted.map(({ name }) => name))(
        '%s: mounted privateNoCache/setCache GETs equal its x-cache operations',
        (name) => {
            const mounts = contracted.find((each) => each.name === name)?.mounts ?? [];
            const declared = declaredReads(name);

            const mountedPolicies = Object.entries(declared)
                .filter(([, policy]) => policy !== undefined && isMounted(policy))
                .map(([route]) => route)
                .toSorted();

            expect(mountedPolicies).toEqual(cachedReadPaths(mounts));
            for (const value of Object.values(declared)) expect(value).toMatch(X_CACHE_VALUE);
        }
    );
});
