/**
 * @module
 * The hand-over through its public doors: the route answers `202` and the ticket arrives from a
 * nudge or the sweep; spam stays local; the inert module changes nothing.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { setEnvironment } from '@tests/environment';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { settleOutboxNudges } from '@kernel/outbox';
import { taskService } from '@modules/tasks';
import { findAllTasks } from '@modules/tasks/tests/factories';
import { zammadService } from '../../services';
import { zammadJobs } from '../../jobs';
import { zammadContactModel } from '../../model';
import { useZammad } from '../harness';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn().mockResolvedValue(undefined)
}));

/** Stands in for the mail queue; the cases assert which mail was enqueued. */
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

/** The stub of the case that is running. */
const zammad = useZammad();

beforeEach(() => {
    mockEnqueueEmail.mockClear();
});

describe('POST /tasks with Zammad on', () => {
    it('answers 202 and files one ticket with our fields, escaped, and no to-do', async () => {
        await api()
            .post('/tasks')
            .send({
                name: 'Ada <b>Lovelace</b>',
                email: 'Ada@Example.com',
                subject: 'Where is my parcel',
                message: 'Line one\n<script>alert(1)</script>',
                category: 'other',
                orderNumber: 'ORD-1'
            })
            .expect(202);
        await zammadService.settleHandovers();

        expect(zammad().tickets).toHaveLength(1);
        const [ticket] = zammad().tickets;
        expect(ticket.body).toMatchObject({
            title: 'Where is my parcel',
            group: 'Support',
            customer_id: 'guess:ada@example.com',
            shop_category: 'other',
            order_number: 'ORD-1',
            shop_sender_verified: false,
            article: {
                type: 'web',
                sender: 'Customer',
                internal: false,
                content_type: 'text/html',
                body: 'Line one<br>&lt;script&gt;alert(1)&lt;/script&gt;'
            }
        });
        // The dedup stamp is the pending row's own id.
        expect(ticket.body.request_ref).toMatch(/^[0-9a-f]{24}$/);
        expect(zammad().requests.every((request) => request.authorization !== undefined)).toBe(
            true
        );
        expect(await findAllTasks()).toEqual([]);
        expect(await zammadContactModel.countDocuments()).toBe(0);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('leaves the sender name out of the ticket title and the article body', async () => {
        await taskService.submit({
            name: 'Grace "Hopper" <grace@evil.test>',
            email: 'grace@example.com',
            subject: 'Hello',
            message: 'Hi'
        });
        await zammadService.settleHandovers();

        const [ticket] = zammad().tickets;
        expect(JSON.stringify(ticket.body)).not.toContain('<grace@evil.test>');
    });

    it('is picked up by the minute sweep when no nudge ran', async () => {
        zammad().refuseAll(503);
        await taskService.submit({
            email: 'ada@example.com',
            subject: 'Sweep me',
            message: 'Hello'
        });
        await zammadService.settleHandovers();
        expect(zammad().tickets).toHaveLength(0);

        zammad().recover();
        await zammadContactModel.updateMany({}, { $set: { nextAttemptAt: new Date(0) } });
        await zammadJobs[0].run();

        expect(zammad().tickets).toHaveLength(1);
        expect(await zammadContactModel.countDocuments()).toBe(0);
    });
});

describe('spam with Zammad on', () => {
    it('stays local: filed as a closed spam to-do, never sent', async () => {
        await taskService.submit({
            email: 'bot@example.com',
            subject: 'Buy now',
            message: 'Cheap pills',
            website: 'http://spam.example'
        });
        await zammadService.settleHandovers();

        expect(zammad().requests).toEqual([]);
        const tasks = await findAllTasks();
        expect(tasks.map(({ status, resolution }) => ({ status, resolution }))).toEqual([
            { status: 'spam', resolution: 'spam' }
        ]);
    });
});

describe('with NODE_ZAMMAD_URL unset', () => {
    beforeEach(() => {
        setEnvironment({ NODE_ZAMMAD_URL: undefined });
    });

    it('is basic mode: the to-do and the full mail, no call anywhere', async () => {
        await taskService.submit({
            email: 'ada@example.com',
            subject: 'Where is my parcel',
            message: 'Please call me.'
        });
        await settleOutboxNudges();

        expect(zammad().requests).toEqual([]);
        expect(await findAllTasks()).toHaveLength(1);
        expect(await zammadContactModel.countDocuments()).toBe(0);
        const mail = mockEnqueueEmail.mock.calls.find(([, name]) => name === 'tasks.contact');
        expect(mail?.[0]).toMatchObject({ to: 'desk@example.com', replyTo: 'ada@example.com' });
    });

    it('sweeps nothing', async () => {
        await expect(zammadService.sweepContacts()).resolves.toBe(0);
        await expect(zammadService.sweepProfiles()).resolves.toBe(0);
    });
});
