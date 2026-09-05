/**
 * @module
 * Erasure detaches an order from its account rather than deleting it, and
 * `ops/reap-orders.ts`'s sweep scrubs the remaining PII once the retention window elapses.
 * The cascade half (`USER_DELETED` → `detachUserId`) is proved through real module wiring, same
 * as `cart`'s own cascade suite — a direct call to the service function would pass even if
 * `orders/module.ts` stopped subscribing.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/fixtures';
import { createProduct } from '@modules/products/tests/fixtures';
import { createOrder, toOrderItem } from '@modules/orders/tests/fixtures';
import { orderRepository } from '@modules/orders';
import { orderService } from '@modules/orders/service';
import { userService } from '@modules/users';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import ordersModule from '@modules/orders/module';
import inventoryModule from '@modules/inventory/module';
import productsModule from '@modules/products/module';
import usersModule from '@modules/users/module';
import accountModule from '@modules/account/module';
import cartModule from '@modules/cart/module';
import deliveryModule from '@modules/delivery/module';

setupTestDb();

describe('orders — detach on account erasure', () => {
    const originalRetention = process.env.NODE_ORDER_PII_RETENTION_DAYS;

    beforeEach(() => {
        registerModules([
            accountModule,
            deliveryModule,
            productsModule,
            usersModule,
            inventoryModule,
            ordersModule,
            cartModule
        ]);
    });

    afterEach(() => {
        resetDomainEvents();
        if (originalRetention === undefined) delete process.env.NODE_ORDER_PII_RETENTION_DAYS;
        else process.env.NODE_ORDER_PII_RETENTION_DAYS = originalRetention;
    });

    it('unsets userId and schedules anonymization when the account is hard-deleted', async () => {
        process.env.NODE_ORDER_PII_RETENTION_DAYS = '7';
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        await userService.remove(user, true);

        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.userId).toBeUndefined();
        expect(reloaded!.anonymizeAfter).toBeDefined();
        const daysAhead =
            (reloaded!.anonymizeAfter!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
        expect(daysAhead).toBeGreaterThan(6.9);
        expect(daysAhead).toBeLessThan(7.1);
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
            }
        });
        await orderRepository.detachUserId(String(user._id), new Date(Date.now() - 1000));

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
    });

    it('leaves an order with no shippingAddress at all working, scrubbing only email', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        await orderRepository.detachUserId(String(user._id), new Date(Date.now() - 1000));

        await expect(orderService.anonymizeDueOrders()).resolves.toBe(1);

        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.email).toBe('anonymized@deleted.invalid');
        expect(reloaded!.shippingAddress).toBeUndefined();
    });

    it('does not touch an order whose anonymizeAfter has not arrived yet', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        await orderRepository.detachUserId(String(user._id), new Date(Date.now() + 100_000));

        await expect(orderService.anonymizeDueOrders()).resolves.toBe(0);

        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.email).toBe(user.email);
    });

    it('never rescrubs an order it already anonymized', async () => {
        const user = await createUser();
        const product = await createProduct();
        await createOrder(user, [toOrderItem(product, 1)]);
        await orderRepository.detachUserId(String(user._id), new Date(Date.now() - 1000));
        await orderService.anonymizeDueOrders();

        // `anonymizeAfter` is unset by the first sweep, so a second run finds nothing due.
        await expect(orderService.anonymizeDueOrders()).resolves.toBe(0);
    });
});
