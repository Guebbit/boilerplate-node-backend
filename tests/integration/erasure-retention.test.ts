/**
 * @module
 * What a hard delete (Art. 17) takes and what it must leave: the address book goes with the
 * account, while the records the law makes the shop keep — invoices, credit notes, returns, the
 * feedback ticket — stay. `personal-data-erasure.test.ts` only checks that a hook is declared; this
 * runs the real cascade, so a future "erase everything" change that reaches a tax record fails here.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { resetDomainEvents } from '@kernel/events';
import { asAdmin, asCustomer, callerContextAs, testCallerContext } from '@tests/callers';
import addressesModule from '@modules/addresses/module';
import invoicingModule from '@modules/invoicing/module';
import paymentsModule from '@modules/payments/module';
import returnsModule from '@modules/returns/module';
import feedbackModule from '@modules/feedback/module';
import { createIntent, confirmPayment, paymentService } from '@modules/payments';
import { createProduct } from '@modules/products/tests/factories';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { userService } from '@modules/users';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { addressBookModel } from '@modules/addresses/model';
import { giveAddress } from '@modules/addresses/tests/factories';
import { invoiceModel, creditNoteModel } from '@modules/invoicing/model';
import { returnModel } from '@modules/returns/model';
import { feedbackRequestModel } from '@modules/feedback/model';

/** The fake PSP's "always succeeds" reference (`scenarios/support/doubles/payments/fake.ts`). */
const FAKE_SUCCESS_METHOD = 'pm_card_visa';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([
        addressesModule,
        paymentsModule,
        invoicingModule,
        returnsModule,
        feedbackModule
    ]);
});

afterEach(() => resetDomainEvents());

/** Polls a fire-and-forget listener's own write until it lands, or gives up. */
const waitUntil = async (count: () => Promise<number>, wanted: number, timeoutMs = 3000) => {
    const startedAt = Date.now();
    while ((await count()) < wanted) {
        if (Date.now() - startedAt > timeoutMs) throw new Error('waitUntil: timed out');
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

describe('a hard delete of an account that has bought, been refunded and written in', () => {
    it('takes the address book and leaves every legal record', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await giveAddress(user.id);
        const product = await createProduct({ price: 25 });
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        const orderId = String(order._id);
        const intent = await createIntent(orderId, asCustomer(user.id));
        if (!intent.success) throw new Error('intent refused');
        await confirmPayment(
            intent.data.id,
            FAKE_SUCCESS_METHOD,
            asCustomer(user.id),
            testCallerContext
        );
        await waitUntil(() => invoiceModel.countDocuments({ orderId }), 1);
        await paymentService.refundByOrder(orderId, asAdmin(), callerContextAs('admin'));
        await waitUntil(() => creditNoteModel.countDocuments({ orderId }), 1);
        await returnModel.create({
            orderId: order._id,
            orderNumber: order.orderNumber ?? 'N-1',
            currency: 'EUR',
            status: 'declined',
            reason: 'defective',
            lines: [{ productId: product._id, quantity: 1, title: 'Shirt', unitPrice: 25 }],
            returnPostage: 'consumer'
        });
        await feedbackRequestModel.create({
            email: 'ada@example.com',
            subject: 'Hello',
            message: 'A question'
        });
        expect(await addressBookModel.countDocuments({ userId: user.id })).toBe(1);

        const loaded = await userRepository.findById(user.id);
        const result = await userService.remove(loaded!, true, callerContextAs('admin'));

        expect(result.success).toBe(true);
        expect(await userRepository.findById(user.id)).toBeNull();
        expect(await addressBookModel.countDocuments({ userId: user.id })).toBe(0);
        expect(await invoiceModel.countDocuments({ orderId })).toBe(1);
        expect(await creditNoteModel.countDocuments({ orderId })).toBe(1);
        expect(await returnModel.countDocuments({ orderId })).toBe(1);
        expect(await feedbackRequestModel.countDocuments({ email: 'ada@example.com' })).toBe(1);
    });
});
