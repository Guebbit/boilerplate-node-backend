/**
 * @module
 * Erasure detaches an order from its account rather than deleting it, and
 * `scripts/ops/reap-orders.ts`'s sweep scrubs the remaining PII once the retention window elapses.
 * The cascade half (`USER_DELETED` → `detachUserId`) is proved through real module wiring, same
 * as `cart`'s own cascade suite — a direct call to the service function would pass even if
 * `orders/module.ts` stopped subscribing.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import {
    createOrder,
    toOrderItem,
    detachOrderUserId,
    markOrderPaidAt
} from '@modules/orders/tests/factories';
import { orderRepository } from '../../repository';
import { orderService } from '@modules/orders/services';
import { userService } from '@modules/users';
import { resetDomainEvents } from '@kernel/events';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { OrderStatus } from '@types';

setupTestDb();

describe('orders — detach on account erasure', () => {
    const originalRetention = process.env.NODE_ORDER_PII_RETENTION_DAYS;

    beforeEach(() => {
        registerCheckoutModules();
    });

    afterEach(() => {
        resetDomainEvents();
        if (originalRetention === undefined) delete process.env.NODE_ORDER_PII_RETENTION_DAYS;
        else process.env.NODE_ORDER_PII_RETENTION_DAYS = originalRetention;
    });

    // Each of these three pins the order to `paid` (`markOrderPaidAt`) — the per-order-clock
    // arithmetic they test (`max(now, createdAt + days)`) only applies to an order that actually
    // became the tax record this retention window exists for. A never-paid order's own immediate
    // rule has its own describe block below.

    it('unsets userId and schedules anonymization when the account is hard-deleted', async () => {
        process.env.NODE_ORDER_PII_RETENTION_DAYS = '7';
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        await markOrderPaidAt(String(order._id), new Date());

        await userService.remove(user, true);

        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.userId).toBeUndefined();
        expect(reloaded!.anonymizeAfter).toBeDefined();
        const daysAhead =
            (reloaded!.anonymizeAfter!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
        expect(daysAhead).toBeGreaterThan(6.9);
        expect(daysAhead).toBeLessThan(7.1);
    });

    it('runs the clock from the ORDER, not from today (B17)', async () => {
        process.env.NODE_ORDER_PII_RETENTION_DAYS = '7';
        const user = await createUser();
        const product = await createProduct();
        // Placed 5 days ago: due in ~2 more days, not a fresh 7 counted from the erasure.
        const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            createdAt: fiveDaysAgo
        });
        await markOrderPaidAt(String(order._id), fiveDaysAgo);

        await userService.remove(user, true);

        const reloaded = await orderRepository.findById(String(order._id));
        const daysAhead =
            (reloaded!.anonymizeAfter!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
        expect(daysAhead).toBeGreaterThan(1.9);
        expect(daysAhead).toBeLessThan(2.1);
    });

    it('an order already past its own window is due immediately, not re-extended (B17)', async () => {
        process.env.NODE_ORDER_PII_RETENTION_DAYS = '7';
        const user = await createUser();
        const product = await createProduct();
        const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            createdAt: twentyDaysAgo
        });
        await markOrderPaidAt(String(order._id), twentyDaysAgo);

        await userService.remove(user, true);

        const reloaded = await orderRepository.findById(String(order._id));
        // `$max(now, createdAt + days)` — an order already past its window lands at "now", never
        // a fresh window measured from the erasure.
        expect(reloaded!.anonymizeAfter!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('the order itself survives — it is the invoice, not the account', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        await userService.remove(user, true);

        await expect(orderRepository.findById(String(order._id))).resolves.not.toBeNull();
    });

    it('leaves the order untouched when the account is only soft-deleted', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        await userService.remove(user, false);

        const reloaded = await orderRepository.findById(String(order._id));
        expect(String(reloaded!.userId)).toBe(user._id.toString());
        expect(reloaded!.anonymizeAfter).toBeUndefined();
    });

    it("does not touch a different account's orders", async () => {
        const erased = await createUser({ email: 'erased@example.com' });
        const untouched = await createUser({ email: 'untouched@example.com' });
        const product = await createProduct();
        const order = await createOrder(untouched, [toOrderItem(product, 1)]);

        await userService.remove(erased, true);

        const reloaded = await orderRepository.findById(String(order._id));
        expect(String(reloaded!.userId)).toBe(untouched._id.toString());
    });
});

describe('orders — a never-paid order is due for anonymization AT ONCE (A1)', () => {
    const originalRetention = process.env.NODE_ORDER_PII_RETENTION_DAYS;

    beforeEach(() => registerCheckoutModules());

    afterEach(() => {
        resetDomainEvents();
        if (originalRetention === undefined) delete process.env.NODE_ORDER_PII_RETENTION_DAYS;
        else process.env.NODE_ORDER_PII_RETENTION_DAYS = originalRetention;
    });

    it('is due immediately, not after the retention window, while still pending', async () => {
        process.env.NODE_ORDER_PII_RETENTION_DAYS = '7';
        const user = await createUser();
        const product = await createProduct();
        // Old enough that a paid order's own clock would still have days left on its window.
        const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            createdAt: fiveDaysAgo
        });

        await userService.remove(user, true);

        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.anonymizeAfter!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('is due immediately even once cancelled, as long as it was never paid', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.cancelled
        });

        await userService.remove(user, true);

        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.anonymizeAfter!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('keeps the FULL window for an order that was paid and only later cancelled', async () => {
        // `paidAt` is what decides this, not the CURRENT status — a refunded order was still once
        // a real tax record.
        process.env.NODE_ORDER_PII_RETENTION_DAYS = '7';
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.cancelled
        });
        await markOrderPaidAt(String(order._id), new Date());

        await userService.remove(user, true);

        const reloaded = await orderRepository.findById(String(order._id));
        const daysAhead =
            (reloaded!.anonymizeAfter!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
        expect(daysAhead).toBeGreaterThan(6.9);
        expect(daysAhead).toBeLessThan(7.1);
    });
});

describe('orders — anonymizeDueOrders (reap-orders sweep)', () => {
    it('scrubs email and the shipping name/street once anonymizeAfter has elapsed', async () => {
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
            notes: 'Leave with the concierge, 2nd floor'
        });
        await detachOrderUserId(String(user._id), new Date(Date.now() - 1000));

        const scrubbed = await orderService.anonymizeDueOrders();

        expect(scrubbed).toBe(1);
        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.email).toBe('anonymized@deleted.invalid');
        expect(reloaded!.shippingAddress!.fullName).toBe('Anonymized');
        expect(reloaded!.shippingAddress!.street).toBe('Anonymized');
        expect(reloaded!.shippingAddress!.phone).toBeUndefined();
        // City and country are not personal data on their own — kept.
        expect(reloaded!.shippingAddress!.city).toBe('London');
        expect(reloaded!.shippingAddress!.country).toBe('GB');
        expect(reloaded!.anonymizeAfter).toBeUndefined();
        // B17: the buyer's free-text notes are personal data too, and must not survive the scrub.
        expect(reloaded!.notes).toBeUndefined();
    });

    it('leaves an order with no shippingAddress at all working, scrubbing only email', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        await detachOrderUserId(String(user._id), new Date(Date.now() - 1000));

        await expect(orderService.anonymizeDueOrders()).resolves.toBe(1);

        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.email).toBe('anonymized@deleted.invalid');
        expect(reloaded!.shippingAddress).toBeUndefined();
    });

    it('does not touch an order whose anonymizeAfter has not arrived yet', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        await detachOrderUserId(String(user._id), new Date(Date.now() + 100_000));

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

        // `anonymizeAfter` is unset by the first sweep, so a second run finds nothing due.
        await expect(orderService.anonymizeDueOrders()).resolves.toBe(0);
    });
});
