import { emitDomainEvent, onDomainEvent, resetDomainEvents } from '@kernel/events';
import { logger } from '@infrastructure/adapters/logger';

/**
 * The event bus exists to break one specific cycle: products has to empty a deleted item out of
 * every cart, and the cart has to read the catalogue to price a line. Two properties make that
 * substitution safe rather than merely decoupled, and both are asserted here — handlers are
 * awaited before the emitter continues, and one failing handler does not take down the operation
 * that emitted the event.
 */

jest.mock('@infrastructure/adapters/logger', () => ({ logger: { error: jest.fn() } }));

/** A real contracted event stands in for a test-only one: the bus is typed by the contract. */
const EVENT = 'account.authenticator_removed' as const;

afterEach(() => {
    resetDomainEvents();
    jest.clearAllMocks();
});

describe('emitDomainEvent', () => {
    it('delivers the payload to a subscriber', async () => {
        const handler = jest.fn();
        onDomainEvent(EVENT, handler);

        await emitDomainEvent(EVENT, { userId: 'abc' });

        expect(handler).toHaveBeenCalledWith({ userId: 'abc' }, {});
    });

    it('resolves only after an async handler has finished', async () => {
        /**
         * The ordering guarantee the product delete path depends on: the cart is emptied BEFORE
         * the row disappears. A fire-and-forget bus would pass every other test in this file.
         */
        const order: string[] = [];
        onDomainEvent(EVENT, async () => {
            /**
             * A task hop rather than a timer: a fire-and-forget bus would push 'emitter' first
             * either way, and this cannot be slow enough to matter or fast enough to race.
             */
            await new Promise((resolve) => setImmediate(resolve));
            order.push('handler');
        });

        await emitDomainEvent(EVENT, { userId: 'abc' });
        order.push('emitter');

        expect(order).toEqual(['handler', 'emitter']);
    });

    it('runs every subscriber, and keeps going when one throws', async () => {
        const second = jest.fn();
        onDomainEvent(EVENT, () => {
            throw new Error('listener exploded');
        });
        onDomainEvent(EVENT, second);

        /**
         * `false`, not a rejection: the emit still succeeded, and the caller decides what an
         * unsettled handler means to it. `orders` reads this to keep a refund marker standing.
         */
        await expect(emitDomainEvent(EVENT, { userId: 'abc' })).resolves.toBe(false);
        expect(second).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining(EVENT),
            // Under an `error` key, so the logger serialises it (and, in production, drops the stack).
            { error: expect.any(Error) }
        );
    });

    it('does not reject when an async handler rejects', async () => {
        onDomainEvent(EVENT, () => Promise.reject(new Error('async boom')));

        await expect(emitDomainEvent(EVENT, { userId: 'abc' })).resolves.toBe(false);
        // The rejection itself is what gets logged, not a generic "something failed".
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(EVENT), {
            error: expect.objectContaining({ message: 'async boom' })
        });
    });

    it('reports true when every handler resolves', async () => {
        /**
         * The other half of the signal, asserted on its own: a `false` that was never `true` for
         * a clean emit would keep every marker standing forever.
         */
        onDomainEvent(EVENT, jest.fn());
        onDomainEvent(EVENT, () => Promise.resolve());

        await expect(emitDomainEvent(EVENT, { userId: 'abc' })).resolves.toBe(true);
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('is a no-op when nothing subscribes', async () => {
        // Vacuously settled — nothing threw, so nothing is owed.
        await expect(emitDomainEvent(EVENT, { userId: 'abc' })).resolves.toBe(true);
    });
});

describe('resetDomainEvents', () => {
    it('drops subscriptions so they do not leak between tests', async () => {
        const handler = jest.fn();
        onDomainEvent(EVENT, handler);

        resetDomainEvents();
        await emitDomainEvent(EVENT, { userId: 'abc' });

        expect(handler).not.toHaveBeenCalled();
    });
});
