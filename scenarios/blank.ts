/**
 * @module
 * The `blank` scenario: harness infrastructure only — the access model, the five named accounts,
 * and the languages `products.ts` elsewhere depends on. No catalogue, no orders, no carts:
 * nothing here is shop-shaped. Behaviour e2e specs that create what they assert on restore into
 * this instead of `shop`.
 */

import { seedAccessModel } from '@kernel/access/seed';
import { seedNamedUsersCollection } from './users';
import { demoModules } from './index';

/**
 * Seed `blank` into the current database. Declared here; called by `src/app/demo.ts`'s
 * `POST /__test/restore` when the request names this scenario.
 *
 * Roles and the shop membership first — nothing can resolve a caller until a shop exists to be a
 * member of — then the five named accounts and the languages, concurrently: neither reads the
 * other's write.
 */
export const seedBlankScenario = (): Promise<void> =>
    seedAccessModel()
        .then(() => Promise.all([seedNamedUsersCollection(), demoModules.locales.seed()]))
        .then(() => undefined);
