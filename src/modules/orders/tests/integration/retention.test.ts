/**
 * @module
 * Erasure detaches an order from its account rather than deleting it, and
 * `reap:orders`'s sweep scrubs the remaining PII once the retention window elapses.
 * The cascade half (`personalData.erase` → `detachUserId`) is proved through real module wiring,
 * same as `cart`'s own cascade suite — a direct call to the service function would pass even if
 * `orders/module.ts` stopped declaring the hook.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, eraseAsScheduled } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import {
    createOrder,
    toOrderItem,
    detachOrderUserId,
    forceOrderStatus,
    markOrderPaidAt,
    setConformityUntil
} from '@modules/orders/tests/factories';
import { orderRepository } from '../../repository';
import { orderModel } from '../../model';
import { versionOf } from '@infrastructure/persistence/versioning';
import { orderService } from '@modules/orders/services';
import { userService } from '@modules/users';
import { callerContextAs } from '@tests/callers';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel } from '@kernel/outbox';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { OrderStatus } from '@types';
import { setEnvironment } from '@tests/environment';

setupTestDb();

/** The order ids of every `order.redacted` row, plain. */
const redactedIds = () =>
    outboxEventModel
        .find({ name: 'order.redacted' })
        .lean()
        .exec()
        .then((rows) => rows.map((row) => row.aggregateId).toSorted());

/** One day, in milliseconds. */
const DAY = 24 * 60 * 60 * 1000;

describe('orders — detach on account erasure', () => {
    beforeEach(() => {
        registerCheckoutModules();
    });

    afterEach(() => {
        resetDomainEvents();
    });

    it('unsets userId and starts the PII clock when the account is hard-deleted', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        await eraseAsScheduled(user);

        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.userId).toBeUndefined();
        expect(reloaded!.piiClockStartedAt).toBeInstanceOf(Date);
    });

    it('the order itself survives — it is the sale record, not the account', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        await eraseAsScheduled(user);

        await expect(orderRepository.findById(String(order._id))).resolves.not.toBeNull();
    });

    it('leaves the order untouched when the account is only soft-deleted', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        await userService.removeById(user.id, false, callerContextAs('admin'));

        const reloaded = await orderRepository.findById(String(order._id));
        expect(String(reloaded!.userId)).toBe(user._id.toString());
        expect(reloaded!.piiClockStartedAt).toBeUndefined();
    });

    it("does not touch a different account's orders", async () => {
        const erased = await createUser({ email: 'erased@example.com' });
        const untouched = await createUser({ email: 'untouched@example.com' });
        const product = await createProduct();
        const order = await createOrder(untouched, [toOrderItem(product, 1)]);

        await eraseAsScheduled(erased);

        const reloaded = await orderRepository.findById(String(order._id));
        expect(String(reloaded!.userId)).toBe(untouched._id.toString());
    });
});

/** Erases the buyer of a fresh order built by `build`, runs the sweep, returns the order after. */
const eraseAndSweep = async (
    build: (orderId: string) => Promise<unknown>,
    overrides: Parameters<typeof createOrder>[2] = {}
) => {
    const user = await createUser();
    const product = await createProduct();
    const order = await createOrder(user, [toOrderItem(product, 1)], overrides);
    await build(String(order._id));
    await eraseAsScheduled(user);
    const scrubbed = await orderService.anonymizeDueOrders();
    const reloaded = await orderRepository.findById(String(order._id));
    return { scrubbed, order: reloaded! };
};

describe('orders — the claim window decides when a paid order loses its buyer', () => {
    beforeEach(() => registerCheckoutModules());

    afterEach(() => {
        resetDomainEvents();
    });

    it('scrubs a never-paid order on the first run after the erasure', async () => {
        const { scrubbed, order } = await eraseAndSweep(() => Promise.resolve());

        expect(scrubbed).toBe(1);
        expect(order.email).toBe('anonymized@deleted.invalid');
        expect(order.piiClockStartedAt).toBeUndefined();
    });

    it('scrubs a never-paid order even once cancelled', async () => {
        const { scrubbed } = await eraseAndSweep(() => Promise.resolve(), {
            status: OrderStatus.cancelled
        });

        expect(scrubbed).toBe(1);
    });

    it('does not scrub a delivered order before conformityUntil, and does after', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.delivered
        });
        await markOrderPaidAt(String(order._id), new Date(Date.now() - 400 * DAY));
        await setConformityUntil(String(order._id), new Date(Date.now() + 10 * DAY));
        await eraseAsScheduled(user);

        await expect(orderService.anonymizeDueOrders()).resolves.toBe(0);
        await setConformityUntil(String(order._id), new Date(Date.now() - DAY));

        await expect(orderService.anonymizeDueOrders()).resolves.toBe(1);
    });

    it('moves the date with NODE_ORDER_PII_DAYS_AFTER_GUARANTEE', async () => {
        setEnvironment({ NODE_ORDER_PII_DAYS_AFTER_GUARANTEE: '30' });
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.delivered
        });
        await markOrderPaidAt(String(order._id), new Date(Date.now() - 800 * DAY));
        // Guarantee ended 10 days ago: still inside the extra 30.
        await setConformityUntil(String(order._id), new Date(Date.now() - 10 * DAY));
        await eraseAsScheduled(user);

        await expect(orderService.anonymizeDueOrders()).resolves.toBe(0);
        await setConformityUntil(String(order._id), new Date(Date.now() - 31 * DAY));

        await expect(orderService.anonymizeDueOrders()).resolves.toBe(1);
    });

    it('uses paidAt plus the undelivered days for a paid order cancelled without delivery', async () => {
        setEnvironment({ NODE_ORDER_PII_DAYS_UNDELIVERED: '100' });
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.cancelled
        });
        await markOrderPaidAt(String(order._id), new Date(Date.now() - 99 * DAY));
        await eraseAsScheduled(user);

        await expect(orderService.anonymizeDueOrders()).resolves.toBe(0);
        await markOrderPaidAt(String(order._id), new Date(Date.now() - 101 * DAY));

        await expect(orderService.anonymizeDueOrders()).resolves.toBe(1);
    });

    it.each([OrderStatus.paid, OrderStatus.processing, OrderStatus.shipped])(
        'does not scrub an order still %s at the erasure; once delivered it follows conformityUntil',
        async (status) => {
            const user = await createUser();
            const product = await createProduct();
            const order = await createOrder(user, [toOrderItem(product, 1)], { status });
            await markOrderPaidAt(String(order._id), new Date(Date.now() - 900 * DAY));
            await eraseAsScheduled(user);
            await expect(orderService.anonymizeDueOrders()).resolves.toBe(0);

            // Delivered late, after the clock started.
            await forceOrderStatus(String(order._id), OrderStatus.delivered);
            await setConformityUntil(String(order._id), new Date(Date.now() + 5 * DAY));
            await expect(orderService.anonymizeDueOrders()).resolves.toBe(0);
            await setConformityUntil(String(order._id), new Date(Date.now() - DAY));

            await expect(orderService.anonymizeDueOrders()).resolves.toBe(1);
        }
    );

    it('unsets the addresses with their country', async () => {
        const { order } = await eraseAndSweep(() => Promise.resolve(), {
            shippingAddress: {
                fullName: 'Ada Lovelace',
                street: '12 Analytical Engine Rd',
                city: 'London',
                zip: 'SW1A',
                country: 'GB'
            }
        });

        expect(order.shippingAddress).toBeUndefined();
    });

    it('announces order.redacted exactly once per scrub', async () => {
        const { order } = await eraseAndSweep(() => Promise.resolve());
        await orderService.anonymizeDueOrders();

        expect(await redactedIds()).toEqual([String(order._id)]);
    });
});

describe('orders — anonymizeDueOrders (reap-orders sweep)', () => {
    it('scrubs the email and unsets both addresses and the notes once its clock has started', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            shippingAddress: {
                fullName: 'Ada Lovelace',
                street: '12 Analytical Engine Rd',
                city: 'London',
                zip: 'SW1A',
                country: 'GB',
                phone: '+44 20 0000 0000'
            },
            billingAddress: {
                fullName: 'Ada Lovelace',
                street: '1 Accounts Office Way',
                city: 'Leeds',
                zip: 'LS1',
                country: 'GB',
                phone: '+44 113 000 0000'
            },
            notes: 'Leave with the concierge, 2nd floor'
        });
        await detachOrderUserId(String(user._id), new Date(Date.now() - 1000));

        const scrubbed = await orderService.anonymizeDueOrders();

        expect(scrubbed).toBe(1);
        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.email).toBe('anonymized@deleted.invalid');
        // Nothing personal survives — not even the city, zip or country of a half-address.
        expect(reloaded!.shippingAddress).toBeUndefined();
        expect(reloaded!.billingAddress).toBeUndefined();
        expect(reloaded!.notes).toBeUndefined();
        expect(reloaded!.piiClockStartedAt).toBeUndefined();
    });

    it('leaves an order with no address at all working, scrubbing only email', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        await detachOrderUserId(String(user._id), new Date(Date.now() - 1000));

        await expect(orderService.anonymizeDueOrders()).resolves.toBe(1);

        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.email).toBe('anonymized@deleted.invalid');
        expect(reloaded!.shippingAddress).toBeUndefined();
        expect(reloaded!.billingAddress).toBeUndefined();
    });

    it('a scrubbed order still serializes — no address is conjured, nothing to decrypt', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            billingAddress: {
                fullName: 'Ada Lovelace',
                street: '1 Accounts Office Way',
                city: 'Leeds',
                zip: 'LS1',
                country: 'GB'
            }
        });
        await detachOrderUserId(String(user._id), new Date(Date.now() - 1000));

        await orderService.anonymizeDueOrders();

        const wire = (await orderRepository.findById(String(order._id)))!.toJSON();
        expect(wire.billingAddress).toBeUndefined();
        expect(wire.shippingAddress).toBeUndefined();
    });

    it('moves the edit counter, so an edit form opened before the sweep is refused afterwards', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        await detachOrderUserId(String(user._id), new Date(Date.now() - 1000));
        const versionOfOrder = (): Promise<number | undefined> =>
            orderRepository.findById(String(order._id)).then((row) => versionOf(row));
        const before = await versionOfOrder();

        await orderService.anonymizeDueOrders();

        expect(before).toBeDefined();
        expect(await versionOfOrder()).toBeGreaterThan(before ?? Infinity);
    });

    it('does not touch an order whose claim window is still open', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.processing
        });
        await markOrderPaidAt(String(order._id), new Date());
        await detachOrderUserId(String(user._id), new Date());

        await expect(orderService.anonymizeDueOrders()).resolves.toBe(0);

        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.email).toBe(user.email);
    });

    it('never rescrubs an order it already anonymized', async () => {
        const user = await createUser();
        const product = await createProduct();
        await createOrder(user, [toOrderItem(product, 1)]);
        await detachOrderUserId(String(user._id), new Date(Date.now() - 1000));
        await orderService.anonymizeDueOrders();

        // `piiClockStartedAt` is unset by the first sweep, so a second run finds nothing due.
        await expect(orderService.anonymizeDueOrders()).resolves.toBe(0);
    });
});

describe('orders — order.redacted outbox event', () => {
    it('is written once per scrubbed order, and for no order that is not yet due', async () => {
        const user = await createUser();
        const product = await createProduct();
        const due = await createOrder(user, [toOrderItem(product, 1)]);
        // The second order is paid and still open: its window has not even started.
        const later = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.processing
        });
        await markOrderPaidAt(String(later._id), new Date());
        await detachOrderUserId(String(user._id), new Date(Date.now() - 1000));

        await expect(orderService.anonymizeDueOrders()).resolves.toBe(1);

        expect(await redactedIds()).toEqual([String(due._id)]);
    });

    it('is not written again by a rerun', async () => {
        const user = await createUser();
        const product = await createProduct();
        await createOrder(user, [toOrderItem(product, 1)]);
        await detachOrderUserId(String(user._id), new Date(Date.now() - 1000));
        await orderService.anonymizeDueOrders();

        await orderService.anonymizeDueOrders();

        expect(await redactedIds()).toHaveLength(1);
    });

    it('is written for an order whose clock runs on an account that still exists (minimised, not erased)', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        await orderModel.updateOne(
            { _id: order._id },
            { $set: { piiClockStartedAt: new Date(Date.now() - 1000) } },
            { timestamps: false }
        );

        await orderService.anonymizeDueOrders();

        expect(await redactedIds()).toEqual([String(order._id)]);
        expect((await orderRepository.findById(String(order._id)))!.userId).toBeDefined();
    });

    it('announces every order scrubbed in one sweep', async () => {
        const user = await createUser();
        const product = await createProduct();
        const orders = await Promise.all(
            Array.from({ length: 3 }, () => createOrder(user, [toOrderItem(product, 1)]))
        );
        await detachOrderUserId(String(user._id), new Date(Date.now() - 1000));

        await expect(orderService.anonymizeDueOrders()).resolves.toBe(3);

        expect(await redactedIds()).toEqual(orders.map((order) => String(order._id)).toSorted());
    });
});
