/**
 * @module
 * Choosing how many returned units go back on sale: a broken unit is set to 0 on receipt and never
 * reaches the shelf, so it is never handed to a backorder buyer in the same transaction. The refund
 * does not depend on the choice.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { settleOutboxNudges } from '@kernel/outbox';
import { resetDomainEvents } from '@kernel/events';
import { registerAuditSink, type AuditEntry } from '@infrastructure/observability/audit';
import { asAdmin, asCustomer, callerContextAs, testCallerContext } from '@tests/callers';
import { asReject } from '@tests/response';
import { OrderStatus } from '@types';
import { createUser } from '@modules/users/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { carryOrderTo } from '@modules/delivery/tests/factories';
import { inventoryService } from '@modules/inventory';
import { reservationRepository } from '@modules/inventory/tests/factories';
import { paymentService } from '@modules/payments';
import paymentsModule from '@modules/payments/module';
import returnsModule from '../../module';
import { returnService } from '../../services';
import { returnRepository } from '../../repository';

setupTestDb();

/** The audit rows written since the test began. */
let audited: AuditEntry[] = [];

beforeEach(() => {
    registerCheckoutModules([paymentsModule, returnsModule]);
    audited = [];
    registerAuditSink((entry) => audited.push(entry));
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A distinct address per customer. */
let customers = 0;

/**
 * A buyer of two shirts (30.00) and a mug (10.00) who paid by card and has received them, and an
 * approved defective-goods return of all of it, ready to receive.
 */
const approvedReturn = async () => {
    customers += 1;
    const user = await createUser({ email: `restock-${customers}@example.com` });
    const shirt = await createProduct({ title: 'Shirt', price: 30, onHand: 10 });
    const mug = await createProduct({ title: 'Mug', price: 10, onHand: 10 });
    const order = await createOrder(user, [toOrderItem(shirt, 2), toOrderItem(mug, 1)]);
    const orderId = String(order._id);
    await inventoryService.reserveForOrder(orderId, [
        { productId: String(shirt._id), quantity: 2 },
        { productId: String(mug._id), quantity: 1 }
    ]);
    const intent = await paymentService.createIntent(orderId, asCustomer(user.id));
    if (!intent.success) throw new Error('intent refused');
    await paymentService.confirmPayment(
        intent.data.id,
        'pm_card_visa',
        asCustomer(user.id),
        testCallerContext
    );
    await carryOrderTo(orderId, 'delivered');
    const outcome = await returnService.createReturn(
        { orderId, reason: 'defective' },
        asCustomer(user.id),
        callerContextAs('customer', user.id)
    );
    if (!outcome.success) throw new Error('expected a return');
    const id = String(outcome.data._id);
    await returnService.approveReturn(id, callerContextAs('admin'));
    await settleOutboxNudges();
    return { user, shirt, mug, orderId, id };
};

describe('receiving with a restock count', () => {
    it('puts back only the units staff say are sellable, and records the count on each line', async () => {
        const { shirt, mug, id } = await approvedReturn();

        const result = await returnService.receiveReturn(
            id,
            { lines: [{ productId: String(shirt._id), restock: 1 }] },
            callerContextAs('admin')
        );

        expect(result.success).toBe(true);
        expect(await countersOf(shirt._id)).toMatchObject({ onHand: 9 });
        // The mug was not named: it goes back in full.
        expect(await countersOf(mug._id)).toMatchObject({ onHand: 10 });
        const stored = await returnRepository.findById(id);
        expect(stored?.lines.map(({ quantity, restocked }) => [quantity, restocked])).toEqual([
            [2, 1],
            [1, 1]
        ]);
    });

    it('restocks everything when no lines are given, and records it', async () => {
        const { shirt, mug, id } = await approvedReturn();

        await returnService.receiveReturn(id, {}, callerContextAs('admin'));

        expect(await countersOf(shirt._id)).toMatchObject({ onHand: 10 });
        expect(await countersOf(mug._id)).toMatchObject({ onHand: 10 });
        const stored = await returnRepository.findById(id);
        expect(stored?.lines.map(({ restocked }) => restocked)).toEqual([2, 1]);
    });

    it('writes no ledger row for a line set to 0, and refunds the same money', async () => {
        const { shirt, mug, orderId, id } = await approvedReturn();

        const result = await returnService.receiveReturn(
            id,
            {
                lines: [
                    { productId: String(shirt._id), restock: 0 },
                    { productId: String(mug._id), restock: 0 }
                ]
            },
            callerContextAs('admin')
        );

        // Restocking is about the goods, not the money: the same 70.00 goes back.
        expect(result.success && result.data).toMatchObject({ status: 'closed', refundAmount: 70 });
        expect(await countersOf(shirt._id)).toMatchObject({ onHand: 8 });
        const movements = await inventoryService.listMovements({
            productId: String(shirt._id)
        });
        expect(movements.items.filter(({ reason }) => reason === 'restock')).toHaveLength(0);
        const payment = await paymentService.getForOrder(orderId, asAdmin());
        expect(payment.success && payment.data.amountRefunded).toBe(70);
    });

    it('names the per-line counts in the audit row', async () => {
        const { shirt, mug, id } = await approvedReturn();

        await returnService.receiveReturn(
            id,
            { lines: [{ productId: String(shirt._id), restock: 0 }] },
            callerContextAs('admin')
        );

        const row = audited.find(({ action }) => action === 'admin.return.received');
        expect(row?.metadata?.restocked).toEqual([
            { productId: String(shirt._id), restocked: 0 },
            { productId: String(mug._id), restocked: 1 }
        ]);
    });
});

describe('a restock count that cannot stand', () => {
    it.each([
        ['an unknown product', () => ({ productId: 'a'.repeat(24), restock: 1 })],
        ['more than the line holds', (shirt: string) => ({ productId: shirt, restock: 3 })]
    ])(
        'refuses %s with 422 on the entry that carries it, and receives nothing',
        async (_name, entry) => {
            const { shirt, id } = await approvedReturn();

            const result = await returnService.receiveReturn(
                id,
                { lines: [entry(String(shirt._id))] },
                callerContextAs('admin')
            );

            const rejected = asReject(result);
            expect(rejected.status).toBe(422);
            expect(rejected.errors[0]).toMatchObject({
                code: 'RETURN_RESTOCK_INVALID',
                details: { field: 'lines.0.restock' }
            });
            const stored = await returnRepository.findById(id);
            expect(stored?.status).toBe('approved');
            expect(await countersOf(shirt._id)).toMatchObject({ onHand: 8 });
        }
    );

    it('refuses the same product twice, pointing at the second entry', async () => {
        const { shirt, id } = await approvedReturn();
        const productId = String(shirt._id);

        const result = await returnService.receiveReturn(
            id,
            {
                lines: [
                    { productId, restock: 1 },
                    { productId, restock: 1 }
                ]
            },
            callerContextAs('admin')
        );

        expect(asReject(result).errors[0]).toMatchObject({
            code: 'RETURN_RESTOCK_INVALID',
            details: { field: 'lines.1.restock' }
        });
    });
});

/**
 * A lamp with one unit on the shelf, bought by Luca and delivered; then Anna pays for another and
 * waits (a backorder claim). Luca's defective-goods return is approved, ready to receive.
 */
const lucaReturnsWhileAnnaWaits = async () => {
    customers += 1;
    const luca = await createUser({ email: `luca-${customers}@example.com` });
    const anna = await createUser({ email: `anna-${customers}@example.com` });
    const lamp = await createProduct({
        title: 'Lamp',
        price: 80,
        onHand: 1,
        allowBackorder: true
    });
    const lampId = String(lamp._id);
    await inventoryService.setBackorderLimit(lampId, null);

    const lucaOrder = await createOrder(luca, [toOrderItem(lamp, 1)]);
    const lucaOrderId = String(lucaOrder._id);
    await inventoryService.reserveForOrder(lucaOrderId, [{ productId: lampId, quantity: 1 }]);
    const intent = await paymentService.createIntent(lucaOrderId, asCustomer(luca.id));
    if (!intent.success) throw new Error('intent refused');
    await paymentService.confirmPayment(
        intent.data.id,
        'pm_card_visa',
        asCustomer(luca.id),
        testCallerContext
    );
    await carryOrderTo(lucaOrderId, 'delivered');

    // The shelf is empty now; Anna pays for a unit that is not there yet.
    const annaOrder = await createOrder(anna, [toOrderItem(lamp, 1)], {
        status: OrderStatus.paid
    });
    const annaOrderId = String(annaOrder._id);
    await inventoryService.reserveForOrder(annaOrderId, [
        { productId: lampId, quantity: 1, spill: true }
    ]);
    await inventoryService.commitForOrder(annaOrderId);

    const outcome = await returnService.createReturn(
        { orderId: lucaOrderId, reason: 'defective' },
        asCustomer(luca.id),
        callerContextAs('customer', luca.id)
    );
    if (!outcome.success) throw new Error('expected a return');
    const id = String(outcome.data._id);
    await returnService.approveReturn(id, callerContextAs('admin'));
    return { lamp, lampId, annaOrderId, id };
};

/** The kinds Anna's hold carries: `backorder` while she waits, `stock` once she is served. */
const annaHoldKinds = (annaOrderId: string) =>
    reservationRepository
        .findByOrderId(annaOrderId)
        .then((hold) => (hold?.items ?? []).map(({ kind }) => kind));

describe('a broken unit and a waiting backorder', () => {
    it('hands the returned unit to Anna when it is restocked', async () => {
        const { annaOrderId, id } = await lucaReturnsWhileAnnaWaits();
        expect(await annaHoldKinds(annaOrderId)).toEqual(['backorder']);

        await returnService.receiveReturn(id, {}, callerContextAs('admin'));

        expect(await annaHoldKinds(annaOrderId)).toEqual(['stock']);
    });

    it('allocates nothing to Anna when the unit is broken (restock 0)', async () => {
        const { lamp, lampId, annaOrderId, id } = await lucaReturnsWhileAnnaWaits();

        await returnService.receiveReturn(
            id,
            { lines: [{ productId: lampId, restock: 0 }] },
            callerContextAs('admin')
        );

        expect(await annaHoldKinds(annaOrderId)).toEqual(['backorder']);
        expect(await countersOf(lamp._id)).toMatchObject({ onHand: 0 });
    });
});
