/**
 * @module
 * Tickets must never leak
 * `_id`/`__v`, on either response path — a real document (`toJSON`) or a `.lean()`
 * list result (mapped manually via `applyTicketTransform`).
 */
import { asStub } from '@tests/stub';
import { callerContextAs } from '@tests/callers';
import { setupTestDb } from '@tests/setup-test-db';
import { ticketRepository } from '@modules/tickets/repository';
import { ticketService } from '@modules/tickets/service';

setupTestDb();

const createTicket = () =>
    ticketRepository.create({
        email: 'reporter@example.com',
        subject: 'Something broke',
        message: 'Details about what broke.'
    });

describe('ticket serialization', () => {
    it('normalizes a hydrated document via toJSON', async () => {
        const ticket = await createTicket();
        const json = ticket.toJSON() as Record<string, unknown>;

        expect(json.id).toBe(ticket._id.toString());
        expect(JSON.stringify(json)).not.toContain('_id');
        expect(JSON.stringify(json)).not.toContain('__v');
    });

    it('normalizes a lean list via ticketService.search', async () => {
        await createTicket();
        const { items } = await ticketService.search({}, callerContextAs('admin'));

        expect(items).toHaveLength(1);
        const item = asStub<Record<string, unknown>>(items[0]);
        expect(item.id).toMatch(/^[\da-f]{24}$/);
        expect(item._id).toBeUndefined();
        expect(item.__v).toBeUndefined();
    });
});
