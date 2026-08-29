import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { router } from './routes';
import { seedCartsCollection, exportSeededCarts } from './demo';
import { PRODUCT_DELETED } from '@modules/products';
import { USER_DELETED } from '@modules/users';
import { cartDeleteByUserId, productRemoveFromCartsById } from './services';

/**
 * The shopping cart: one document per user, priced against the live catalogue.
 *
 * Depends on products because a cart line is meaningless without the product it points at, on users
 * because a checkout is priced against the account that owns it, and on orders because a checkout
 * is where a cart stops being a cart. Products and users also need to reach back — a deleted
 * product must leave every cart, a destroyed account must take its cart with it — and both of those
 * arrive as domain events, so the import graph stays acyclic even though the domains are mutually
 * aware. Orders never reaches back, so that edge is a plain import.
 *
 * Checkout is where every rule in the shop has to agree at once — price, stock, address, shipping,
 * and the order that comes out the other side. The breadth of what it imports is not a smell to be
 * refactored away; it is what a checkout is. See `docs/theory/modules.md` on why this module is a
 * customer of four contexts rather than an orchestration layer above them.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      account, delivery, inventory, orders, products, users
 * Reached by:   wishlist (the move-to-cart exit)
 * Not imports:  `20260808160000-cart-collection.js` creates this module's collection and reads
 *               `users` to do it.
 */
export default {
    name: 'cart',
    basePath: '/cart',
    routes: router,
    subscribe: () => {
        onDomainEvent(PRODUCT_DELETED, ({ productId }) => productRemoveFromCartsById(productId));
        onDomainEvent(USER_DELETED, ({ userId }) => cartDeleteByUserId(userId));
    },
    seeds: seedCartsCollection,
    seedExport: exportSeededCarts,
    /* `GET /cart` answers the caller's own cart with its lines resolved against the catalogue,
     * so the stored row is the input to that response rather than the response. */
    demoShapes: { carts: 'stored' },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
