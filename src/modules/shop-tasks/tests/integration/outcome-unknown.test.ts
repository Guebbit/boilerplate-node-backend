/**
 * @module
 * A do-not-retry write whose first attempt never reported back, driven over real HTTP: the first
 * attempt runs and commits, its ledger record is then put back to "in flight, long ago" (a crash
 * between the commit and the done-mark), and the client retries with the same key. The write must
 * not run again, the client must read "outcome unknown", staff must be told once with the subject
 * named, and every later retry must replay the stored answer.
 *
 * One case per do-not-retry operation, so a new operation without a notice mapping fails here.
 */

import { randomUUID } from 'node:crypto';
import type { Response } from 'supertest';
import { setupTestDb } from '@tests/setup-test-db';
import { eventually } from '@tests/eventually';
import { api, authenticateAs } from '@tests/http';
import { createUser } from '@modules/users/tests/factories';
import { countersOf, createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { OrderStatus } from '@types';
import { fulfillmentOrdersOf } from '@modules/delivery/tests/factories';
import { idempotencyRecordModel } from '@infrastructure/http/middlewares/idempotency-model';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { notificationsService } from '@modules/notifications';
import { callerInScope } from '@kernel/permissions';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { asRole } from '@tests/callers';

// The queue, not the copy.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));

/** Stands in for the mail queue; the cases assert which mail was enqueued. */
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    mockEnqueueEmail.mockReset();
    mockEnqueueEmail.mockResolvedValue(undefined);
});

/** An administrator who can act today (an authenticator app armed): the one who is told. */
const recipient = () =>
    createUser(
        {
            email: 'recipient@example.com',
            username: 'recipient',
            authenticatorEnabledAt: new Date()
        },
        'admin'
    );

/** The outcome-unknown notices in the recipient's bell (a refund's own to-do shares it). */
const bellOf = (userId: string) =>
    notificationsService
        .listVisible(
            callerInScope({ ...asRole('admin', userId), tenantId: DEPLOYMENT_TENANT_ID }, 'tenant')
        )
        .then(({ items }) =>
            items.filter(({ code }) => code === 'shop-tasks.staff.outcome-unknown')
        );

/** The addresses the staff-notice mail went to, one entry per mail queued so far. */
const noticeMailRecipients = (): string[] =>
    mockEnqueueEmail.mock.calls
        // Not every staff-notice mail is this one: a refund's own events mail staff too.
        .filter(
            ([envelope, template]) =>
                template === 'notifications.staff-notice' &&
                envelope.subject?.startsWith('Check the result') === true
        )
        .map(([envelope]) => envelope.to)
        .toSorted();

/**
 * Put the ledger record of `key` back to what a crash between the commit and the done-mark leaves:
 * in flight, last touched an hour ago. Written to the raw collection, since the model would restamp.
 *
 * @param key - the `Idempotency-Key` of the attempt that "crashed"
 */
const crashAfterCommit = (key: string): Promise<unknown> => {
    const anHourAgo = new Date(Date.now() - 60 * 60_000);
    return idempotencyRecordModel.collection.updateOne(
        { key },
        {
            $set: { state: 'in_flight', updatedAt: anHourAgo, createdAt: anHourAgo },
            $unset: { status: '', body: '', headers: '', contentType: '', location: '' }
        }
    );
};

/** The error code of a response, or `undefined`. */
const codeOf = (response: Response): string | undefined =>
    (response.body as { errors?: { code?: string }[] }).errors?.[0]?.code;

/** One do-not-retry operation: how to send it, and what it must leave behind exactly once. */
interface Case {
    /** The operation's name as the notice carries it. */
    operation: string;
    /** Sets up the subject, and returns the sender and what the notice must name. */
    arrange: () => Promise<{
        send: (key: string) => Promise<Response>;
        subjectName: string;
        subjectId: string;
        /** A read of the effect the write leaves; it must be the same after the retry. */
        effect: () => Promise<unknown>;
    }>;
}

/** One row per operation whose outcome can be unknown, with how to set it up. */
const CASES: Case[] = [
    {
        operation: 'refund',
        arrange: async () => {
            const { user, bearer: customer } = await authenticateAs('user');
            const product = await createProduct({ price: '10.00' });
            const order = await createOrder(user, [toOrderItem(product, 2)]);
            const intent = await api()
                .post('/payments')
                .set('Authorization', customer)
                .send({ orderId: String(order._id) });
            const paymentId = String(intent.body.id);
            await api()
                .post(`/payments/${paymentId}/confirm`)
                .set('Authorization', customer)
                .send({ paymentMethodRef: 'pm_card_visa' })
                .expect(200);
            const { bearer: admin } = await authenticateAs('admin');
            return {
                send: (key) =>
                    api()
                        .post(`/payments/${paymentId}/refunds`)
                        .set('Authorization', admin)
                        .set('Idempotency-Key', key),
                subjectName: order.orderNumber,
                subjectId: String(order._id),
                effect: () =>
                    api()
                        .get(`/payments/${paymentId}`)
                        .set('Authorization', admin)
                        .then(({ body }) => ({
                            refunds: (body as { refunds: unknown[] }).refunds.length,
                            refunded: (body as { amountRefunded: string }).amountRefunded
                        }))
            };
        }
    },
    {
        operation: 'ship',
        arrange: async () => {
            const { user } = await authenticateAs('user');
            const product = await createProduct({ price: '10.00', onHand: 5 });
            const order = await createOrder(user, [toOrderItem(product, 1)], {
                status: OrderStatus.processing
            });
            const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
            const { bearer: admin } = await authenticateAs('admin');
            return {
                send: (key) =>
                    api()
                        .post(
                            `/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}/shipments`
                        )
                        .set('Authorization', admin)
                        .set('Idempotency-Key', key)
                        .send({}),
                subjectName: order.orderNumber,
                subjectId: String(order._id),
                effect: () =>
                    api()
                        .get(`/orders/${String(order._id)}/shipments`)
                        .set('Authorization', admin)
                        .then(({ body }) => (body as { items: unknown[] }).items.length)
            };
        }
    },
    ...(['receive', 'adjust'] as const).map((verb): Case => ({
        operation: `${verb}-stock`,
        arrange: async () => {
            const product = await createProduct({ title: 'Cedar Toy', onHand: 10 });
            const { bearer: admin } = await authenticateAs('admin');
            return {
                send: (key) =>
                    api()
                        .post(`/inventory/levels/${String(product._id)}/${verb}`)
                        .set('Authorization', admin)
                        .set('Idempotency-Key', key)
                        .send(verb === 'receive' ? { quantity: 5 } : { delta: -2 }),
                subjectName: 'Cedar Toy',
                subjectId: String(product._id),
                effect: () => countersOf(product._id).then(({ onHand }) => onHand)
            };
        }
    }))
];

describe.each(CASES)('$operation whose first attempt never reported an outcome', (scenario) => {
    it('answers outcome unknown, runs nothing again, tells staff once and replays after that', async () => {
        const staff = await recipient();
        const { send, subjectName, subjectId, effect } = await scenario.arrange();
        const key = randomUUID();
        const first = await send(key);
        expect(first.status).toBeLessThan(300);
        const afterFirst = await effect();
        // The record of the first attempt is written after the answer left; wait for it.
        await eventually(() => idempotencyRecordModel.exists({ key, state: 'done' }).then(Boolean));
        await crashAfterCommit(key);

        const retry = await send(key);

        expect([retry.status, codeOf(retry)]).toEqual([409, 'IDEMPOTENCY_OUTCOME_UNKNOWN']);
        expect(retry.headers['retry-after']).toBeUndefined();
        await expect(effect()).resolves.toEqual(afterFirst);
        // Told one after another, mail last: wait for the whole audience, not the first of it.
        await eventually(() => noticeMailRecipients().length >= 2);
        const mailed = noticeMailRecipients();
        // Everyone who does the work is mailed once: the account that sent the write is one of them.
        expect(mailed).toContain('recipient@example.com');
        expect(new Set(mailed).size).toBe(mailed.length);
        const notices = await bellOf(staff.id);
        expect(notices).toHaveLength(1);
        expect(notices[0]).toMatchObject({
            code: 'shop-tasks.staff.outcome-unknown',
            severity: 'error',
            params: { operation: scenario.operation, subjectId, subjectName }
        });

        const replay = await send(key);

        expect([replay.status, codeOf(replay)]).toEqual([409, 'IDEMPOTENCY_OUTCOME_UNKNOWN']);
        expect(replay.headers['idempotent-replayed']).toBe('true');
        await expect(effect()).resolves.toEqual(afterFirst);
        await expect(bellOf(staff.id)).resolves.toHaveLength(1);
        expect(noticeMailRecipients()).toEqual(mailed);
    });
});
