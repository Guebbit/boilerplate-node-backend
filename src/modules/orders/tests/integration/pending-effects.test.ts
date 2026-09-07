/**
 * @module
 * The durability of a cancel's consequences. `cancelById` announces `ORDER_CANCELLED` and
 * `payments` refunds off that announcement — but `@kernel/events` has no retry, so a refund that
 * throws is logged and lost, and nothing reconciles it. The marker written in the same document
 * write as the status is what survives that, and `retryPendingEffects` is what discharges it.
 *
 * Real Mongo throughout: every guarantee here is a property of the writes (one conditional `$set`,
 * a conditional `$pull`, a sparse-index query), and a stubbed repository would assert the stub.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/fixtures';
import { createProduct } from '@modules/products/tests/fixtures';
import { createOrder, toOrderItem } from '@modules/orders/tests/fixtures';
import { orderService } from '@modules/orders/services';
import { orderRepository, ORDER_CANCELLED } from '@modules/orders';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';

setupTestDb();

/* The sweep's grace window, zeroed so a marker written this millisecond is already due. */
beforeEach(() => {
    process.env.NODE_ORDER_EFFECT_RETRY_MINUTES = '0';
});

afterEach(() => {
    delete process.env.NODE_ORDER_EFFECT_RETRY_MINUTES;
    resetDomainEvents();
});

/* Distinguishes the users seeded within one case — `users_email` is unique. */
let seeded = 0;

beforeEach(() => {
    seeded = 0;
});

/** An order in `pending`, owned by a fresh user. */
const seedOrder = async () => {
    seeded += 1;
    const user = await createUser({
        email: `buyer-${seeded}@example.com`,
        username: `buyer-${seeded}`
    });
    const product = await createProduct();
    return createOrder(user, [toOrderItem(product, 1)]);
};

/** What the order carries now — reread, never the in-memory document the service returned. */
const storedEffects = (orderId: string) =>
    orderRepository.findById(orderId).then((order) => order?.pendingEffects);

describe('cancelById — writing the intent down', () => {
    it('leaves the marker standing when the refund throws', async () => {
        // The bug this whole mechanism exists for: the provider is unreachable for the length of
        // one call. No crash, no rollback — the order cancels and the money silently never moves.
        onDomainEvent(ORDER_CANCELLED, () => {
            throw new Error('payment provider unreachable');
        });
        const order = await seedOrder();

        const result = await orderService.cancelById(String(order._id), { admin: true });

        expect(result.success).toBe(true);
        const stored = await orderRepository.findById(String(order._id));
        expect(stored?.status).toBe('cancelled');
        expect(stored?.pendingEffects).toEqual(['refund']);
    });

    it('drains the marker once the refund actually returns', async () => {
        onDomainEvent(ORDER_CANCELLED, () => undefined);
        const order = await seedOrder();

        await orderService.cancelById(String(order._id), { admin: true });

        // The happy path writes the marker and removes it milliseconds later; what a reader sees
        // afterwards is an order owing nothing.
        expect(await storedEffects(String(order._id))).toEqual([]);
    });

    it('writes no marker at all when an operator cancels without refunding', async () => {
        // Nothing was promised, so there is nothing to make durable. A marker here would have the
        // sweep announcing a refund the operator deliberately withheld.
        onDomainEvent(ORDER_CANCELLED, () => undefined);
        const order = await seedOrder();

        await orderService.cancelById(String(order._id), { admin: true }, { refund: false });

        expect(await storedEffects(String(order._id))).toBeUndefined();
    });

    it('keeps the marker off the wire', async () => {
        // Internal bookkeeping, like `anonymizeAfter`. The contract has no such field, and a
        // serialized order that grew one would be an undeclared property on every response.
        onDomainEvent(ORDER_CANCELLED, () => {
            throw new Error('payment provider unreachable');
        });
        const order = await seedOrder();
        await orderService.cancelById(String(order._id), { admin: true });

        const stored = await orderRepository.findById(String(order._id));

        expect(stored?.pendingEffects).toEqual(['refund']);
        expect(orderService.withActions(stored!, { admin: true })).not.toHaveProperty(
            'pendingEffects'
        );
    });
});

describe('retryPendingEffects', () => {
    it('re-announces for a stuck order, and the second attempt settles it', async () => {
        let attempts = 0;
        // Fails once, then works — the provider outage that ends.
        onDomainEvent(ORDER_CANCELLED, () => {
            attempts += 1;
            if (attempts === 1) throw new Error('payment provider unreachable');
            return undefined;
        });
        const order = await seedOrder();
        await orderService.cancelById(String(order._id), { admin: true });
        expect(await storedEffects(String(order._id))).toEqual(['refund']);

        const settled = await orderService.retryPendingEffects();

        expect(settled).toBe(1);
        expect(attempts).toBe(2);
        expect(await storedEffects(String(order._id))).toEqual([]);
    });

    it('is a no-op on a second pass — liveness is not the same as idempotence', async () => {
        let attempts = 0;
        onDomainEvent(ORDER_CANCELLED, () => {
            attempts += 1;
            if (attempts === 1) throw new Error('payment provider unreachable');
            return undefined;
        });
        const order = await seedOrder();
        await orderService.cancelById(String(order._id), { admin: true });
        await orderService.retryPendingEffects();

        const second = await orderService.retryPendingEffects();

        // Nothing found, so nothing announced: the second pass must not refund again.
        expect(second).toBe(0);
        expect(attempts).toBe(2);
    });

    it('keeps the marker when the retry throws too', async () => {
        // A sweep that cleared on failure would be worse than no sweep — it would erase the only
        // record that the money is still owed.
        onDomainEvent(ORDER_CANCELLED, () => {
            throw new Error('payment provider unreachable');
        });
        const order = await seedOrder();
        await orderService.cancelById(String(order._id), { admin: true });

        const settled = await orderService.retryPendingEffects();

        expect(settled).toBe(0);
        expect(await storedEffects(String(order._id))).toEqual(['refund']);
    });

    it('ignores orders that owe nothing', async () => {
        const announcements: string[] = [];
        onDomainEvent(ORDER_CANCELLED, ({ orderId }) => {
            announcements.push(orderId);
            return undefined;
        });
        // One cancelled cleanly, one never cancelled at all.
        const settledOrder = await seedOrder();
        await seedOrder();
        await orderService.cancelById(String(settledOrder._id), { admin: true });
        announcements.length = 0;

        expect(await orderService.retryPendingEffects()).toBe(0);
        expect(announcements).toEqual([]);
    });

    it('waits out the grace window rather than racing the cancel it just ran', async () => {
        // The default window exists so a slow-but-working refund is not retried underneath itself.
        process.env.NODE_ORDER_EFFECT_RETRY_MINUTES = '5';
        onDomainEvent(ORDER_CANCELLED, () => {
            throw new Error('payment provider unreachable');
        });
        const order = await seedOrder();
        await orderService.cancelById(String(order._id), { admin: true });

        expect(await orderService.retryPendingEffects()).toBe(0);
        // Still owed — deferred, not discharged.
        expect(await storedEffects(String(order._id))).toEqual(['refund']);
    });
});
