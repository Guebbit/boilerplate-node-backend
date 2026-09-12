/**
 * @module
 * The `blank` scenario: harness infrastructure only — the access model, the four named accounts,
 * and the languages `products.ts` elsewhere depends on. No catalogue, no orders, no carts:
 * nothing here is shop-shaped. Behaviour e2e specs that create what they assert on restore into
 * this instead of `shop`.
 */

import type { SeedOutcome } from '@scenarios/seed';
import { seedAccessModel } from './accounts';
import { seedNamedUsersCollection } from './users';
import { seedLocalesCollection } from './locales';

/**
 * Seed `blank`. Read by `scenarios/index.ts`'s `SCENARIOS` registry; never called directly.
 *
 * Roles and the shop membership first — nothing can resolve a caller until a shop exists to be a
 * member of — then the four named accounts and the languages, concurrently: neither reads the
 * other's write.
 */
export const seedBlank = (): Promise<SeedOutcome[]> =>
    seedAccessModel()
        .then(() => Promise.all([seedNamedUsersCollection(), seedLocalesCollection()]))
        .then(([users, locales]) => [...users, ...locales]);
