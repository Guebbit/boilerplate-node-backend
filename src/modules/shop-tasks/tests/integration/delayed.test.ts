/**
 * @module
 * `fulfillment_order.delayed` is both a to-do (the buyer may owe consent) and a message to the
 * buyer, and one module holds one handler per event. Pins the order inside it and the redelivery
 * rule: the task first (idempotent by `eventId`), then the notice, so a redelivery after a failed
 * notice re-runs a no-op open and writes the notice once.
 */

import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { emitDomainEvent, resetDomainEvents } from '@kernel/events';
import type { DomainEventMap } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import { notificationsService } from '@modules/notifications';
import { findTasksOfKind } from '@modules/tasks/tests/factories';
import { TaskKind } from '@types';
import { enabledModules } from '../../../../modules';

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    registerModules(enabledModules);
});

afterEach(() => {
    jest.restoreAllMocks();
    resetDomainEvents();
});

/** A delay notice for a buyer shipped to the United States, so the consent rule applies. */
const delayFor = (userId: string): DomainEventMap['fulfillment_order.delayed'] => ({
    orderId: new Types.ObjectId().toString(),
    fulfillmentOrderId: 'fo1',
    userId,
    titles: ['Mug'],
    agreedAt: '2031-02-01T00:00:00.000Z',
    promisedAt: '2031-02-01T00:00:00.000Z',
    shipCountry: 'US',
    reason: 'due'
});

/** The buyer's inbox. */
const inboxOf = (userId: string) => notificationsService.list(userId).then(({ items }) => items);

describe('fulfillment_order.delayed', () => {
    it('opens the consent reminder and tells the buyer, from one event', async () => {
        const buyer = await createUser({ email: 'buyer@example.com', username: 'buyer' });

        await emitDomainEvent('fulfillment_order.delayed', delayFor(buyer.id), { eventId: 'e1' });

        await expect(findTasksOfKind(TaskKind.consent_due)).resolves.toHaveLength(1);
        await expect(inboxOf(buyer.id)).resolves.toMatchObject([
            { code: 'shop-tasks.fulfillment-delayed' }
        ]);
    });

    it('writes each once when a redelivery follows a notice that failed', async () => {
        const buyer = await createUser({ email: 'buyer@example.com', username: 'buyer' });
        const fact = delayFor(buyer.id);
        jest.spyOn(notificationsService, 'create').mockRejectedValueOnce(new Error('inbox down'));

        // The bus logs the failing listener and moves on; the outbox would deliver it again.
        await emitDomainEvent('fulfillment_order.delayed', fact, { eventId: 'e1' });
        await expect(
            findTasksOfKind(TaskKind.consent_due).then((found) => found.length)
        ).resolves.toBe(1);
        await expect(inboxOf(buyer.id)).resolves.toEqual([]);

        await emitDomainEvent('fulfillment_order.delayed', fact, { eventId: 'e1' });

        await expect(
            findTasksOfKind(TaskKind.consent_due).then((found) => found.length)
        ).resolves.toBe(1);
        await expect(inboxOf(buyer.id)).resolves.toHaveLength(1);
    });
});
