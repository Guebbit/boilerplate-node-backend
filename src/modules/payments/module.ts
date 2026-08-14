import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { ORDER_CANCELLED } from '@modules/orders';
import { router } from './routes';
import { refundForOrder } from './service';

/**
 * Payments: an order's money, behind a provider port (`./providers`).
 *
 * Depends on orders because a payment is ABOUT an order — the intent freezes its total, the
 * confirm moves its status to `paid`. The arrow never comes back: orders announces what happens
 * to it (`ORDER_CANCELLED`) and this module answers with the refund. Deleting this module leaves
 * a shop where cancelling a paid order restores stock but returns no money — which is exactly
 * the sentence `CANCELLABLE_ORDER_STATUSES` documents.
 */
export default {
    name: 'payments',
    basePath: '/payments',
    routes: router,
    dependsOn: ['orders', 'users'],
    subscribe: () => {
        onDomainEvent(ORDER_CANCELLED, ({ orderId }) => refundForOrder(orderId));
    },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
