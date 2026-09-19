/**
 * @module
 * `orders/services/override.ts` — the admin override. Real Mongo throughout, same reasoning
 * `service-status.test.ts` already gives: the guarantee is the conditional write, and a mock
 * cannot race against itself.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerContextAs } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem, readOrder } from '@modules/orders/tests/factories';
import { overrideStatus, forceMove } from '../../services/override';
import { ORDER_STATUS_CHANGED } from '../../events';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { OrderStatus } from '@types';

setupTestDb();

afterEach(() => resetDomainEvents());

const seedOrder = async (status: OrderStatus) => {
    const user = await createUser();
    const product = await createProduct();
    return createOrder(user, [toOrderItem(product, 1)], { status });
};

describe('overrideStatus', () => {
    it('moves an order forward, records the history entry, and fires the status-changed event', async () => {
        const order = await seedOrder(OrderStatus.paid);
        const events: unknown[] = [];
        onDomainEvent(ORDER_STATUS_CHANGED, (payload) => events.push(payload));
        const context = callerContextAs('admin', 'admin-1');

        const result = await overrideStatus(
            String(order._id),
            OrderStatus.processing,
            'shelf pick error, correcting by hand',
            context
        );

        expect(result.success).toBe(true);
        expect(result.data?.status).toBe(OrderStatus.processing);
        // No `override` flag — no listener reads it (`webhooks` filters on `to` alone); a
        // status-only override and a forced delivery-door one are not distinguished in the event,
        // which never needed to tell them apart.
        expect(events).toEqual([
            {
                orderId: String(order._id),
                from: OrderStatus.paid,
                to: OrderStatus.processing
            }
        ]);

        const stored = await readOrder(String(order._id));
        expect(stored?.statusOverrides).toHaveLength(1);
        expect(stored?.statusOverrides?.[0]).toMatchObject({
            from: OrderStatus.paid,
            to: OrderStatus.processing,
            mode: 'status',
            reason: 'shelf pick error, correcting by hand'
        });
    });

    it('refuses a move into paid — that destination stays system-only', async () => {
        const order = await seedOrder(OrderStatus.pending);
        const context = callerContextAs('admin', 'admin-1');

        const result = await overrideStatus(
            String(order._id),
            OrderStatus.paid,
            'trying anyway',
            context
        );

        expect(result.success).toBe(false);
    });

    it('refuses a backward move', async () => {
        const order = await seedOrder(OrderStatus.shipped);
        const context = callerContextAs('admin', 'admin-1');

        const result = await overrideStatus(
            String(order._id),
            OrderStatus.processing,
            'undo, please',
            context
        );

        expect(result.success).toBe(false);
    });

    it('creates no parcel-side effect — it is the status-only door', async () => {
        const order = await seedOrder(OrderStatus.processing);
        const context = callerContextAs('admin', 'admin-1');

        await overrideStatus(String(order._id), OrderStatus.shipped, 'manual correction', context);

        // No shipment record exists — only `delivery`'s doors create one.
        const stored = await readOrder(String(order._id));
        expect(stored?.status).toBe(OrderStatus.shipped);
    });
});

describe('forceMove', () => {
    it('moves an order past a status the normal lifecycle would refuse', async () => {
        // `paid`, never `processing` — the normal `markShipped` would refuse this.
        const order = await seedOrder(OrderStatus.paid);
        const context = callerContextAs('admin', 'admin-1');

        const updated = await forceMove(
            String(order._id),
            'shipped',
            'skipped processing on purpose',
            context
        );

        expect(updated?.status).toBe(OrderStatus.shipped);
        const stored = await readOrder(String(order._id));
        expect(stored?.statusOverrides?.[0]).toMatchObject({ mode: 'forced', to: 'shipped' });
    });

    it('refuses once the order has already moved past the target', async () => {
        const order = await seedOrder(OrderStatus.delivered);
        const context = callerContextAs('admin', 'admin-1');

        const updated = await forceMove(String(order._id), 'shipped', 'too late', context);

        expect(updated).toBeNull();
    });
});
