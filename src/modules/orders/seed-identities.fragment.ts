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
