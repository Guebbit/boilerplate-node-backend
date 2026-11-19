/**
 * @module
 * Staff notes on an order (`POST` and `DELETE /orders/{id}/timeline/notes`): a staff-only timeline
 * row whose text is encrypted at rest, kept on the text clock, scrubbed with the order's erasure,
 * handed to the buyer in their data export and withdrawable by staff. Over real HTTP and real Mongo.
 *
 * @see docs/modules/orders.md#the-timeline
 */

import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { observePort } from '@tests/ports';
import { asAdmin } from '@tests/callers';
import * as auditPort from '@infrastructure/observability/audit';
import { eraseAsScheduled } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { OrderStatus } from '@types';
import {
    createOrder,
    toOrderItem,
    timelineOf,
    markOrderPaidAt,
    forceOrderStatus
} from '../factories';
import { ordersAuditActions } from '../../audit';
import { orderEventModel } from '../../model';
import { orderService } from '../../services';

/* Replaced, not spied on — see `tests/support/ports.ts` for why. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

afterEach(() => {
    resetDomainEvents();
});

/**
 * A staff note that carries a phone number, so the redaction cases have personal data to remove.
 */
const NOTE = 'Called 0612345678: agreed to ship Monday';

/** A paid order of a signed-in buyer, plus that buyer's and a staff member's bearers. */
const seed = async () => {
    const { user, bearer: buyer } = await authenticateAs('user');
    const product = await createProduct();
    const order = await createOrder(user, [toOrderItem(product, 1)], { status: OrderStatus.paid });
    const { bearer: staff } = await authenticateAsRole('admin');
    return { user, order, orderId: String(order._id), buyer, staff };
};

/** Staff leave `text` on the order. */
const leaveNote = (orderId: string, bearer: string, text = NOTE) =>
    api().post(`/orders/${orderId}/timeline/notes`).set('Authorization', bearer).send({ text });

/** The status of a note attempt. */
const leaveStatus = (orderId: string, bearer: string, text?: string): Promise<number> =>
    leaveNote(orderId, bearer, text).then((response) => response.status);

/** Writes a note and answers the path its `Location` named. */
const writeNote = (orderId: string, bearer: string): Promise<string> =>
    leaveNote(orderId, bearer).then((response) => response.headers.location);

/** The status of withdrawing the note at `location`. */
const deleteStatus = (location: string, bearer: string): Promise<number> =>
    api()
        .delete(location)
        .set('Authorization', bearer)
        .then((response) => response.status);

describe('POST /orders/{id}/timeline/notes', () => {
    it('answers 201 with the staff-only entry and the Location of its DELETE', async () => {
        const { orderId, staff } = await seed();

        const response = await leaveNote(orderId, staff);

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ type: 'note_added', audience: 'staff', text: NOTE });
        expect(response.headers.location).toBe(
            `/orders/${orderId}/timeline/notes/${String(response.body.id)}`
        );
    });

    it('shows staff the note in the timeline and the buyer nothing of it', async () => {
        const { orderId, buyer, staff } = await seed();
        await leaveNote(orderId, staff);

        const staffView = await api()
            .get(`/orders/${orderId}/timeline`)
            .set('Authorization', staff);
        const buyerView = await api()
            .get(`/orders/${orderId}/timeline`)
            .set('Authorization', buyer);

        expect(JSON.stringify(staffView.body)).toContain(NOTE);
        expect(JSON.stringify(buyerView.body)).not.toContain('note_added');
        expect(JSON.stringify(buyerView.body)).not.toContain('Monday');
    });

    it('stores the text encrypted: the raw collection holds no plaintext', async () => {
        const { orderId, staff } = await seed();
        await leaveNote(orderId, staff);

        const raw = JSON.stringify(await orderEventModel.collection.find({}).toArray());

        expect(raw).not.toContain('0612345678');
        expect(raw).not.toContain('Monday');
    });

    it('refuses a note moved to another order: the order id is in the associated data', async () => {
        const first = await seed();
        const second = await createOrder(first.user, [
            toOrderItem(await createProduct({ sku: 'S2' }), 1)
        ]);
        await leaveNote(first.orderId, first.staff);
        const row = await orderEventModel.findOne({ type: 'note_added' }).exec();
        await orderEventModel.collection.updateOne(
            { _id: row?._id },
            { $set: { orderId: second._id } }
        );

        await expect(
            orderService.readTimeline(String(second._id), asAdmin(), {})
        ).rejects.toThrow();
    });

    it('carries the note, without its author, in the buyer`s data export', async () => {
        const { user, orderId, staff } = await seed();
        await leaveNote(orderId, staff);

        const exported = await orderService.collectTimelineOf(user.id);

        expect(exported).toMatchObject([{ orderId, type: 'note_added', text: NOTE }]);
        expect(exported[0]).not.toHaveProperty('actor');
    });

    it('audits the note by its length, never its text', async () => {
        const { orderId, staff } = await seed();
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await leaveNote(orderId, staff);

        const rows = auditSpy.mock.calls
            .map(([event]) => event)
            .filter(({ action }) => action === ordersAuditActions.ADMIN_ORDER_NOTE_ADDED);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ targetId: orderId, metadata: { length: NOTE.length } });
        expect(JSON.stringify(rows[0])).not.toContain('Monday');
    });

    it('is refused to a caller without update:Order, and writes nothing', async () => {
        const { orderId, buyer } = await seed();

        const response = await leaveNote(orderId, buyer);

        expect(response.status).toBe(403);
        expect(await orderEventModel.countDocuments({ type: 'note_added' })).toBe(0);
    });

    it('answers 404 for an unknown order and 422 for an empty or oversized text', async () => {
        const { orderId, staff } = await seed();

        expect(await leaveStatus('0'.repeat(24), staff)).toBe(404);
        expect(await leaveStatus(orderId, staff, '')).toBe(422);
        expect(await leaveStatus(orderId, staff, 'x'.repeat(2001))).toBe(422);
    });
});

describe('the note`s life after it is written', () => {
    it('loses its text on the text clock, keeping the row', async () => {
        setEnvironment({ NODE_ORDER_EVENT_TEXT_RETENTION_DAYS: '10' });
        const { orderId, staff } = await seed();
        await leaveNote(orderId, staff);
        await orderEventModel.updateOne(
            { type: 'note_added' },
            { $set: { at: new Date(Date.now() - 11 * 86_400_000) } }
        );

        expect(await orderService.scrubTimelineText()).toBe(1);

        const [row] = await timelineOf(orderId, 'note_added');
        expect(row).toBeDefined();
        expect(row).not.toHaveProperty('text');
    });

    it('is scrubbed with the order when the buyer`s personal data is erased', async () => {
        registerCheckoutModules();
        const { user, orderId, staff } = await seed();
        await leaveNote(orderId, staff);
        // Paid long ago and ended undelivered: the erasure's clock finds its claim window over.
        await markOrderPaidAt(orderId, new Date(Date.now() - 3650 * 24 * 60 * 60 * 1000));
        await forceOrderStatus(orderId, OrderStatus.canceled);

        await eraseAsScheduled(user);
        await orderService.anonymizeDueOrders();

        const [row] = await timelineOf(orderId, 'note_added');
        expect(row).toBeDefined();
        expect(row).not.toHaveProperty('text');
    });
});

describe('DELETE /orders/{id}/timeline/notes/{eventId}', () => {
    it('unsets the text and keeps the row, in the timeline and in the export', async () => {
        const { user, orderId, staff } = await seed();
        const location = await writeNote(orderId, staff);

        const response = await api().delete(location).set('Authorization', staff);

        expect(response.status).toBe(204);
        const [row] = await timelineOf(orderId, 'note_added');
        expect(row).toMatchObject({ type: 'note_added' });
        expect(row).not.toHaveProperty('text');
        const exported = await orderService.collectTimelineOf(user.id);
        expect(JSON.stringify(exported)).not.toContain('Monday');
        expect(exported).toHaveLength(1);
    });

    it('audits the withdrawn text by its length, never its text', async () => {
        const { orderId, staff } = await seed();
        const location = await writeNote(orderId, staff);
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await api().delete(location).set('Authorization', staff);

        const rows = auditSpy.mock.calls
            .map(([event]) => event)
            .filter(({ action }) => action === ordersAuditActions.ADMIN_ORDER_NOTE_DELETED);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ metadata: { length: NOTE.length } });
        expect(JSON.stringify(rows[0])).not.toContain('Monday');
    });

    it('answers 404 the second time, and for a row that is not a note of this order', async () => {
        const { user, orderId, staff } = await seed();
        const location = await writeNote(orderId, staff);
        const [created] = await timelineOf(orderId, 'created');
        const other = await createOrder(user, [toOrderItem(await createProduct({ sku: 'S2' }), 1)]);
        const noteId = location.split('/').pop();

        expect(await deleteStatus(location, staff)).toBe(204);

        expect(await deleteStatus(location, staff)).toBe(404);
        expect(await deleteStatus(`/orders/${orderId}/timeline/notes/${created?.id}`, staff)).toBe(
            404
        );
        expect(
            await deleteStatus(`/orders/${String(other._id)}/timeline/notes/${noteId}`, staff)
        ).toBe(404);
    });

    it('is refused to a caller without update:Order', async () => {
        const { orderId, staff, buyer } = await seed();
        const location = await writeNote(orderId, staff);

        expect(await deleteStatus(location, buyer)).toBe(403);
        const [row] = await timelineOf(orderId, 'note_added');
        expect(row).toHaveProperty('text', NOTE);
    });
});
