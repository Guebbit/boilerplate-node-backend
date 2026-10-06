import { setupTestDb } from '@tests/setup-test-db';
import { withTransaction } from '@infrastructure/runtime/database';
import { enqueueOutboxEvent, outboxEventModel, relayOutbox } from '@kernel/outbox';

/**
 * The relay when the event bus itself rejects, which `emitDomainEvent` never does on its own:
 * the row must keep the reason in `lastError` instead of an anonymous failure.
 */

setupTestDb();

// Partial mock: only `emitDomainEvent` is replaced, so the rest of the kernel still loads.
jest.mock('@kernel/events', () => ({
    ...jest.requireActual<object>('@kernel/events'),
    emitDomainEvent: jest.fn().mockRejectedValue(new Error('bus broke')),
    domainEventsWired: () => true
}));

describe('relayOutbox on a rejecting bus', () => {
    it('records the rejection message in lastError and reschedules', async () => {
        await withTransaction((session) =>
            enqueueOutboxEvent('test.outbox' as never, { n: 1 } as never, 'agg-1', session)
        );

        expect(await relayOutbox()).toMatchObject({ retried: 1 });
        expect(await outboxEventModel.findOne().lean()).toMatchObject({
            status: 'pending',
            lastError: expect.stringContaining('bus broke') as string
        });
    });
});
