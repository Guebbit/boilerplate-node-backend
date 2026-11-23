/**
 * @module
 * `stock_alert.sent` through the outbox: `titles` is required by the event's contract, and a
 * hard-deleted product leaves it an empty object. The row must still validate and be delivered.
 *
 * @see docs/modules/stock-alerts.md#the-sweep
 */

import { setupTestDb } from '@tests/setup-test-db';
import { withTransaction } from '@infrastructure/runtime/database';
import { markDomainEventsWired, onDomainEvent, resetDomainEvents } from '@kernel/events';
import { enqueueOutboxEvent, relayOutbox } from '@kernel/outbox';
import { STOCK_ALERT_SENT } from '../../events';

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    markDomainEventsWired();
});

afterAll(() => {
    resetDomainEvents();
});

it('delivers an event whose `titles` is empty: a hard-deleted product has no titles', async () => {
    const delivered: unknown[] = [];
    onDomainEvent(STOCK_ALERT_SENT, (fact) => {
        delivered.push(fact);
    });

    await withTransaction((session) =>
        enqueueOutboxEvent(
            STOCK_ALERT_SENT,
            { userId: 'u-1', productId: 'p-1', titles: {} },
            'u-1',
            session
        )
    );

    expect(await relayOutbox()).toMatchObject({ published: 1, retried: 0 });
    expect(delivered).toEqual([{ userId: 'u-1', productId: 'p-1', titles: {} }]);
});
