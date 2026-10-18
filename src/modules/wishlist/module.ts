/**
 * @module
 * The wishlist: one document per user, holding product references and nothing else. Depends on
 * products (a saved line is meaningless without one), users (the list belongs to an account), and
 * cart (move-to-cart writes a line). A deleted product cleans up via a domain event; an erased
 * account cleans up through this module's own `personalData.erase` hook below — neither an
 * import, keeping the import graph acyclic. No rules worth modelling here: deleting it costs a
 * convenience, not a capability.
 *
 * See: docs/modules/wishlist.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { PRODUCT_DELETED, productService } from '@modules/products';
import { router } from './routes';
import { wishlistService } from './service';

/** This module's manifest entry: routes, event subscriptions, and locales. */
export default {
    name: 'wishlist',
    basePath: '/wishlist',
    routes: router,
    personalData: [
        {
            section: 'wishlist',
            collect: (subject) => wishlistService.exportLines(subject.userId),
            // Joins the caller's own hard-delete transaction — see `wishlistService.removeByUserId`.
            erase: wishlistService.removeByUserId
        }
    ],
    subscribe: () => {
        // Skipped for a product that is live again: a retried delivery can arrive after a
        // restore, and pulling the line would tell a shopper "removed" about a product on sale.
        onDomainEvent(PRODUCT_DELETED, ({ productId, titles }) =>
            productService
                .isLive(productId)
                .then((live) =>
                    live ? undefined : wishlistService.removeByProductId(productId, titles)
                )
        );
    },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
