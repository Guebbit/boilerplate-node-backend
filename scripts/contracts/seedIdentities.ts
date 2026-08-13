/**
 * `db/seeds/seed-identities.ts` — the demo dataset's fixed ids, emails and relationships.
 *
 * WHY IT IS FRAGMENTED. `db/seeds/index.ts` already names no domain: it calls whatever `seeds` the
 * enabled modules declare, so deleting a module takes its seeding with it. The FACTS those seeders
 * read did not follow — `seedUsers`, `seedProducts` and `seedOrders` were declared together in one
 * file no module owned. Now each domain owns its own records, and its interface with them.
 *
 * WHAT STAYS SHARED is what more than one domain reads: the four credentials (the users own them,
 * the orders quote them, and the frontend's e2e specs type them into a real login form) and
 * `ISeedCartItem`, which describes both a line in a user's cart and a line in an order.
 *
 * `cart` contributes no fragment, and that is correct rather than an omission: a cart is embedded
 * in its user, so the cart records live in the users fragment. A module with nothing to seed simply
 * has no entry in `SEED_SECTION_ORDER`.
 *
 * ORDER IS DECLARATION ORDER, and the only rule it has to respect is that the header comes first:
 * the credentials it declares are read by the records below it. TypeScript resolves the types in
 * any order, so each domain keeping its interface next to its data costs nothing.
 *
 * Note that a module's own `seeds.ts` imports from the BUNDLE (`@seed-identities`) and not from the
 * fragment beside it. Fragments are text slices, not modules — nothing imports one — and the bundle
 * is what both repos actually load.
 */

import path from 'node:path';
import { REPO_ROOT, type IContractBundle, type TSegment } from './fragments';

/** The domains that contribute records, in declaration order. */
export const SEED_SECTION_ORDER = ['users', 'products', 'orders', 'wishlist'] as const;

export type TSeedSectionName = (typeof SEED_SECTION_ORDER)[number];

/** One blank line between two top-level declarations — the file's own spacing. */
const SECTION_SEPARATOR = '\n\n';

/** Where a module's slice of the dataset lives. */
export const seedFragment = (section: TSeedSectionName): string =>
    path.join(REPO_ROOT, 'src', 'modules', section, 'seed-identities.fragment.ts');

/** The prose, the credentials, and the one interface two domains share. */
const HEADER_FRAGMENT = path.join(
    REPO_ROOT,
    'shared',
    'contracts',
    'seed-identities.header.fragment.ts'
);

export const seedIdentitiesBundle: IContractBundle = {
    name: 'seed-identities',
    label: 'db/seeds/seed-identities.ts',
    output: path.join(REPO_ROOT, 'db', 'seeds', 'seed-identities.ts'),
    segments: (): TSegment[] => [
        {
            parts: [HEADER_FRAGMENT, ...SEED_SECTION_ORDER.map((section) => seedFragment(section))],
            separator: SECTION_SEPARATOR
        }
    ]
};
