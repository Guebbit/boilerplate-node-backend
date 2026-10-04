/**
 * @module
 * `payment.succeeded` rides the transactional outbox: it is written in the same transaction that
 * discharges the settlement's owed-effects marker, so a settlement that dies after charging still
 * announces — the sweep finishes it, the relay publishes it. Real Mongo throughout. See
 * docs/tools/outbox.md.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironment } from '@tests/environment';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { outboxEventModel, relayOutbox, settleOutboxNudges } from '@kernel/outbox';
import { orderService } from '@modules/orders';
import { inventoryService } from '@modules/inventory';
import { createIntent, confirmPayment, retryPendingEffects } from '@modules/payments/services';
import { announcePaymentSucceeded, recordDecline } from '@modules/payments/services/announce';
import { paymentRepository } from '@modules/payments/repository';
import { PAYMENT_FAILED, PAYMENT_SUCCEEDED } from '@modules/payments/events';
import paymentsModule from '@modules/payments/module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asCustomer, testCallerContext, callerContextAs } from '@tests/callers';

setupTestDb();

/** Every `payment.succeeded` a subscriber heard: the order and the outbox row's stable id. */
let heard: { orderId: string; eventId?: string }[];

beforeEach(() => {
    heard = [];
    registerCheckoutModules([paymentsModule]);
    onDomainEvent(PAYMENT_SUCCEEDED, ({ orderId }, meta) => {
        heard.push({ orderId, eventId: meta.eventId });
    });
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A real placed order: units held, nothing sold yet. */
const placedOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ onHand: 10 });
    const created = await orderService.create(
        user.id,
        user.email,
        [{ productId: String(product._id), quantity: 2 }],
        callerContextAs('admin')
    );
    return { user, order: created.data! };
};

/** Intent, then a good card. */
const payFor = async (orderId: string, user: { id: string }) => {
    const intent = await createIntent(orderId, asCustomer(user.id));
    return confirmPayment(
        String(intent.success && intent.data?.id),
        'pm_card_visa',
        asCustomer(user.id),
        testCallerContext
    );
};

describe('a settlement that completes', () => {
    it('announces through the outbox, once, and the marker is gone', async () => {
        const { user, order } = await placedOrder();

        await payFor(String(order._id), user);
        await settleOutboxNudges();

        const rows = await outboxEventModel.find({ name: PAYMENT_SUCCEEDED }).lean();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            name: 'payment.succeeded',
            aggregateId: String(order._id),
            status: 'published'
        });
        expect(heard).toEqual([{ orderId: String(order._id), eventId: String(rows[0]._id) }]);
        expect((await paymentRepository.findByOrderId(String(order._id)))!.pendingEffects).toEqual(
            []
        );
    });

    it('announces nothing a second time when asked again', async () => {
        const { user, order } = await placedOrder();
        await payFor(String(order._id), user);
        await settleOutboxNudges();
        const payment = (await paymentRepository.findByOrderId(String(order._id)))!;

        // The marker is already gone: this caller is not the one that discharged it.
        expect(await announcePaymentSucceeded(String(payment._id), String(order._id))).toBe(false);

        expect(await outboxEventModel.countDocuments({ name: PAYMENT_SUCCEEDED })).toBe(1);
    });
});

describe('a settlement that dies after charging', () => {
    it('announces nothing at first, then the sweep and the relay still emit the event', () =>
        withEnvironment('NODE_PAYMENT_EFFECT_RETRY_MINUTES', '0', async () => {
            const { user, order } = await placedOrder();
            jest.spyOn(inventoryService, 'commitForOrder').mockRejectedValueOnce(
                new Error('connection reset')
            );
            await expect(payFor(String(order._id), user)).rejects.toThrow('connection reset');

            // The money moved, but the settlement never reached its announcement.
            expect(await outboxEventModel.countDocuments({ name: PAYMENT_SUCCEEDED })).toBe(0);
            expect(heard).toEqual([]);

            expect(await retryPendingEffects()).toBe(1);
            expect(await outboxEventModel.countDocuments({ name: PAYMENT_SUCCEEDED })).toBe(1);
            await settleOutboxNudges();
            await relayOutbox();

            expect(heard.map(({ orderId }) => orderId)).toEqual([String(order._id)]);
        }));

    it('announces nothing when the order was cancelled meanwhile — the refund path owns that', () =>
        withEnvironment('NODE_PAYMENT_EFFECT_RETRY_MINUTES', '0', async () => {
            const { user, order } = await placedOrder();
            jest.spyOn(inventoryService, 'commitForOrder').mockRejectedValueOnce(
                new Error('connection reset')
            );
            await expect(payFor(String(order._id), user)).rejects.toThrow('connection reset');
            await orderService.cancelById(String(order._id), asCustomer(user.id));

            await retryPendingEffects();
            await relayOutbox();

            // The refund the cancel owes announces itself; the payment never does.
            expect(await outboxEventModel.countDocuments({ name: PAYMENT_SUCCEEDED })).toBe(0);
            expect(heard).toEqual([]);
        }));
});

/** An order with a card intent that nobody has confirmed: the state a decline lands on. */
const awaitingConfirmation = async () => {
    const { user, order } = await placedOrder();
    await createIntent(String(order._id), asCustomer(user.id));
    return String(order._id);
};

describe('a declined payment', () => {
    it('writes the decline and its outbox row together, then delivers payment.failed once', async () => {
        const orderId = await awaitingConfirmation();
        const failures: { orderId: string; eventId?: string }[] = [];
        onDomainEvent(PAYMENT_FAILED, (payload, meta) => {
            failures.push({ orderId: payload.orderId, eventId: meta.eventId });
        });

        const declined = await recordDecline(orderId, {});
        await settleOutboxNudges();

        expect(declined).toMatchObject({ status: 'declined' });
        const rows = await outboxEventModel.find({ name: PAYMENT_FAILED }).lean();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ aggregateId: orderId, status: 'published' });
        expect(failures).toEqual([{ orderId, eventId: String(rows[0]._id) }]);
    });

    it('rolls the decline back when its outbox row cannot be written', async () => {
        const orderId = await awaitingConfirmation();
        jest.spyOn(outboxEventModel, 'create').mockRejectedValueOnce(new Error('disk full'));

        await expect(recordDecline(orderId, {})).rejects.toThrow('disk full');

        expect((await paymentRepository.findByOrderId(orderId))!.status).toBe(
            'requires_confirmation'
        );
        expect(await outboxEventModel.countDocuments({ name: PAYMENT_FAILED })).toBe(0);
    });

    it('announces nothing for a decline that lost its race', async () => {
        const orderId = await awaitingConfirmation();
        await paymentRepository.updateStatusIfIn(orderId, ['requires_confirmation'], 'succeeded');

        expect(await recordDecline(orderId, {})).toBeNull();

        expect(await outboxEventModel.countDocuments({ name: PAYMENT_FAILED })).toBe(0);
    });
});
