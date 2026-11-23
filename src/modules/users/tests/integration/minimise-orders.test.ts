// requires-module: orders, products
/**
 * @module
 * What inactivity minimisation does to the account's orders: it starts their PII clock once, keeps
 * the orders and their owner, and a rerun leaves the clock where it was. The account half is
 * `src/modules/users/tests/integration/minimise.test.ts`; this file goes with the shop modules when they are removed.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { resetDomainEvents } from '@kernel/events';
import addressesModule from '@modules/addresses/module';
import { giveAddress } from '@modules/addresses/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import {
    createOrder,
    toOrderItem,
    markOrderPaidAt,
    orderRepository
} from '@modules/orders/tests/factories';
import { accountUserService } from '../../friends/account';
import { createUser } from '@modules/users/tests/factories';
import { userModel } from '../../model';

setupTestDb();

/** A long time ago, comfortably past the cutoff below. */
const LONG_AGO = new Date('2020-01-01T00:00:00Z');

/** The moment `days` days before now. */
const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/** An inactive customer with an address book and one paid order. */
const inactiveCustomerWithOrder = async (name: string) => {
    const user = await createUser({ email: `${name}@minimise.test`, username: name }, 'customer');
    await giveAddress(user.id);
    const product = await createProduct();
    const order = await createOrder(user, [toOrderItem(product, 1)]);
    await markOrderPaidAt(String(order._id), LONG_AGO);
    // `createdAt` is immutable, hence `overwriteImmutable`.
    await userModel
        .updateOne(
            { _id: user.id },
            { $set: { createdAt: LONG_AGO } },
            { timestamps: false, overwriteImmutable: true }
        )
        .exec();
    return { user, orderId: String(order._id) };
};

/** The PII clock on one order. */
const clockOf = (orderId: string) =>
    orderRepository.findById(orderId).then((order) => order?.piiClockStartedAt);

describe('inactivity minimisation and the orders', () => {
    beforeEach(() => {
        registerCheckoutModules([addressesModule]);
    });

    afterEach(() => {
        resetDomainEvents();
    });

    it('starts the orders’ clock and keeps the orders and their owner', async () => {
        const { user, orderId } = await inactiveCustomerWithOrder('quiet');

        const result = await accountUserService.minimiseInactiveBefore(daysAgo(30));

        expect(result).toEqual({ minimised: 1, failed: 0 });
        const order = await orderRepository.findById(orderId);
        expect(order?.piiClockStartedAt).toBeInstanceOf(Date);
        expect(String(order?.userId)).toBe(user.id);
    });

    it('does not restart the orders’ clock on a rerun', async () => {
        const { orderId } = await inactiveCustomerWithOrder('rerun');
        await accountUserService.minimiseInactiveBefore(daysAgo(30));
        const stamped = await clockOf(orderId);

        const again = await accountUserService.minimiseInactiveBefore(daysAgo(30));

        expect(again).toEqual({ minimised: 0, failed: 0 });
        expect(await clockOf(orderId)).toEqual(stamped);
    });
});
