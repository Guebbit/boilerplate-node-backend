/*
 * The demo dataset's IDENTITIES — the half of the seed both repos have to agree on.
 *
 * SHARED FILE — this file is byte-identical in `boilerplate-node-api-mongodb-mongoose` and
 * `boilerplate-vue-frontend`, and `diff` answers "have the seeds drifted?":
 *
 *   diff boilerplate-node-api-mongodb-mongoose/db/seeds/seed-identities.ts \
 *        boilerplate-vue-frontend/tests/support/mocks/seed-identities.ts
 *
 * ASSEMBLED FROM FRAGMENTS — do not hand-edit. The backend authors it: each domain owns its own
 * records in `src/modules/<name>/seed-identities.fragment.ts`, so deleting a module takes its half
 * of the dataset with it, and `npm run contracts:bundle` rebuilds this file. The frontend receives
 * the result as a copy and authors nothing.
 *
 * Why it exists. The backend seeds Mongo from `./fixtures`; the frontend's MSW layer builds the
 * same dataset in `tests/support/mocks/mockProfiles.ts`. Without a shared file the claim that they
 * hold the same records rests on a comment, and a drift is silent: a mock that returns 5 products
 * to everyone while the real API returns 3 to non-admins still passes every spec that asserts the
 * mock's number.
 *
 * Why only identities, and not the whole fixture. The two sides need genuinely different SHAPES
 * from the same facts:
 *
 *   - backend  → mongoose documents: `_id` as `Types.ObjectId`, plaintext passwords the model's
 *                pre-save hook hashes, an embedded `cart`, denormalised product snapshots inside
 *                orders
 *   - frontend → API response entities: `id` as a string, no password anywhere, `createdAt` /
 *                `updatedAt` stamped at build time, orders' totals computed by `mockOrderMath`
 *
 * So each repo keeps its own mapper over this file. What is shared is what a drift would actually
 * break: ids, emails, admin flags, titles, prices, active/deleted state, and which product appears
 * in whose cart and whose order.
 *
 * This file must stay DEPENDENCY-FREE. It is loaded by ts-jest/CommonJS and tsx on the backend and
 * by Vite/vitest ESM on the frontend; a single import (mongoose being the obvious temptation)
 * would make it unloadable on one side. Plain data only — strings, numbers, booleans. Dates are
 * ISO strings, and each side converts to whatever it needs.
 */

/* Credentials the frontend's e2e specs and both READMEs quote. `cy.loginAs()` types these into a
 * real form, so they are the one part of the dataset that must never be randomised. */
export const SEED_ADMIN_EMAIL = 'root@root.it';
export const SEED_ADMIN_PASSWORD = 'rootroot';
export const SEED_USER_EMAIL = 'gino@pino.it';
export const SEED_USER_PASSWORD = 'password';

export interface ISeedCartItem {
    productId: string;
    quantity: number;
}

export interface ISeedUser {
    id: string;
    username: string;
    email: string;
    /* Plaintext on purpose — the backend model's pre-save hook hashes it. A hash written here
     * would drift from that hook and its plaintext would be lost, which is exactly what once
     * happened to the `gino@pino.it` fixture. The frontend drops this field entirely. */
    password: string;
    admin: boolean;
    /* Path under the backend's `public/`. The frontend's MSW profile deliberately does NOT use
     * these — see the note in `mockProfiles.ts` — but they belong to the identity, so a drift in
     * what the backend serves is still visible in one `diff`. */
    imageUrl: string;
    cart: ISeedCartItem[];
}

export const seedUsers: ISeedUser[] = [
    {
        id: '65dd2bdb923652b7800fe180',
        username: 'root',
        email: SEED_ADMIN_EMAIL,
        password: SEED_ADMIN_PASSWORD,
        admin: true,
        imageUrl: '/images/seed/9726c4217f5998511f372afab4800ac8.jpg',
        cart: [
            { productId: '65dc8a99604c307b702b5ccc', quantity: 2 },
            { productId: '65dcdec2b18ad5e4bd597f0f', quantity: 3 }
        ]
    },
    {
        id: '65de646a44f861fd83c13f13',
        username: 'ginopinoshow',
        email: SEED_USER_EMAIL,
        password: SEED_USER_PASSWORD,
        admin: false,
        imageUrl: '/images/seed/96346b77daf138a279677cb75c400ee9.jpg',
        cart: []
    }
];

export interface ISeedProduct {
    id: string;
    title: string;
    description: string;
    price: number;
    active: boolean;
    imageUrl: string;
    /* ISO 8601, or absent. Present on exactly one product: the role-scoping branches in
     * `isVisibleToCaller` (frontend) and the repositories' soft-delete filters (backend) need one
     * soft-deleted and one inactive record to have anything to exercise. */
    deletedAt?: string;
}

export const seedProducts: ISeedProduct[] = [
    {
        id: '65dc8a99604c307b702b5ccc',
        title: 'Sallyno Panino',
        description: 'Piccolo Sallyno panino. Da mangiare di coccole',
        price: 100,
        active: true,
        imageUrl: '/images/seed/ad2e01890eebf72d06481c4fac3522ac.jpg'
    },
    {
        id: '65dc8ad8604c307b702b5cd4',
        title: 'Sallyno Carino',
        description: 'Sallyno incredibilmente carino. Illegale in 400 paesi. Soft deleted product.',
        price: 50,
        active: true,
        imageUrl: '/images/seed/96346b77daf138a279677cb75c400ee9.jpg',
        deletedAt: '2024-02-26T23:34:44.832Z'
    },
    {
        id: '65dc9be92f2794d1c16741e1',
        title: 'Miciona inutile',
        description: 'Miciona inutile, piccolo catorcio che come lavoro produce pelo a non finire',
        price: 1,
        active: true,
        imageUrl: '/images/seed/60de15db7aed7174ef2d53d21e1f57a5.jpg'
    },
    {
        id: '65dcdec2b18ad5e4bd597f0f',
        title: 'Micino pufettino',
        description: 'Micino pufettino, incredibilmente pufino. Illegale in 400 paesi.',
        price: 77,
        active: true,
        imageUrl: '/images/seed/f12ba2e44fe347010397f1dcba399808.jpg'
    },
    {
        id: '6622c88a5123b1e286f440f8',
        title: 'Bundle micini',
        description: 'Produttori di rumori molesti a tutte le ore. Inactive product.',
        price: 40,
        active: false,
        imageUrl: '/images/seed/043cf5b2517fc99ce9a2c2f84288416d.jpg'
    }
];

export interface ISeedOrder {
    id: string;
    userId: string;
    email: string;
    items: ISeedCartItem[];
    /* ISO 8601, or absent. Present on exactly one order, for the same reason it is on exactly one
     * product: `isOrderVisibleToCaller` (frontend) and `visibleScope` (backend) both branch on it,
     * and a branch with no fixture behind it is a branch nothing tests. It sits on the non-admin
     * user's order specifically, so the case it exercises is "the owner cannot see their own
     * soft-deleted order" — which ownership-only scoping would wrongly allow. */
    deletedAt?: string;
}

/*
 * Orders reference products by id and quantity only.
 *
 * The backend stores a denormalised product SNAPSHOT inside each order item — a real order has to
 * remember the price it was placed at, even after the product's price changes. In this dataset the
 * snapshots happen to be exact copies of the current products, so `fixtures.ts` rebuilds them by
 * lookup rather than restating them. If a fixture ever needs an order whose snapshot deliberately
 * differs from today's product (to exercise exactly that "price changed since" case), it needs an
 * explicit override here — deriving it would silently erase the difference.
 */
export const seedOrders: ISeedOrder[] = [
    {
        id: '65de73a69ca05739be2b5e85',
        userId: '65dd2bdb923652b7800fe180',
        /* Not the admin's current address: this order predates a password/email change, and keeps
         * the old one so "the order remembers where it was sent" stays testable. */
        email: 'oldpsw@root.it',
        items: [
            { productId: '65dc8a99604c307b702b5ccc', quantity: 1 },
            { productId: '65dc9be92f2794d1c16741e1', quantity: 10 }
        ]
    },
    {
        id: '661c795a9e22bcbef63a5832',
        userId: '65dd2bdb923652b7800fe180',
        email: SEED_ADMIN_EMAIL,
        items: [{ productId: '65dcdec2b18ad5e4bd597f0f', quantity: 20 }]
    },
    {
        id: '66b3f0c14d2e8a91c7d4a015',
        userId: '65de646a44f861fd83c13f13',
        email: SEED_USER_EMAIL,
        items: [{ productId: '65dc8a99604c307b702b5ccc', quantity: 4 }],
        deletedAt: '2024-08-07T09:12:03.114Z'
    }
];
