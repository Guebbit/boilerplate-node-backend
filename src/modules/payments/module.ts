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
 *
 * It depends on users for the payer, and that is groundwork rather than a current feature. The
 * order already carries a `userId`; resolving it against the account record is what makes the id
 * on a payment document worth querying later, when "everything this account has paid" becomes a
 * screen. The history itself does not exist yet — `service.ts` explains what the resolution buys
 * and why an unresolvable payer is logged rather than refused.
 */
export default {
    name: 'payments',
    /*
     * Taking money is not this shop's differentiator, and the provider port exists precisely so the
     * generic part can be bought. What stays here is the small supporting piece a provider will
     * never own: which order a payment belongs to, and what cancelling one owes back.
     */
    subdomain: 'supporting',
    language: {
        Intent: 'A frozen amount for an order, before any money moves. Freezing is the point — the order may still be edited, the amount may not.',
        Confirm:
            'The provider’s yes. Moves the order to `paid`; nothing else in the app may set that status.',
        Refund: 'Money returned because an order was cancelled. Answered to `order.cancelled`, never requested directly.',
        Provider:
            'The outside system that actually moves money, reached only through `./providers`.'
    },
    basePath: '/payments',
    routes: router,
    dependsOn: [
        {
            module: 'orders',
            as: 'customer-supplier',
            because:
                'A payment is about an order: the intent freezes its total, the confirm moves its status, and `order.cancelled` is what asks for the refund.'
        },
        {
            module: 'users',
            as: 'conformist',
            because:
                'Resolves the payer against the account record rather than copying the id off the order, so a payment history is a query on an id that pointed at a real account when the money moved.'
        }
    ],
    subscribe: () => {
        onDomainEvent(ORDER_CANCELLED, ({ orderId }) => refundForOrder(orderId));
    },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
