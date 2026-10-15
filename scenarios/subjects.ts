/**
 * @module
 * The named ids and credentials a consumer that cannot import module code still needs to point at
 * a specific seeded row: a generated API client collection. It imports `@scenarios/accounts` (the seed passwords come from app config) and
 * nothing generated: the collections that read it are loaded on demand, and the
 * bundler itself must never reach `api/` (`.dependency-cruiser.bootstrap.cjs` guards that).
 *
 * The foundation's two accounts only. A module's own pinned rows live beside its fixtures
 * (`scenarios/product-ids.ts`), and what the flows produce is minted at boot and recorded by the
 * runner (`GET /__test/scenario`), so it cannot be a literal.
 */

import {
    SEED_ADMIN_ID,
    SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD,
    SEED_USER_ID,
    SEED_USER_EMAIL,
    SEED_USER_PASSWORD
} from '@scenarios/accounts';

/**
 * The admin and the ordinary user — id and login — the pair
 * every generated example that needs a *working* request draws from. Re-exported from
 * `@scenarios/accounts` rather than duplicated: that file is the one place credentials must stay
 * fixed against the paired frontend's own `.env` copy.
 */
export const SUBJECTS = {
    admin: { id: SEED_ADMIN_ID, email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD },
    user: { id: SEED_USER_ID, email: SEED_USER_EMAIL, password: SEED_USER_PASSWORD }
} as const;
