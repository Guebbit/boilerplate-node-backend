/**
 * @module
 * Erasing an account cancels its never-paid orders — through the reservation sweep's own path, so
 * the stock hold goes back — and only AFTER the erasure committed. A paid order is the invoice and
 * is only detached, never cancelled. Driven through `userService.remove` with the real module
 * wiring: a direct call to the hook would pass even if `orders/module.ts` stopped registering it.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import {
    createOrder,
    toOrderItem,
    markOrderPaidAt,
    readOrder,
    forceOrderStatus
} from '@modules/orders/tests/factories';
import { userService } from '@modules/users';
import { inventoryService } from '@modules/inventory';
import { resetDomainEvents } from '@kernel/events';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { OrderStatus, StockMovementReason } from '@types';

// The queue, not the copy: the assertion is that no mail goes to an erased account's address.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    mockEnqueueEmail.mockClear();
    registerCheckoutModules();
});

afterEach(() => resetDomainEvents());

/**
 * A pending order for `user` whose units are really held, the way checkout leaves it.
 * @param user - the buyer
 * @param quantity - how many units the hold takes
 */
const heldOrderFor = async (user: Awaited<ReturnType<typeof createUser>>, quantity = 3) => {
    const product = await createProduct({ onHand: 10 });
    const order = await createOrder(user, [toOrderItem(product, quantity)]);
    const outcome = await inventoryService.reserveForOrder(String(order._id), [
        { productId: String(product._id), quantity }
    ]);
    expect(outcome.held).toBe(true);
    return { order, product };
};

describe('orders — erasing an account cancels its never-paid orders', () => {
    it('cancels the order and gives the held units back', async () => {
        const user = await createUser();
        const { order, product } = await heldOrderFor(user);
        expect(await countersOf(product._id)).toMatchObject({ onHand: 10, reserved: 3 });

        await userService.remove(user, true);

        expect((await readOrder(String(order._id)))!.status).toBe(OrderStatus.cancelled);
        expect(await countersOf(product._id)).toEqual({ onHand: 10, reserved: 0, available: 10 });
    });

    it('leaves a reserve followed by a release in the stock ledger', async () => {
        const user = await createUser();
        const { order, product } = await heldOrderFor(user);

        await userService.remove(user, true);

        const { items } = await inventoryService.listMovements({
            productId: String(product._id)
        });
        const reasons = items
            .filter((movement) => movement.reference === String(order._id))
            .map((movement) => movement.reason);
        expect(reasons).toEqual(
            expect.arrayContaining([StockMovementReason.reserve, StockMovementReason.release])
        );
    });

    it('detaches the order as before: no userId, anonymization due at once', async () => {
        const user = await createUser();
        const { order } = await heldOrderFor(user);

        await userService.remove(user, true);

        const reloaded = await readOrder(String(order._id));
        expect(reloaded!.userId).toBeUndefined();
        expect(reloaded!.anonymizeAfter).toBeDefined();
    });

    it('cancels every never-paid order of the account, not just one', async () => {
        const user = await createUser();
        const first = await heldOrderFor(user, 1);
        const second = await heldOrderFor(user, 2);

        await userService.remove(user, true);

        expect((await readOrder(String(first.order._id)))!.status).toBe(OrderStatus.cancelled);
        expect((await readOrder(String(second.order._id)))!.status).toBe(OrderStatus.cancelled);
        expect(await countersOf(first.product._id)).toMatchObject({ reserved: 0 });
        expect(await countersOf(second.product._id)).toMatchObject({ reserved: 0 });
    });

    it('does not mail the erased account’s address', async () => {
        const user = await createUser();
        await heldOrderFor(user);

        await userService.remove(user, true);

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('leaves a paid order paid — it is the invoice, only detached', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 10 });
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.paid
        });
        await markOrderPaidAt(String(order._id), new Date());

        await userService.remove(user, true);

        const reloaded = await readOrder(String(order._id));
        expect(reloaded!.status).toBe(OrderStatus.paid);
        expect(reloaded!.userId).toBeUndefined();
    });

    it('leaves an already-cancelled order alone', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        await forceOrderStatus(String(order._id), OrderStatus.cancelled);

        await userService.remove(user, true);

        expect((await readOrder(String(order._id)))!.status).toBe(OrderStatus.cancelled);
    });

    it("does not touch another account's pending order", async () => {
        const erased = await createUser({ email: 'erased@example.com' });
        const other = await createUser({ email: 'other@example.com' });
        const { order, product } = await heldOrderFor(other);

        await userService.remove(erased, true);

        expect((await readOrder(String(order._id)))!.status).toBe(OrderStatus.pending);
        expect(await countersOf(product._id)).toMatchObject({ reserved: 3 });
    });

    it('cancels nothing for a soft delete — the account can still come back', async () => {
        const user = await createUser();
        const { order } = await heldOrderFor(user);

        await userService.remove(user, false);

        expect((await readOrder(String(order._id)))!.status).toBe(OrderStatus.pending);
    });
});
