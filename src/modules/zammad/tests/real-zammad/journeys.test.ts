/**
 * @module
 * The module's journeys against a REAL Zammad, through the doors a visitor and a technician use:
 * `POST /tasks` (the hand-over), the same message from a signed-in account, an email-check catch
 * (filed closed, tagged), and the hard delete of an account, followed to Zammad's own Data Privacy
 * task until the customer, their tickets and their files are gone.
 *
 * The app, the database and the module run in this process; only Zammad is real. The stub the
 * integration suites use cannot answer whether Zammad keeps what we send or really deletes what we
 * ask: this file can.
 *
 * @see docs/modules/zammad.md#testing
 */

import { randomUUID } from 'node:crypto';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { setEnvironment } from '@tests/environment';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { taskService } from '@modules/tasks';
import { findAllTasks } from '@modules/tasks/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import {
    downloadAttachment,
    findUsersByEmail,
    getTicketTags,
    listArticles,
    searchAllTickets,
    SPAM_TAG,
    getUser
} from '../../client';
import { zammadContactModel, zammadCustomerModel, zammadEraseJobModel } from '../../model';
import { zammadService } from '../../services';
import { ensureTicketFields } from '../../services/setup';
import { eraseAccount } from '../harness';
import {
    addArticle,
    pause,
    pointModuleAt,
    readTicket,
    realZammad,
    registerAllModules,
    settingsFor,
    statusOf
} from './support';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn().mockResolvedValue(undefined)
}));

/** Stands in for the mail queue; the cases assert that no to-do mail was sent. */
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

/** The booted Zammad the suite runs against. */
const zammad = realZammad();

/** The adapter's settings for the integration user, the token the module itself runs with. */
const integration = settingsFor(zammad, 'integration');

/** Keeps this run's addresses apart from any earlier run's on the same Zammad. */
const run = randomUUID().slice(0, 8);

beforeAll(() => ensureTicketFields(settingsFor(zammad, 'admin')));

beforeEach(() => {
    pointModuleAt(zammad);
    registerAllModules();
    mockEnqueueEmail.mockClear();
});

afterEach(() => zammadService.settleHandovers());

/**
 * The tickets Zammad holds for the customer with this address, after the hand-over has landed.
 *
 * @param email - the sender's address
 * @returns the customer's id and their ticket ids
 * @throws {Error} when Zammad has no customer for the address
 */
const ticketsOf = async (email: string): Promise<{ customerId: number; ticketIds: number[] }> => {
    const [customer] = await findUsersByEmail(integration, email);
    if (!customer) throw new Error(`Zammad has no customer for ${email}`);
    const tickets = await searchAllTickets(integration, {
        'ticket.customer_id': { operator: 'is', value: customer.id }
    });
    return { customerId: customer.id, ticketIds: tickets.map(({ id }) => id) };
};

describe('POST /tasks with Zammad on', () => {
    it('answers 202 and files one ticket with our fields, escaped, and no to-do', async () => {
        const email = `journey-${run}-a@example.com`;

        await api()
            .post('/tasks')
            .send({
                name: 'Ada <b>Lovelace</b>',
                email,
                subject: 'Where is my parcel',
                message: 'Line one\n<script>alert(1)</script>',
                category: 'order',
                orderNumber: 'ORD-1'
            })
            .expect(202);
        await zammadService.settleHandovers();

        const { ticketIds } = await ticketsOf(email);
        expect(ticketIds).toHaveLength(1);
        const [id] = ticketIds;
        const ticket = await readTicket(zammad, id);
        expect(ticket).toMatchObject({
            state: 'new',
            shop_category: 'order',
            order_number: 'ORD-1',
            shop_sender_verified: false
        });
        // The dedup stamp is the pending row's own id.
        expect(ticket.request_ref).toMatch(/^[0-9a-f]{24}$/);
        const [article] = await listArticles(integration, id);
        expect(article).toMatchObject({ type: 'web', sender: 'Customer', internal: false });
        expect(article.body).toContain('Line one<br>');
        expect(article.body).toContain('&lt;script&gt;');
        expect(article.body).not.toContain('<script>');
        expect(await findAllTasks()).toEqual([]);
        expect(await zammadContactModel.countDocuments()).toBe(0);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('links a verified signed-in sender to the account, and reuses its customer', async () => {
        const email = `journey-${run}-b@example.com`;
        const user = await createUser({ email, verifiedAt: new Date() });

        await taskService.submit({ email, subject: 'First', message: 'One' }, user.id);
        await zammadService.settleHandovers();
        await taskService.submit({ email, subject: 'Second', message: 'Two' }, user.id);
        await zammadService.settleHandovers();

        const { customerId, ticketIds } = await ticketsOf(email);
        expect(ticketIds).toHaveLength(2);
        for (const id of ticketIds) {
            const ticket = await readTicket(zammad, id);
            expect(ticket).toMatchObject({ customer_id: customerId, shop_sender_verified: true });
            expect(ticket.shop_account).toContain(user.id);
        }
        expect(await zammadCustomerModel.find().lean()).toMatchObject([
            { userId: user._id, zammadUserId: customerId }
        ]);
    });

    it('files an email-check catch closed and tagged, with no to-do', async () => {
        setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: 'disposable' });
        const email = `journey-${run}-c@mailinator.com`;

        await taskService.submit({ email, subject: 'Hello', message: 'Buy my pills' });
        await zammadService.settleHandovers();

        const { ticketIds } = await ticketsOf(email);
        expect(ticketIds).toHaveLength(1);
        await expect(readTicket(zammad, ticketIds[0])).resolves.toMatchObject({ state: 'closed' });
        await expect(getTicketTags(integration, ticketIds[0])).resolves.toEqual([SPAM_TAG]);
        expect(await findAllTasks()).toEqual([]);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });
});

/** What an erased account leaves in Zammad before the job runs: the customer, a ticket, a file. */
interface Footprint {
    customerId: number;
    ticketId: number;
    articleId: number;
    attachmentId: number;
}

/**
 * The customer's one ticket with a file the customer attached, read back from Zammad.
 *
 * @param email - the customer's address
 * @throws {Error} when the ticket or its file is not there
 */
const footprintOf = async (email: string): Promise<Footprint> => {
    const { customerId, ticketIds } = await ticketsOf(email);
    const ticketId = ticketIds[0];
    await addArticle(zammad, ticketId, {
        sender: 'Customer',
        internal: false,
        body: 'The photo of the parcel',
        files: [{ filename: 'parcel.txt', text: `PARCEL-${email}`, mimeType: 'text/plain' }]
    });
    for (const article of await listArticles(integration, ticketId)) {
        const [attachment] = article.attachments ?? [];
        if (attachment) {
            return { customerId, ticketId, articleId: article.id, attachmentId: attachment.id };
        }
    }
    throw new Error(`no attachment on ticket ${String(ticketId)}`);
};

/**
 * What Zammad answers for each thing the footprint names. A deleted customer or ticket is a 404;
 * a deleted ticket's file has no ticket to resolve through and Zammad answers 500 (seen on 7.2.3).
 * The exact statuses are asserted so a 403 or a dropped connection does not read as "gone", and
 * the bystander's file, which still downloads, shows that a 500 here is not Zammad failing at large.
 *
 * @param footprint - what to look for
 */
const answersFor = async (footprint: Footprint) => ({
    user: await getUser(integration, footprint.customerId),
    ticket: await statusOf(readTicket(zammad, footprint.ticketId)),
    file: await statusOf(
        downloadAttachment(
            integration,
            footprint.ticketId,
            footprint.articleId,
            footprint.attachmentId
        )
    )
});

/** What Zammad answers once the customer, their ticket and its file are deleted. */
const GONE = { user: undefined, ticket: 404, file: 500 };

describe('the hard delete of an account', () => {
    it('has Zammad delete the customer, their tickets and their files, and nobody else', async () => {
        const mappedEmail = `journey-${run}-d@example.com`;
        const addressEmail = `journey-${run}-e@example.com`;
        const bystanderEmail = `journey-${run}-f@example.com`;

        // A signed-in sender: the account is mapped to its customer.
        const mapped = await createUser({ email: mappedEmail, verifiedAt: new Date() });
        await taskService.submit(
            { email: mappedEmail, subject: 'Mapped', message: 'One' },
            mapped.id
        );
        // A guest who only later made an account with the same, verified, address: no mapping at all,
        // the customer is found by the address.
        await taskService.submit({ email: addressEmail, subject: 'By address', message: 'Two' });
        const byAddress = await createUser({ email: addressEmail, verifiedAt: new Date() });
        // Somebody else, who must still be there afterwards.
        await taskService.submit({ email: bystanderEmail, subject: 'Bystander', message: 'Three' });
        await zammadService.settleHandovers();

        const mappedFootprint = await footprintOf(mappedEmail);
        const addressFootprint = await footprintOf(addressEmail);
        const bystander = await footprintOf(bystanderEmail);

        await eraseAccount(mapped.id);
        await eraseAccount(byAddress.id);

        // Zammad runs its Data Privacy tasks from a scheduler with a ten-minute period, so a task
        // filed just after a tick waits nearly that long. Sweep once a minute until both are done.
        const deadline = Date.now() + 12 * 60_000;
        let done = false;
        while (!done && Date.now() < deadline) {
            await zammadEraseJobModel
                .updateMany({ state: 'pending' }, { $set: { nextAttemptAt: new Date(0) } })
                .exec();
            await zammadService.sweepErasures();
            done = (await zammadEraseJobModel.countDocuments({ state: 'completed' })) === 2;
            if (!done) await pause(20_000);
        }

        expect(done).toBe(true);
        expect(await zammadEraseJobModel.find({ state: { $ne: 'completed' } }).lean()).toEqual([]);
        expect(await answersFor(mappedFootprint)).toEqual(GONE);
        expect(await answersFor(addressFootprint)).toEqual(GONE);
        // The bystander's customer, ticket and file are all still there.
        expect(await getUser(integration, bystander.customerId)).toBeDefined();
        await expect(readTicket(zammad, bystander.ticketId)).resolves.toMatchObject({
            id: bystander.ticketId
        });
        await expect(
            downloadAttachment(
                integration,
                bystander.ticketId,
                bystander.articleId,
                bystander.attachmentId
            )
        ).resolves.toBeInstanceOf(Buffer);
        // The completed job keeps no address; the mapping went with the account.
        const jobs = await zammadEraseJobModel.find().lean();
        expect(jobs.every((job) => job.email === undefined)).toBe(true);
        expect(await zammadCustomerModel.countDocuments()).toBe(0);
    }, 900_000);
});
