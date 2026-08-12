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

declare module '@kernel/events' {
    interface IDomainEventMap {
        'test.thing-happened': { id: string };
    }
}

afterEach(() => {
    resetDomainEvents();
    jest.clearAllMocks();
});

describe('emitDomainEvent', () => {
    it('delivers the payload to a subscriber', async () => {
        const handler = jest.fn();
        onDomainEvent('test.thing-happened', handler);

        await emitDomainEvent('test.thing-happened', { id: 'abc' });

        expect(handler).toHaveBeenCalledWith({ id: 'abc' });
    });

    it('resolves only after an async handler has finished', async () => {
        // The ordering guarantee the product delete path depends on: the cart is emptied BEFORE
        // the row disappears. A fire-and-forget bus would pass every other test in this file.
        const order: string[] = [];
        onDomainEvent('test.thing-happened', async () => {
            // A task hop rather than a timer: a fire-and-forget bus would push 'emitter' first
            // either way, and this cannot be slow enough to matter or fast enough to race.
            await new Promise((resolve) => setImmediate(resolve));
            order.push('handler');
        });

        await emitDomainEvent('test.thing-happened', { id: 'abc' });
        order.push('emitter');

        expect(order).toEqual(['handler', 'emitter']);
    });

    it('runs every subscriber, and keeps going when one throws', async () => {
        const second = jest.fn();
        onDomainEvent('test.thing-happened', () => {
            throw new Error('listener exploded');
        });
        onDomainEvent('test.thing-happened', second);

        await expect(
            emitDomainEvent('test.thing-happened', { id: 'abc' })
        ).resolves.toBeUndefined();
        expect(second).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('test.thing-happened'),
            expect.any(Error)
        );
    });

    it('does not reject when an async handler rejects', async () => {
        onDomainEvent('test.thing-happened', () => Promise.reject(new Error('async boom')));

        await expect(
            emitDomainEvent('test.thing-happened', { id: 'abc' })
        ).resolves.toBeUndefined();
        expect(logger.error).toHaveBeenCalled();
    });

    it('is a no-op when nothing subscribes', async () => {
        await expect(
            emitDomainEvent('test.thing-happened', { id: 'abc' })
        ).resolves.toBeUndefined();
    });
});

describe('resetDomainEvents', () => {
    it('drops subscriptions so they do not leak between tests', async () => {
        const handler = jest.fn();
        onDomainEvent('test.thing-happened', handler);

        resetDomainEvents();
        await emitDomainEvent('test.thing-happened', { id: 'abc' });

        expect(handler).not.toHaveBeenCalled();
    });
});
