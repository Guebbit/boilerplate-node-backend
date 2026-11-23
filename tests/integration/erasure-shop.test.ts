// requires-module: orders, payments, invoicing, returns, cart, wishlist, stock-alerts, products
/**
 * @module
 * What a hard delete (Art. 17) takes and what it must leave once the account has bought: the
 * address book and the contact tasks go with the account, while the records the law makes the shop
 * keep — invoices, credit notes, returns — stay. `personal-data-erasure.test.ts` only checks that a
 * hook is declared; this runs the real cascade, so a future "erase everything" change that reaches
 * a tax record fails here.
 *
 * The second block is the shop's half of the user's ask: after a scheduled self-deletion has run,
 * no collection still names the account except the ones the law lets the shop keep. The rest of
 * that sweep is `tests/integration/erasure.test.ts`.
 */

import { refundOrderPayment, payByCard } from '@modules/payments/tests/factories';
import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { resetDomainEvents } from '@kernel/events';
import { asAdmin, asCustomer, callerContextAs, testCallerContext } from '@tests/callers';
import { collectionsNaming, KEPT_BY_LAW } from '@tests/erasure-sweep';
import addressesModule from '@modules/addresses/module';
import invoicingModule from '@modules/invoicing/module';
import paymentsModule from '@modules/payments/module';
import returnsModule from '@modules/returns/module';
import tasksModule from '@modules/tasks/module';
import { paymentService } from '@modules/payments';
import { createProduct } from '@modules/products/tests/factories';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { userService } from '@modules/users';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { addressBookModel } from '@modules/addresses/model';
import { giveAddress } from '@modules/addresses/tests/factories';
import { invoiceModel, creditNoteModel } from '@modules/invoicing/model';
import { returnModel } from '@modules/returns/model';
import { taskModel } from '@modules/tasks/model';
import { eventually } from '@tests/eventually';
import wishlistModule from '@modules/wishlist/module';
import stockAlertsModule from '@modules/stock-alerts/module';
import { accountService } from '@modules/account/services';
import { cartService } from '@modules/cart/services';
import { wishlistService } from '@modules/wishlist/service';
import { stockAlertModel } from '@modules/stock-alerts/model';
import { anonymizeDueOrders } from '@modules/orders/services/retention';

/** The fake PSP's "always succeeds" reference (`scenarios/support/doubles/payments/fake.ts`). */
const FAKE_SUCCESS_METHOD = 'pm_card_visa';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([
        addressesModule,
        paymentsModule,
        invoicingModule,
        returnsModule,
        tasksModule,
        wishlistModule,
        stockAlertsModule
    ]);
});

afterEach(() => resetDomainEvents());

describe('a hard delete of an account that has bought, been refunded and written in', () => {
    it('takes the address book and the tasks and leaves every legal record', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await giveAddress(user.id);
        const product = await createProduct({ price: '25.00' });
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        const orderId = String(order._id);
        const intent = await paymentService.createIntent(orderId, asCustomer(user.id));
        if (!intent.success) throw new Error('intent refused');
        await paymentService.confirmPayment(
            intent.data.id,
            FAKE_SUCCESS_METHOD,
            asCustomer(user.id),
            testCallerContext
        );
        await eventually(() =>
            invoiceModel.countDocuments({ orderId }).then((count) => count >= 1)
        );
        await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'));
        await eventually(() =>
            creditNoteModel.countDocuments({ orderId }).then((count) => count >= 1)
        );
        await returnModel.create({
            orderId: order._id,
            orderNumber: order.orderNumber ?? 'N-1',
            currency: 'EUR',
            status: 'declined',
            reason: 'defective',
            lines: [{ productId: product._id, quantity: 1, title: 'Shirt', unitPrice: '25.00' }],
            returnPostage: 'consumer'
        });
        await taskModel.create({
            email: 'ada@example.com',
            subject: 'Hello',
            message: 'A question'
        });
        expect(await addressBookModel.countDocuments({ userId: user.id })).toBe(1);

        const loaded = await userRepository.findById(user.id);
        const result = await userService.removeById(loaded!.id, true, callerContextAs('admin'));

        expect(result.success).toBe(true);
        expect(await userRepository.findById(user.id)).toBeNull();
        expect(await addressBookModel.countDocuments({ userId: user.id })).toBe(0);
        expect(await invoiceModel.countDocuments({ orderId })).toBe(1);
        expect(await creditNoteModel.countDocuments({ orderId })).toBe(1);
        expect(await returnModel.countDocuments({ orderId })).toBe(1);
        expect(await taskModel.countDocuments({ email: 'ada@example.com' })).toBe(0);
    });
});

/** Where the shop may still name the account after the purge, on top of the app-wide list. */
const SHOP_KEPT_BY_LAW = {
    ...KEPT_BY_LAW,
    // Art. 17(3)(b): the paid order is the sale; its buyer is scrubbed once the claim window closes.
    orders: 'paid order, tax law',
    // The invoice freezes the billing address (name and address) for the tax duty.
    invoices: 'tax law'
} as const;

describe('a scheduled self-deletion of an account that has shopped', () => {
    it('leaves no shop collection naming the account, except the ones the law keeps', async () => {
        const email = 'shopper@example.com';
        const user = await createUser({ email, verifiedAt: new Date() }, 'customer');
        const product = await createProduct({ price: '25.00', onHand: 10 });
        await cartService.addItemById(user.id, String(product._id), 1);
        await wishlistService.add(user.id, String(product._id), testCallerContext);
        await stockAlertModel.create({ userId: user._id, productId: product._id });
        await createOrder(user, [toOrderItem(product, 1)]);
        const paid = await createOrder(user, [toOrderItem(product, 1)]);
        await payByCard(paid, user);
        await eventually(() =>
            invoiceModel.countDocuments({ orderId: paid._id }).then((count) => count >= 1)
        );
        await returnModel.create({
            orderId: paid._id,
            orderNumber: paid.orderNumber ?? 'N-1',
            currency: 'EUR',
            status: 'declined',
            reason: 'defective',
            lines: [{ productId: product._id, quantity: 1, title: 'Shirt', unitPrice: '25.00' }],
            returnPostage: 'consumer'
        });
        /**
         * The seeds landed: every home below names the account before the purge, so an empty
         * answer afterwards means the cascade worked, not that nothing was ever written.
         */
        expect(await collectionsNaming([user.id.toLowerCase(), email])).toEqual(
            expect.arrayContaining(['carts', 'orders', 'payments', 'stockalerts', 'wishlists'])
        );
        const loaded = await userRepository.findById(user.id);
        await accountService.scheduleAccountDeletion(loaded!, testCallerContext);
        // The app clock reaches the date: the grace is the only thing that decides when.
        await userRepository.updateMany(
            { _id: user.id },
            { $set: { purgeAt: new Date(Date.now() - 1000) } }
        );

        const purged = await accountService.purgeScheduledDeletions();
        await anonymizeDueOrders();

        expect(purged.purged).toBe(1);
        expect(await userRepository.findById(user.id)).toBeNull();
        const named = await collectionsNaming([user.id.toLowerCase(), email]);
        expect(named.filter((name) => !(name in SHOP_KEPT_BY_LAW))).toEqual([]);
    });
});
