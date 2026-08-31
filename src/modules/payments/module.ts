/**
 * @module
 * Payments: an order's money, behind a provider port (`./providers`), so the generic part of
 * taking money can be bought rather than built.
 *
 * Depends on orders (a payment is ABOUT an order — the intent freezes its total, refunds answer
 * `ORDER_CANCELLED`) and on inventory (the confirm is the single moment an order's held stock
 * becomes a sale, committed here rather than announced). Depends on users to resolve the payer —
 * groundwork for a future payment history, not a current feature.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      inventory, orders, users
 * Reached by:   nothing — delete it and orders stop being paid for, nothing stops compiling
 *
 * See: docs/modules/payments.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { ORDER_CANCELLED } from '@modules/orders';
import { router } from './routes';
import { refundForOrder } from './service';

/** This module's manifest entry: routes, the cancel-refund subscription, and locales. */
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
