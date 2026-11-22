/**
 * The adapter against a REAL Zammad.
 *
 * `../integration/*` run the adapter against a stub that models what we believe Zammad does. Each
 * case here is one only a booted Zammad can answer: does it keep our custom fields, does the
 * `condition` search on `request_ref` find the ticket (public docs do not describe it), does
 * `customer_id: "guess:<email>"` make and then reuse a customer (and `customer: "guess:..."`
 * refuse), does a ticket created `closed` stay closed, does `X-Zammad-Suppress-Notifications`
 * silence a create, do user and ticket searches work without Elasticsearch and page past a hundred,
 * and what does a Data Privacy task answer when one is already queued.
 *
 * Needs the three `NODE_TEST_ZAMMAD_*` variables of `./support.ts`. An unset variable FAILS the
 * run: a skipped contract suite is not a green one. `npm run test:zammad`.
 *
 * @see docs/modules/zammad.md#testing
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
    addTicketTag,
    callZammad,
    createTicket,
    fileDataPrivacyTask,
    findDataPrivacyTask,
    findTicketByRef,
    findUsersByEmail,
    getDataPrivacyTask,
    getTicketTags,
    listUsers,
    searchAllTickets,
    searchTickets,
    SPAM_TAG,
    TICKETS_PAGE_SIZE,
    updateCustomer
} from '../../client';
import { ensureTicketFields } from '../../services/setup';
import {
    makeUser,
    makeWatcher,
    notificationsSettled,
    pointModuleAt,
    readTicket,
    realZammad,
    settingsFor,
    type Watcher
} from './support';

describe('the Zammad adapter against a real Zammad', () => {
    const zammad = realZammad();
    const integration = settingsFor(zammad, 'integration');
    const admin = settingsFor(zammad, 'admin');
    const run = randomUUID().slice(0, 8);
    let watcher: Watcher;

    beforeAll(async () => {
        await ensureTicketFields(admin);
        watcher = await makeWatcher(zammad, run);
    });

    beforeEach(() => {
        pointModuleAt(zammad);
    });

    it('keeps request_ref on a created ticket, and finds the ticket by it', async () => {
        const requestRef = `ref-${run}-a`;

        const created = await createTicket({
            customer: { email: `contract-${run}-a@example.com` },
            subject: 'Contract: create',
            message: 'Line one\n<b>not bold</b>',
            category: 'other',
            orderNumber: 'ORD-1',
            senderVerified: false,
            requestRef
        });
        const found = await findTicketByRef(requestRef);

        expect(created.refKept).toBe(true);
        expect(found).toMatchObject({ id: created.id, customerId: created.customerId });
    });

    it('finds nothing for a reference that was never used', async () => {
        await expect(findTicketByRef(`ref-${run}-never`)).resolves.toBeUndefined();
    });

    it('reuses the customer of an address it already made', async () => {
        const email = `contract-${run}-b@example.com`;

        const first = await createTicket({
            customer: { email },
            subject: 'Contract: first',
            message: 'One',
            senderVerified: false,
            requestRef: `ref-${run}-b1`
        });
        const second = await createTicket({
            customer: { email },
            subject: 'Contract: second',
            message: 'Two',
            senderVerified: false,
            requestRef: `ref-${run}-b2`
        });

        expect(second.customerId).toBe(first.customerId);
    });

    it('resolves the same customer again from the address', async () => {
        const created = await createTicket({
            customer: { email: `contract-${run}-c@example.com` },
            subject: 'Contract: by email',
            message: 'One',
            senderVerified: false,
            requestRef: `ref-${run}-c1`
        });

        const again = await createTicket({
            customer: { email: `contract-${run}-c@example.com` },
            subject: 'Contract: by the address again',
            message: 'Two',
            senderVerified: true,
            requestRef: `ref-${run}-c2`
        });

        expect(again.customerId).toBe(created.customerId);
    });

    it('updates a customer, and refuses an address another customer holds', async () => {
        const mine = await makeUser(zammad, `contract-${run}-d@example.com`);
        await makeUser(zammad, `contract-${run}-e@example.com`);

        await expect(
            updateCustomer(mine, `contract-${run}-d2@example.com`)
        ).resolves.toBeUndefined();
        await expect(updateCustomer(mine, `contract-${run}-e@example.com`)).rejects.toMatchObject({
            status: 422,
            unclear: false
        });
    });

    it('refuses `customer: "guess:<email>"`, which is why the adapter sends `customer_id`', async () => {
        await expect(
            callZammad(
                integration,
                'POST',
                '/tickets',
                {
                    title: 'Contract: customer guess',
                    group: zammad.group,
                    customer: `guess:contract-${run}-f@example.com`,
                    article: { subject: 's', body: 'b', type: 'web', internal: false }
                },
                z.unknown()
            )
        ).rejects.toMatchObject({ status: 422, unclear: false });
    });

    describe('a suspected-spam ticket', () => {
        it('is created closed, tagged, and read back with its tag', async () => {
            const created = await createTicket({
                customer: { email: `contract-${run}-g@example.com` },
                subject: 'Contract: spam',
                message: 'Buy my pills',
                senderVerified: false,
                requestRef: `ref-${run}-g`,
                suspectedSpam: true
            });

            await expect(readTicket(zammad, created.id)).resolves.toMatchObject({
                state: 'closed'
            });
            await expect(getTicketTags(integration, created.id)).resolves.toEqual([SPAM_TAG]);
            // Tagging twice is a no-op, which is what makes a retry safe.
            await expect(addTicketTag(integration, created.id, SPAM_TAG)).resolves.toBeUndefined();
            await expect(getTicketTags(integration, created.id)).resolves.toEqual([SPAM_TAG]);
        });

        it('notifies nobody, while an ordinary ticket notifies the agents watching the group', async () => {
            // Earlier cases made tickets too: wait until their notifications have all arrived.
            const before = await notificationsSettled(zammad, watcher);

            await createTicket({
                customer: { email: `contract-${run}-h@example.com` },
                subject: 'Contract: loud',
                message: 'A real question',
                senderVerified: false,
                requestRef: `ref-${run}-h1`
            });
            const afterLoud = await notificationsSettled(zammad, watcher);
            expect(afterLoud).toBeGreaterThan(before);

            await createTicket({
                customer: { email: `contract-${run}-h@example.com` },
                subject: 'Contract: quiet',
                message: 'Buy my pills',
                senderVerified: false,
                requestRef: `ref-${run}-h2`,
                suspectedSpam: true
            });

            await expect(notificationsSettled(zammad, watcher, 10_000)).resolves.toBe(afterLoud);
        });

        it('answers the search conditions the retention pass relies on: tags and an absolute date', async () => {
            const created = await createTicket({
                customer: { email: `contract-${run}-i@example.com` },
                subject: 'Contract: spam search',
                message: 'Buy my pills',
                senderVerified: false,
                requestRef: `ref-${run}-i`,
                suspectedSpam: true
            });
            const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
            const yesterday = new Date(Date.now() - 86_400_000).toISOString();

            const before = await searchTickets(
                integration,
                {
                    'ticket.tags': { operator: 'contains one', value: SPAM_TAG },
                    'ticket.created_at': { operator: 'before (absolute)', value: tomorrow }
                },
                1
            );
            const after = await searchTickets(
                integration,
                {
                    'ticket.tags': { operator: 'contains one', value: SPAM_TAG },
                    'ticket.created_at': { operator: 'before (absolute)', value: yesterday }
                },
                1
            );

            expect(before.map(({ id }) => id)).toContain(created.id);
            expect(after.map(({ id }) => id)).not.toContain(created.id);
        });
    });

    describe('the lookups that need no Elasticsearch', () => {
        it('finds a customer by its exact address', async () => {
            const email = `contract-${run}-j@example.com`;
            const id = await makeUser(zammad, email);

            const found = await findUsersByEmail(integration, email);

            expect(found.map((user) => user.id)).toEqual([id]);
        });

        it('lists role names, so a customer is told from an agent', async () => {
            const customer = await makeUser(zammad, `contract-${run}-k@example.com`);
            const agent = await makeUser(zammad, `contract-${run}-l@example.com`, 'Agent');
            const roles = new Map<number, string[] | undefined>();
            for (let page = 1; ; page += 1) {
                const users = await listUsers(integration, page);
                for (const user of users) roles.set(user.id, user.roles);
                if (users.length < 100) break;
            }

            expect(roles.get(customer)).toEqual(['Customer']);
            expect(roles.get(agent)).toEqual(['Agent']);
        });

        it('pages a ticket search past a hundred rows', async () => {
            const email = `contract-${run}-m@example.com`;
            const customer = await makeUser(zammad, email);
            const count = TICKETS_PAGE_SIZE + 1;
            // Ten at a time: a hundred and one sequential creates would take a minute.
            for (let start = 0; start < count; start += 10) {
                await Promise.all(
                    Array.from({ length: Math.min(10, count - start) }, (_, offset) =>
                        createTicket({
                            customer: { email },
                            subject: `Contract: page ${String(start + offset)}`,
                            message: 'One of many',
                            senderVerified: false,
                            requestRef: `ref-${run}-m${String(start + offset)}`
                        })
                    )
                );
            }

            const found = await searchAllTickets(integration, {
                'ticket.customer_id': { operator: 'is', value: customer }
            });

            expect(new Set(found.map(({ id }) => id)).size).toBe(count);
        }, 180_000);
    });

    describe('the Data Privacy task', () => {
        it('answers "already queued" to a second task, and lists the first with its state', async () => {
            const customer = await makeUser(zammad, `contract-${run}-n@example.com`);

            const first = await fileDataPrivacyTask(integration, 'User', customer);
            const second = await fileDataPrivacyTask(integration, 'User', customer);

            expect(first).toMatchObject({ state: 'in_process' });
            expect(second).toBe('queued');
            const listed = await findDataPrivacyTask(integration, 'User', customer);
            expect(listed).toEqual(first);
            if (first === 'queued') throw new Error('the first task was refused');
            await expect(getDataPrivacyTask(integration, first.id)).resolves.toEqual(first);
        });

        it('says "in process" for a task not yet run, the word the adapter reads', async () => {
            const customer = await makeUser(zammad, `contract-${run}-o@example.com`);
            await fileDataPrivacyTask(integration, 'User', customer);

            const rows = await callZammad(
                integration,
                'GET',
                '/data_privacy_tasks?page=1&per_page=100',
                undefined,
                z.array(z.object({ deletable_id: z.number(), state: z.string() }))
            );

            expect(rows.find((row) => row.deletable_id === customer)?.state).toBe('in process');
        });
    });

    describe('an SLA on our own field (H19)', () => {
        it('applies to the tickets of one category and to no other', async () => {
            const calendars = await callZammad(
                admin,
                'GET',
                '/calendars',
                undefined,
                z.array(z.object({ id: z.number() }))
            );
            await callZammad(
                admin,
                'POST',
                '/slas',
                {
                    name: `privacy-${run}`,
                    calendar_id: calendars[0]?.id,
                    first_response_time: 60,
                    condition: { 'ticket.shop_category': { operator: 'is', value: ['privacy'] } }
                },
                z.unknown()
            );

            const privacy = await createTicket({
                customer: { email: `contract-${run}-q@example.com` },
                subject: 'Contract: privacy',
                message: 'Delete my data',
                category: 'privacy',
                senderVerified: false,
                requestRef: `ref-${run}-q1`
            });
            const other = await createTicket({
                customer: { email: `contract-${run}-q@example.com` },
                subject: 'Contract: other',
                message: 'A question',
                category: 'other',
                senderVerified: false,
                requestRef: `ref-${run}-q2`
            });

            const privacyRead = await readTicket(zammad, privacy.id);
            const otherRead = await readTicket(zammad, other.id);
            expect(privacyRead.first_response_escalation_at).toBeTruthy();
            expect(otherRead.first_response_escalation_at).toBeFalsy();
        });
    });
});
