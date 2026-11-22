/**
 * @module
 * The GDPR halves of the module against a REAL Zammad: the export of a person's copy (Art. 15) and
 * the retention pass (Art. 5(1)(e)), including the one fact the whole retention rule rests on, that
 * `last_contact_at` moves on a customer's message and not on an internal note.
 *
 * Runs LAST (`jest.sequencer.zammad.js`): the retention case files a deletion for everything older
 * than its shifted clock, which is every ticket the earlier files made.
 *
 * The clock: tickets cannot be made old through the API, so the pass is run with `Date.now` moved
 * forward. The cut-off is placed between two moments of THIS run, read from Zammad's own
 * timestamps, so only what the case created before that moment counts as old.
 *
 * @see docs/modules/zammad.md#retention
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { personalDataSubjectOf } from '@modules/users';
import { createUser } from '@modules/users/tests/factories';
import { callZammad, closeTicket, createTicket, findDataPrivacyTask } from '../../client';
import { zammadService } from '../../services';
import { ensureTicketFields } from '../../services/setup';
import { markGroupsVerified } from '../../repository';
import {
    addArticle,
    lastContactOf,
    lastCustomerContactOf,
    makeUser,
    pause,
    pointModuleAt,
    realZammad,
    registerAllModules,
    settingsFor
} from './support';

setupTestDb();

/** The booted Zammad the suite runs against. */
const zammad = realZammad();

/** The adapter's settings for the integration user, the token the module itself runs with. */
const integration = settingsFor(zammad, 'integration');

/** Keeps this run's addresses apart from any earlier run's on the same Zammad. */
const run = randomUUID().slice(0, 8);

/** One day in milliseconds. */
const DAY_MS = 86_400_000;

beforeAll(async () => {
    // The setup step the suite relies on: our fields, and the last-contact setting (the retention
    // clock is a customer's last message).
    await ensureTicketFields(settingsFor(zammad, 'admin'));
});

// `ensureTicketFields` read the integration role back and found every group readable: leave the
// marker `zammad:setup` would, which the erase hook and retention check. A fresh database per case.
beforeEach(() => markGroupsVerified(new Date()).then(() => undefined));

beforeEach(() => {
    pointModuleAt(zammad);
    registerAllModules();
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('the export of a person’s copy', () => {
    it('carries every article, internal notes without their author, and the files the customer sent', async () => {
        const email = `gdpr-${run}-a@example.com`;
        const user = await createUser({ email, verifiedAt: new Date() });
        const created = await createTicket({
            customer: { email },
            name: 'Ada Lovelace',
            subject: 'Parcel',
            message: 'Where is it?',
            senderVerified: false,
            requestRef: `ref-${run}-a`
        });
        await addArticle(zammad, created.id, {
            sender: 'Customer',
            internal: false,
            body: 'The photo',
            files: [{ filename: 'photo.txt', text: `PHOTO-${run}`, mimeType: 'text/plain' }]
        });
        await addArticle(zammad, created.id, {
            sender: 'Agent',
            internal: false,
            body: 'On its way.'
        });
        await addArticle(zammad, created.id, {
            sender: 'Agent',
            internal: true,
            body: 'Customer is polite.',
            files: [{ filename: 'staff.txt', text: 'STAFF-ONLY', mimeType: 'text/plain' }]
        });

        const section = await zammadService.collectPersonalData(personalDataSubjectOf(user));

        // Found by the verified address alone: no mapping was ever made.
        expect(section.customers).toHaveLength(1);
        const [customer] = section.customers ?? [];
        expect(customer).toMatchObject({ id: created.customerId, email });
        expect(customer.tickets).toHaveLength(1);
        const { articles } = customer.tickets[0];
        expect(articles.map(({ body }) => body)).toEqual(
            expect.arrayContaining(['The photo', 'On its way.', 'Customer is polite.'])
        );
        const note = articles.find(({ body }) => body === 'Customer is polite.');
        expect(note).toMatchObject({ internal: true });
        expect(note).not.toHaveProperty('from');
        expect(note).not.toHaveProperty('attachments');
        const photo = articles.find(({ body }) => body === 'The photo');
        expect(photo?.attachments).toMatchObject([
            {
                filename: 'photo.txt',
                size: `PHOTO-${run}`.length,
                contentBase64: Buffer.from(`PHOTO-${run}`).toString('base64')
            }
        ]);
    });

    it('fails the whole export when Zammad cannot be read, rather than answer a part', async () => {
        const user = await createUser({
            email: `gdpr-${run}-b@example.com`,
            verifiedAt: new Date()
        });
        // Nothing listens on the discard port.
        setEnvironment({ NODE_ZAMMAD_URL: 'http://127.0.0.1:9' });

        await expect(
            zammadService.collectPersonalData(personalDataSubjectOf(user))
        ).rejects.toMatchObject({ name: 'ZammadRequestError' });
    });
});

describe('the retention clock', () => {
    it('moves on a customer’s message and not on an internal note', async () => {
        const created = await createTicket({
            customer: { email: `gdpr-${run}-c@example.com` },
            subject: 'Clock',
            message: 'First',
            senderVerified: false,
            requestRef: `ref-${run}-c`
        });
        const first = await lastContactOf(zammad, created.id);
        await pause(1100);

        await addArticle(zammad, created.id, {
            sender: 'Agent',
            internal: true,
            body: 'Staff talking to staff'
        });
        const afterNote = await lastContactOf(zammad, created.id);
        await pause(1100);
        await addArticle(zammad, created.id, {
            sender: 'Customer',
            internal: false,
            body: 'The customer writes again'
        });
        const afterCustomer = await lastContactOf(zammad, created.id);

        expect(first).toBeTruthy();
        expect(afterNote).toBe(first);
        expect(new Date(afterCustomer ?? 0).getTime()).toBeGreaterThan(
            new Date(first ?? 0).getTime()
        );
    });

    it('keeps the customer’s own clock still on an agent’s public reply', async () => {
        const created = await createTicket({
            customer: { email: `gdpr-${run}-d@example.com` },
            subject: 'Customer clock',
            message: 'First',
            senderVerified: false,
            requestRef: `ref-${run}-d`
        });
        const first = await lastCustomerContactOf(zammad, created.id);
        await pause(1100);

        await addArticle(zammad, created.id, {
            sender: 'Agent',
            internal: false,
            body: 'Staff answering the customer'
        });
        const afterReply = await lastCustomerContactOf(zammad, created.id);
        await pause(1100);
        await addArticle(zammad, created.id, {
            sender: 'Customer',
            internal: false,
            body: 'The customer writes again'
        });
        const afterCustomer = await lastCustomerContactOf(zammad, created.id);

        expect(first).toBeTruthy();
        expect(afterReply).toBe(first);
        expect(new Date(afterCustomer ?? 0).getTime()).toBeGreaterThan(
            new Date(first ?? 0).getTime()
        );
    });
});

/** A deletion task as Zammad lists it. */
const taskRows = z.array(z.object({ deletable_type: z.string(), deletable_id: z.number() }));

/**
 * How many Data Privacy tasks Zammad holds for one ticket or customer, reading every page.
 *
 * @param type - what the task deletes
 * @param id - its Zammad id
 */
const tasksFor = async (type: 'User' | 'Ticket', id: number): Promise<number> => {
    let count = 0;
    for (let page = 1; ; page += 1) {
        const rows = await callZammad(
            integration,
            'GET',
            `/data_privacy_tasks?page=${String(page)}&per_page=100`,
            undefined,
            taskRows
        );
        count += rows.filter(
            (row) => row.deletable_type === type && row.deletable_id === id
        ).length;
        if (rows.length < 100) return count;
    }
};

/**
 * Run the retention pass as if it were `ms` on the clock.
 *
 * @param ms - the instant `Date.now` reports for the pass
 */
const passAt = (ms: number) => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(ms);
    return zammadService.reapRetention().finally(() => {
        clock.mockRestore();
    });
};

describe('the retention pass', () => {
    it('files a deletion for what is past its window by last customer contact, and nothing else', async () => {
        // Old: made before the cut-off. A closed one, an open one, a spam one, and its customers.
        const open = await createTicket({
            customer: { email: `gdpr-${run}-d@example.com` },
            subject: 'Old, open',
            message: 'Still open',
            senderVerified: false,
            requestRef: `ref-${run}-d`
        });
        const closed = await createTicket({
            customer: { email: `gdpr-${run}-e@example.com` },
            subject: 'Old, closed',
            message: 'Done',
            senderVerified: false,
            requestRef: `ref-${run}-e`
        });
        await closeTicket(integration, closed.id);
        const spam = await createTicket({
            customer: { email: `gdpr-${run}-f@example.com` },
            subject: 'Old spam',
            message: 'Buy my pills',
            senderVerified: false,
            requestRef: `ref-${run}-f`,
            suspectedSpam: true
        });
        const talking = await createTicket({
            customer: { email: `gdpr-${run}-g@example.com` },
            subject: 'Old, but the customer keeps writing',
            message: 'First',
            senderVerified: false,
            requestRef: `ref-${run}-g`
        });
        const lonelyCustomer = await makeUser(zammad, `gdpr-${run}-h@example.com`);
        const agent = await makeUser(zammad, `gdpr-${run}-i@example.com`, 'Agent');
        const me = await callZammad(
            integration,
            'GET',
            '/users/me',
            undefined,
            z.object({ id: z.number() })
        );

        // The customer writes again later: that, not the creation, is the clock.
        await pause(1500);
        await addArticle(zammad, talking.id, {
            sender: 'Customer',
            internal: false,
            body: 'Still here'
        });
        const lastContact = await lastContactOf(zammad, talking.id);
        // The cut-off: after everything above was created, before the customer's later message.
        const cutoff = new Date(lastContact ?? 0).getTime() - 600;

        // After the cut-off: young, whatever else is true of them.
        const young = await createTicket({
            customer: { email: `gdpr-${run}-j@example.com` },
            subject: 'Young',
            message: 'New',
            senderVerified: false,
            requestRef: `ref-${run}-j`
        });
        const youngCustomer = await makeUser(zammad, `gdpr-${run}-k@example.com`);

        // 1. The real clock: nothing of this run is past any window.
        await passAt(Date.now());
        expect(await findDataPrivacyTask(integration, 'Ticket', open.id)).toBeUndefined();
        expect(await findDataPrivacyTask(integration, 'Ticket', spam.id)).toBeUndefined();

        // 2. 31 days on: a suspected-spam ticket is due, whatever its age otherwise.
        await passAt(cutoff + 31 * DAY_MS);
        expect(await findDataPrivacyTask(integration, 'Ticket', spam.id)).toBeDefined();
        expect(await findDataPrivacyTask(integration, 'Ticket', open.id)).toBeUndefined();
        expect(await findDataPrivacyTask(integration, 'Ticket', closed.id)).toBeUndefined();

        // 3. The window on: open and closed alike are due, through the search AND the re-check.
        await passAt(cutoff + 730 * DAY_MS);
        expect(await findDataPrivacyTask(integration, 'Ticket', open.id)).toBeDefined();
        expect(await findDataPrivacyTask(integration, 'Ticket', closed.id)).toBeDefined();
        // The search returned it (created before the cut-off); the re-check kept it.
        expect(await findDataPrivacyTask(integration, 'Ticket', talking.id)).toBeUndefined();
        expect(await findDataPrivacyTask(integration, 'Ticket', young.id)).toBeUndefined();
        // A customer with no ticket left is due; one with a ticket, one made later, an agent and
        // the integration user are not.
        expect(await findDataPrivacyTask(integration, 'User', lonelyCustomer)).toBeDefined();
        expect(await findDataPrivacyTask(integration, 'User', talking.customerId)).toBeUndefined();
        expect(await findDataPrivacyTask(integration, 'User', youngCustomer)).toBeUndefined();
        expect(await findDataPrivacyTask(integration, 'User', agent)).toBeUndefined();
        expect(await findDataPrivacyTask(integration, 'User', me.id)).toBeUndefined();

        // 4. Again: a task Zammad has not run yet answers "already queued", so no second one.
        await passAt(cutoff + 730 * DAY_MS);
        expect(await tasksFor('Ticket', open.id)).toBe(1);
        expect(await tasksFor('User', lonelyCustomer)).toBe(1);
    }, 300_000);
});
