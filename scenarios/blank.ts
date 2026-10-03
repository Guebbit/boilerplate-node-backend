/**
 * @module
 * The `blank` scenario: harness infrastructure only — the access model, the named accounts,
 * and the fallback locale a product a SPEC creates still needs active. No catalogue, no orders,
 * no carts: nothing here is shop-shaped. Behaviour e2e specs that create what they assert restore
 * into this instead of `shop`.
 */

import type { SeedOutcome } from '@scenarios/seed';
import { seedAccessModel } from './accounts';
import { seedNamedUsersCollection } from './users';
import { asWaveEntries, baselineShopModules } from './shop-modules';
import { runInWaves } from './waves';

/**
 * Seed `blank`. Read by `scenarios/index.ts`'s `SCENARIOS` registry; never called directly.
 *
 * Roles and the shop membership first — nothing can resolve a caller until a shop exists to be a
 * member of — then the named accounts alongside every `shopModules` entry marked `baseline`
 * (`locales`, today), concurrently: neither reads the other's write. Reading the baseline set off
 * `shop-modules.ts` rather than listing it by hand here is what keeps `blank` in step with `shop`
 * without either scenario importing the other.
 */
export const seedBlank = (): Promise<SeedOutcome[]> =>
    seedAccessModel()
        .then(() =>
            Promise.all([
                seedNamedUsersCollection(),
                runInWaves(asWaveEntries(baselineShopModules()))
            ])
        )
        .then(([users, baseline]) => [...users, ...baseline.flat()]);
