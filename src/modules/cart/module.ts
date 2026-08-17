import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { router } from './routes';
import { seedCartsCollection, exportSeededCarts } from './seeds';
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
 */
export default {
    name: 'cart',
    /*
     * Checkout is where every rule in the shop has to agree at once — price, stock, address,
     * shipping, and the order that comes out the other side. The five edges below are not a smell to
     * be refactored away; they are what a checkout is. See `docs/theory/modules.md` on why this
     * module is a customer of four contexts rather than an orchestration layer above them.
     */
    subdomain: 'core',
    language: {
        Cart: 'One open basket per user. Priced against the live catalogue, so its total is a quote and not a promise.',
        'Cart line': 'A product reference and a quantity. Holds no price — the catalogue does.',
        Checkout:
            'The act of turning a cart into an order and holding its units. Succeeds or leaves both the cart and the shelf untouched; there is no half-checked-out state.',
        Availability:
            'What a line may be checked out against — the catalogue’s units less those already held. Checked here only as a pre-flight; `inventory` re-checks it inside the write.',
        Version:
            'The count of writes a cart has seen. Guards checkout against a concurrent edit — hand-rolled aggregate versioning, in all but name.'
    },
    basePath: '/cart',
    routes: router,
    dependsOn: [
        {
            module: 'account',
            as: 'customer-supplier',
            because:
                'Checkout asks the address book for the one address it should ship to (`addressForCheckout`).'
        },
        {
            module: 'delivery',
            as: 'published-language',
            because:
                'Prices a shipping method through `findShippingMethod`/`priceShipping` — pure functions over plain data, no shipment record in sight.'
        },
        {
            module: 'orders',
            as: 'customer-supplier',
            because: 'A checkout is the one place an order is created outside the admin routes.'
        },
        {
            module: 'inventory',
            as: 'customer-supplier',
            because:
                'A checkout asks for the basket to be held (`reserveForOrder`) and gives the hold back when it loses the cart race. It never touches a counter itself — what a hold costs is inventory’s to know.'
        },
        {
            module: 'products',
            as: 'conformist',
            because:
                'Reads catalogue documents as they are to price lines and to pre-flight availability.'
        },
        {
            module: 'users',
            as: 'conformist',
            because: 'Reads the account record a checkout is priced against.'
        }
    ],
    subscribe: () => {
        onDomainEvent(PRODUCT_DELETED, ({ productId }) => productRemoveFromCartsById(productId));
        onDomainEvent(USER_DELETED, ({ userId }) => cartDeleteByUserId(userId));
    },
    seeds: seedCartsCollection,
    seedExport: exportSeededCarts,
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
