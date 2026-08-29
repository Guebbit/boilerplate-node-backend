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
 * a shop where cancelling an order releases its held stock but returns no money — which is
 * exactly the sentence `CANCELLABLE_ORDER_STATUSES` documents.
 *
 * It also depends on inventory, and that edge is what makes the money and the goods agree: the
 * confirm is the single moment an order's held units become a sale, so it commits them itself
 * rather than announcing and hoping. Without this module nothing would ever commit a hold, and
 * every order would sit reserved until its window expired.
 *
 * It depends on users for the payer, and that is groundwork rather than a current feature. The
 * order already carries a `userId`; resolving it against the account record is what makes the id
 * on a payment document worth querying later, when "everything this account has paid" becomes a
 * screen. The history itself does not exist yet — `service.ts` explains what the resolution buys
 * and why an unresolvable payer is logged rather than refused.
 *
 * Taking money is not this shop's differentiator, and `./providers` exists precisely so the generic
 * part can be bought. What stays here is the small piece a provider will never own: which order a
 * payment belongs to, and what cancelling one owes back.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      inventory, orders, users
 * Reached by:   nothing — delete it and orders stop being paid for, nothing stops compiling
 */
export default {
    name: 'payments',
    basePath: '/payments',
    routes: router,
    subscribe: () => {
        onDomainEvent(ORDER_CANCELLED, ({ orderId, refund }) =>
            refund ? refundForOrder(orderId) : undefined
        );
    },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
