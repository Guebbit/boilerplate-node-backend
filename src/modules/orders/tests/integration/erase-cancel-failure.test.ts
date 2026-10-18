/**
 * @module
 * A failed cancel of an erased account's unpaid order never undoes the erasure: the account is gone,
 * the order is detached, and the delete still answers success (the reservation sweep cancels what
 * was missed when its hold times out).
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem, readOrder } from '@modules/orders/tests/factories';
import { userService } from '@modules/users';
import { resetDomainEvents } from '@kernel/events';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { OrderStatus } from '@types';

// Every cancel fails, as a payment racing in or a write conflict would.
jest.mock('@modules/orders/services/cancel', () => ({
    ...jest.requireActual<typeof import('@modules/orders/services/cancel')>(
        '@modules/orders/services/cancel'
    ),
    cancelForErasureById: () => Promise.reject(new Error('the write conflicted'))
}));

setupTestDb();

beforeEach(() => registerCheckoutModules());

afterEach(() => resetDomainEvents());

describe('erasing an account whose unpaid order cannot be cancelled', () => {
    it('still erases the account, detaches the order, and resolves', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 10 });
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const result = await userService.eraseOwnAccount(user);

        expect(result.success).toBe(true);
        expect(await userRepository.findById(user.id)).toBeNull();
        const reloaded = await readOrder(String(order._id));
        expect(reloaded!.userId).toBeUndefined();
        expect(reloaded!.status).toBe(OrderStatus.pending);
    });
});
