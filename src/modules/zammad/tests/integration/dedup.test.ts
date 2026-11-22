/**
 * @module
 * One message makes one ticket, even when an attempt's outcome is unknown: after a timeout, a 5xx
 * or a lost answer the next attempt looks the `request_ref` up before it creates anything.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { logger } from '@infrastructure/adapters/logger';
import { taskService } from '@modules/tasks';
import { zammadService } from '../../services';
import { zammadContactModel } from '../../model';
import * as repository from '../../repository';
import { makeDue, useZammad } from '../harness';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn().mockResolvedValue(undefined)
}));

setupTestDb();

/** The stub of the case that is running. */
const zammad = useZammad();

/** Hand one message over, with a failing first attempt already queued by the caller. */
const submit = () =>
    taskService
        .submit({ email: 'ada@example.com', subject: 'Hello', message: 'Anyone there?' })
        .then(() => zammadService.settleHandovers());

/** The searches the stub saw. */
const searches = () =>
    zammad().requests.filter(({ method, path }) => method === 'POST' && path === '/tickets/search');

describe('an unclear outcome', () => {
    it('adopts the ticket the lost answer created instead of making a second one', async () => {
        zammad().misbehave({ kind: 'lose-answer' });
        await submit();

        // The ticket exists, the row waits, and it knows the outcome was unclear.
        expect(zammad().tickets).toHaveLength(1);
        expect(await zammadContactModel.find().lean()).toMatchObject([
            { attempts: 1, unclear: true, state: 'pending' }
        ]);

        await makeDue();
        await zammadService.sweepContacts();

        expect(zammad().tickets).toHaveLength(1);
        expect(searches()).toHaveLength(1);
        expect(searches()[0].body).toEqual({
            condition: {
                'ticket.request_ref': {
                    operator: 'is',
                    value: expect.stringMatching(/^[0-9a-f]{24}$/)
                }
            },
            limit: 1
        });
        expect(await zammadContactModel.countDocuments()).toBe(0);
    });

    it('stays unclear through a definite refusal: the third attempt still looks first', async () => {
        zammad().misbehave({ kind: 'refuse', status: 503 }, { kind: 'refuse', status: 422 });
        await submit();
        // Attempt 2 looks (nothing there), creates, and is refused for good.
        await makeDue();
        await zammadService.sweepContacts();
        expect(searches()).toHaveLength(1);
        expect(zammad().tickets).toHaveLength(0);

        // Attempt 3: the 422 did not make the row clear, so it looks again before it creates.
        await makeDue();
        await zammadService.sweepContacts();

        expect(searches()).toHaveLength(2);
        expect(zammad().tickets).toHaveLength(1);
    });

    it('treats a claim that took over a lapsed lease as unclear: the ticket the dead process made is adopted', async () => {
        zammad().misbehave({ kind: 'refuse', status: 422 });
        await submit();
        const [row] = await zammadContactModel.find().lean();
        // The process died after Zammad made the ticket and before the row was settled.
        zammad().tickets.push({
            id: 900,
            customer_id: 901,
            request_ref: String(row._id),
            body: { request_ref: String(row._id) }
        });
        await zammadContactModel.updateOne(
            { _id: row._id },
            {
                $set: {
                    leaseToken: 'dead-process',
                    leaseExpiresAt: new Date(0),
                    nextAttemptAt: new Date(0)
                }
            }
        );

        await zammadService.sweepContacts();

        expect(searches()).toHaveLength(1);
        expect(zammad().tickets).toHaveLength(1);
        expect(await zammadContactModel.countDocuments()).toBe(0);
    });

    it('treats a failure after the ticket was made as unclear: the retry adopts it', async () => {
        const settleFails = jest
            .spyOn(repository, 'deleteContactById')
            .mockRejectedValueOnce(new Error('database went away'));
        await submit();
        settleFails.mockRestore();

        expect(zammad().tickets).toHaveLength(1);
        expect(await zammadContactModel.find().lean()).toMatchObject([
            { attempts: 1, unclear: true }
        ]);

        await makeDue();
        await zammadService.sweepContacts();

        expect(zammad().tickets).toHaveLength(1);
        expect(await zammadContactModel.countDocuments()).toBe(0);
    });

    it('resends after a lookup that finds nothing', async () => {
        zammad().misbehave({ kind: 'refuse', status: 503 });
        await submit();
        await makeDue();
        await zammadService.sweepContacts();

        expect(searches()).toHaveLength(1);
        expect(zammad().tickets).toHaveLength(1);
        expect(await zammadContactModel.countDocuments()).toBe(0);
    });
});

describe('a refusal', () => {
    it('does not look anything up: Zammad did nothing, so the retry just creates', async () => {
        zammad().misbehave({ kind: 'refuse', status: 422 });
        await submit();

        expect(await zammadContactModel.find().lean()).toMatchObject([
            { attempts: 1, unclear: false }
        ]);

        await makeDue();
        await zammadService.sweepContacts();

        expect(searches()).toHaveLength(0);
        expect(zammad().tickets).toHaveLength(1);
    });
});

describe('a Zammad that never ran the setup', () => {
    it('logs an error when the answer carries no request_ref', async () => {
        const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);
        zammad().attributes.delete('request_ref');
        await submit();

        expect(logged).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('request_ref') })
        );
        logged.mockRestore();
    });
});
