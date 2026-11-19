/**
 * @module
 * Staff correcting who an order is invoiced to (`PUT /orders/{id}/billing-address`): the new address
 * and VAT number replace the old under the order's own encryption, the history names who and never
 * what, the correction is announced for `invoicing`, and it is refused once retention erased the
 * order's personal data. What `invoicing` then does with the event is its own module's test.
 *
 * @see docs/modules/orders.md#correcting-the-billing-address
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { OrderStatus } from '@types';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import * as auditPort from '@infrastructure/observability/audit';
import { observePort } from '@tests/ports';
import { outboxEventModel } from '@kernel/outbox';
import { ordersAuditActions } from '../../audit';
import { ANONYMIZED_EMAIL } from '../../domain/anonymization';
import { orderModel } from '../../model';

/* Replaced, not spied on — see `tests/support/ports.ts` for why. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

/** Who the order is invoiced to when placed. */
const BEFORE = {
    fullName: 'Mario Rossi',
    street: 'Via Roma 1',
    city: 'Milano',
    zip: '20100',
    country: 'IT'
};
/** The company the buyer then asked for. */
const AFTER = { ...BEFORE, fullName: 'Rossi Srl', vatNumber: 'IT01234567890' };

/** A paid order billed to {@link BEFORE}, or to nobody when `billingAddress` is `undefined`. */
const seedPaidOrder = async (billingAddress: typeof BEFORE | undefined = BEFORE) => {
    const { user, bearer } = await authenticateAs('user');
    const product = await createProduct();
    const order = await createOrder(user, [toOrderItem(product, 1)], {
        status: OrderStatus.paid,
        ...(billingAddress ? { billingAddress } : {})
    });
    return { order, buyer: bearer };
};

/** `PUT /orders/{id}/billing-address` as `bearer`. */
const putBilling = (orderId: unknown, bearer: string, body: object = AFTER) =>
    api()
        .put(`/orders/${String(orderId)}/billing-address`)
        .set('Authorization', bearer)
        .send(body);

describe('PUT /orders/{id}/billing-address', () => {
    it('replaces the address and VAT number for staff, encrypted, and says who in the timeline, not what', async () => {
        const { order } = await seedPaidOrder();
        const { bearer } = await authenticateAsRole('admin');

        const response = await putBilling(order._id, bearer);

        expect(response.status).toBe(200);
        expect(response.body.billingAddress).toMatchObject(AFTER);
        const raw = JSON.stringify(await orderModel.collection.findOne({ _id: order._id }));
        expect(raw).not.toContain('Rossi Srl');
        expect(raw).not.toContain('IT01234567890');
        const timeline = await api()
            .get(`/orders/${String(order._id)}/timeline`)
            .set('Authorization', bearer);
        expect(JSON.stringify(timeline.body)).toContain('billing_corrected');
        expect(JSON.stringify(timeline.body)).not.toContain('Rossi');
    });

    it('replaces the whole address: a VAT number left out is removed', async () => {
        const { order } = await seedPaidOrder();
        const { bearer } = await authenticateAsRole('admin');
        await putBilling(order._id, bearer);

        const response = await putBilling(order._id, bearer, BEFORE);

        expect(response.body.billingAddress.vatNumber).toBeUndefined();
    });

    it('announces the correction once, in the same transaction, for invoicing to act on', async () => {
        const { order } = await seedPaidOrder();
        const { bearer } = await authenticateAsRole('admin');

        await putBilling(order._id, bearer);

        const rows = await outboxEventModel.find({ name: 'order.billing_corrected' }).lean();
        expect(rows).toHaveLength(1);
        expect(rows[0].payload).toEqual({ orderId: String(order._id) });
    });

    it('is idempotent: a repeat of the same address answers 200 and adds no row, no event and no audit', async () => {
        const { order } = await seedPaidOrder();
        const { bearer } = await authenticateAsRole('admin');
        await putBilling(order._id, bearer);
        const auditSpy = observePort(auditPort.emitAuditEvent);

        const again = await putBilling(order._id, bearer);

        expect(again.status).toBe(200);
        expect(again.body.billingAddress).toMatchObject(AFTER);
        expect(await outboxEventModel.countDocuments({ name: 'order.billing_corrected' })).toBe(1);
        const timeline = await api()
            .get(`/orders/${String(order._id)}/timeline`)
            .set('Authorization', bearer);
        expect(JSON.stringify(timeline.body).match(/billing_corrected/g)).toHaveLength(1);
        expect(
            auditSpy.mock.calls.filter(
                ([{ action }]) => action === ordersAuditActions.ADMIN_ORDER_BILLING_CORRECTED
            )
        ).toHaveLength(0);
    });

    it('audits the correction once, naming the order and never the address or the VAT number', async () => {
        const { order } = await seedPaidOrder();
        const { bearer } = await authenticateAsRole('admin');
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await putBilling(order._id, bearer);

        const rows = auditSpy.mock.calls
            .map(([event]) => event)
            .filter(({ action }) => action === ordersAuditActions.ADMIN_ORDER_BILLING_CORRECTED);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ targetType: 'order', targetId: String(order._id) });
        expect(JSON.stringify(rows[0])).not.toContain('Rossi');
        expect(JSON.stringify(rows[0])).not.toContain('IT0123');
    });

    it('shows the buyer the new address on the order, and no row about the change', async () => {
        const { order, buyer } = await seedPaidOrder();
        const { bearer: staff } = await authenticateAsRole('admin');
        await putBilling(order._id, staff);

        const read = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', buyer);
        const timeline = await api()
            .get(`/orders/${String(order._id)}/timeline`)
            .set('Authorization', buyer);

        expect(read.body.billingAddress).toMatchObject(AFTER);
        expect(JSON.stringify(timeline.body)).not.toContain('billing_corrected');
    });

    it('gives an order that had no billing address one (an admin-created order)', async () => {
        const { order } = await seedPaidOrder(undefined);
        const { bearer } = await authenticateAsRole('admin');

        const response = await putBilling(order._id, bearer);

        expect(response.status).toBe(200);
        expect(response.body.billingAddress).toMatchObject(AFTER);
    });

    it('offers the correction to staff in `actions`, never to the buyer', async () => {
        const { order, buyer } = await seedPaidOrder();
        const { bearer: staff } = await authenticateAsRole('admin');
        const flagFor = (bearer: string) =>
            api()
                .get(`/orders/${String(order._id)}`)
                .set('Authorization', bearer)
                .then((response) => response.body.actions.correctBilling as boolean);

        expect(await flagFor(staff)).toBe(true);
        expect(await flagFor(buyer)).toBe(false);
    });

    it('is refused with ORDER_BILLING_LOCKED once retention erased the order, and writes nothing', async () => {
        const { order } = await seedPaidOrder();
        const { bearer } = await authenticateAsRole('admin');
        await orderModel
            .updateOne(
                { _id: order._id },
                { $set: { email: ANONYMIZED_EMAIL }, $unset: { billingAddress: 1 } }
            )
            .exec();

        const refused = await putBilling(order._id, bearer);
        const read = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(refused.status).toBe(409);
        expect(refused.body.errors[0].code).toBe('ORDER_BILLING_LOCKED');
        expect(read.body.billingAddress).toBeUndefined();
        expect(read.body.actions.correctBilling).toBe(false);
        expect(await outboxEventModel.countDocuments({ name: 'order.billing_corrected' })).toBe(0);
    });

    it('is staff’s: the buyer is refused', async () => {
        const { order, buyer } = await seedPaidOrder();

        const byBuyer = await putBilling(order._id, buyer);

        expect(byBuyer.status).toBe(403);
    });
});
