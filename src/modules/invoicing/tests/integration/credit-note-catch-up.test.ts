/**
 * @module
 * The credit notes a dead invoice event made the refunds skip: reviving the invoice issues the
 * invoice and then one note per settled refund, oldest first, never twice, and none for a refund
 * that has not settled. Real Mongo, through `payments`' own door and the real `module.ts`
 * subscription to the paid event.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerModules } from '@kernel/registry';
import { emitDomainEvent, resetDomainEvents } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
import usersModule from '@modules/users/module';
import productsModule from '@modules/products/module';
import inventoryModule from '@modules/inventory/module';
import ordersModule from '@modules/orders/module';
import paymentsModule from '@modules/payments/module';
import invoicingModule from '@modules/invoicing/module';
import { ORDER_STATUS_CHANGED } from '@modules/orders';
import { paymentService } from '@modules/payments';
import { providerRefOf, refundOrderPayment } from '@modules/payments/tests/factories';
import { setFakeRefundFailure } from '@scenarios/support/doubles/payments/fake';
import { createProduct } from '@modules/products/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { asCustomer, asAdmin, testCallerContext, callerContextAs } from '@tests/callers';
import { eventually } from '@tests/eventually';
import { creditNoteModel, invoiceModel } from '../../model';
import { invoicingRepository } from '../../repository';
import { waitForInvoice } from '../factories';

setupTestDb();

beforeEach(() => {
    registerModules([
        usersModule,
        productsModule,
        inventoryModule,
        ordersModule,
        paymentsModule,
        invoicingModule
    ]);
});

afterEach(() => resetDomainEvents());

/** A customer who paid 100.00 and whose invoice was frozen, then LOST: the dead invoice event. */
const paidWithDeadInvoice = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 50 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    const orderId = String(order._id);
    const intent = await paymentService.createIntent(orderId, asCustomer(user.id));
    if (!intent.success) throw new Error('intent refused');
    await paymentService.confirmPayment(
        intent.data.id,
        'pm_card_visa',
        asCustomer(user.id),
        testCallerContext
    );
    await waitForInvoice(orderId);
    return { orderId };
};

/** Refund `amount` as an operator, and let the credit note's listener run. */
const refund = (orderId: string, amount: number) =>
    refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount }).then(() =>
        settleOutboxNudges()
    );

/** Forget the invoice and its notes: what an order looks like when the invoice step died. */
const loseInvoice = (orderId: string) =>
    Promise.all([
        invoiceModel.deleteMany({ orderId }).exec(),
        creditNoteModel.deleteMany({ orderId }).exec()
    ]);

/** Replay the paid event, as reviving the dead outbox row does. */
const revive = (orderId: string) =>
    emitDomainEvent(ORDER_STATUS_CHANGED, { orderId, from: 'pending', to: 'paid' });

describe('reviving a dead invoice event', () => {
    it('issues the invoice, then one note per settled refund in settlement order, once', async () => {
        const { orderId } = await paidWithDeadInvoice();
        await refund(orderId, 30);
        await refund(orderId, 20);
        await loseInvoice(orderId);
        await expect(invoicingRepository.findCreditNotesByOrderId(orderId)).resolves.toEqual([]);

        await revive(orderId);
        await revive(orderId);

        const invoice = await waitForInvoice(orderId);
        await eventually(() =>
            invoicingRepository
                .findCreditNotesByOrderId(orderId)
                .then((notes) => notes.length === 2)
        );
        const notes = await invoicingRepository.findCreditNotesByOrderId(orderId);
        expect(notes.map((note) => note.grandTotal).toSorted()).toEqual([20, 30]);
        expect(notes.every((note) => String(note.invoiceId) === String(invoice._id))).toBe(true);
    });

    it('issues no note for a refund that has not settled', async () => {
        const { orderId } = await paidWithDeadInvoice();
        setFakeRefundFailure(await providerRefOf(orderId), 'declined');
        await refund(orderId, 30);
        await loseInvoice(orderId);

        await revive(orderId);

        await waitForInvoice(orderId);
        await expect(invoicingRepository.findCreditNotesByOrderId(orderId)).resolves.toEqual([]);
    });
});
