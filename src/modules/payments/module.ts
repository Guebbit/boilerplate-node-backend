/**
 * @module
 * Payments: an order's money, behind a provider port (`./providers`), so the generic part of
 * taking money can be bought rather than built. Depends on orders (a payment freezes an order's
 * total and refunds answer `ORDER_CANCELLED`) and on inventory (the confirm commits an order's
 * held stock into a sale). Depends on users to resolve the payer, and to detach one on
 * `USER_DELETED` — the payment survives account erasure, same as the order it paid for.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      inventory, orders, users
 * Reached by:   account (the data export reads the caller's own payments)
 *
 * See: docs/modules/payments.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { ORDER_CANCELLED } from '@modules/orders';
import { USER_DELETED } from '@modules/users';
import { router } from './routes';
import { refundForOrder, detachUserId } from './service';

/** This module's manifest entry: routes, the cancel-refund subscription, and locales. */
export default {
    name: 'payments',
    basePath: '/payments',
    routes: router,
    subscribe: () => {
        onDomainEvent(ORDER_CANCELLED, ({ orderId, refund }) =>
            refund ? refundForOrder(orderId) : undefined
        );
        // Detach, never delete: the payment survives the account.
        onDomainEvent(USER_DELETED, ({ userId }) => detachUserId(userId));
    },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
