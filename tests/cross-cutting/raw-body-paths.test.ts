/**
 * Every module's `rawBodyPaths` must resolve to a route actually mounted on that module's own
 * router. `app/security.ts` composes these into the JSON parser's raw-body allowlist by string
 * concatenation with `basePath` alone — a typo here silently disables signature verification for
 * that route, with no error anywhere: the path just never matches, `express.json()` re-encodes the
 * body before the module ever sees it, and every signature check downstream fails against bytes
 * that are no longer the ones the caller signed.
 */
import { enabledModules } from '../../src/modules';
import { isDeployed } from '@tests/paths';
import { routeSignatures } from '@tests/routes';

describe('rawBodyPaths', () => {
    it('finds at least one module declaring a raw-body path', () => {
        // The canary. An empty sweep must mean "nothing declares one", not "the sweep broke and
        // every assertion below passed vacuously".
        const declaring = enabledModules.filter(
            (appModule) => (appModule.rawBodyPaths ?? []).length > 0
        );

        // `payments` is the module that verifies a provider's signature over the raw body; with it
        // gone, an empty sweep is the right answer and only the module walk itself is checked.
        if (isDeployed('payments')) expect(declaring.length).toBeGreaterThan(0);
        else expect(enabledModules.length).toBeGreaterThan(0);
    });

    it('resolves every declared path to a route mounted on the same module’s router', () => {
        const dangling = enabledModules.flatMap((appModule) => {
            const paths = appModule.rawBodyPaths ?? [];
            if (paths.length === 0) return [];

            const mounted = new Set(
                (appModule.routes ? routeSignatures(appModule.routes) : []).map(
                    (signature) => signature.split(' ', 2)[1]
                )
            );

            return paths
                .filter((path) => !mounted.has(path))
                .map(
                    (path) =>
                        `${appModule.name}: rawBodyPaths declares "${path}", which no route on its own router mounts`
                );
        });

        expect(dangling).toEqual([]);
    });
});
