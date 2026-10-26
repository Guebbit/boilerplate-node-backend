/**
 * @module
 * A visitor's messages follow their account: the form records the signed-in sender, and the
 * erasure removes exactly the set the export lists (`src/modules/tickets/domain/ownership.ts`).
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { Types } from 'mongoose';
import { withTransaction } from '@infrastructure/runtime/database';
import { ticketService } from '@modules/tickets/service';
import { ticketRepository } from '@modules/tickets/repository';
import ticketsModule from '@modules/tickets/module';
import type { PersonalDataEraser } from '@kernel/registry';
import { TicketKind, TicketLinkType, TicketSource } from '@types';

setupTestDb();

/** The tickets section, off the manifest — the way `account` and `users` reach it. */
const [{ collect }] = ticketsModule.personalData;

/** The erase hook, off the manifest — the way `users` reaches it. */
const erase = (
    subject: Parameters<PersonalDataEraser>[0],
    session: Parameters<PersonalDataEraser>[1]
): Promise<void> => {
    const hook = ticketsModule.personalData[0].erase;
    if (!hook) throw new Error('the tickets section declares no erase hook');
    return Promise.resolve(hook(subject, session)).then(() => undefined);
};

/** The account under test. */
const ACCOUNT_ID = '65dc8a99604c307b702b5ccc';

/** Another account, whose tickets must survive. */
const OTHER_ACCOUNT_ID = '65dc8a99604c307b702b5ddd';

/** A subject for the account under test. */
const subject = (emailVerified: boolean) => ({
    userId: ACCOUNT_ID,
    email: 'victim@example.com',
    emailVerified
});

/** Files one ticket, optionally as a signed-in account. */
const fileTicket = (email: string, message: string, subjectId?: string) =>
    ticketService.create({ email, subject: 'Hello', message }, subjectId);

/** Every message still stored, sorted. */
const storedMessages = (): Promise<string[]> =>
    ticketRepository.findAll({}).then((rows) => rows.map((row) => row.message).toSorted());

/** The valid-looking body of a contact submission. */
const FORM = {
    name: 'Ada',
    email: 'ada@example.com',
    subject: 'A question',
    message: 'Does it come in blue?'
};

describe('POST /tickets records who sent it', () => {
    it('records the signed-in sender’s account as subjectId', async () => {
        const { bearer, user } = await authenticateAs('user');

        const response = await api().post('/tickets').set('Authorization', bearer).send(FORM);

        expect(response.status).toBe(201);
        expect(response.body.subjectId).toBe(String(user._id));
    });

    it('records no account for an anonymous sender', async () => {
        const response = await api().post('/tickets').send(FORM);

        expect(response.status).toBe(201);
        expect(response.body).not.toHaveProperty('subjectId');
    });

    it('files a post with a bad token as anonymous, not a refusal', async () => {
        const response = await api()
            .post('/tickets')
            .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.not-a-valid-signature')
            .send(FORM);

        expect(response.status).toBe(201);
        expect(response.body).not.toHaveProperty('subjectId');
    });
});

/** A system ticket about a record, optionally about the account under test. */
const systemTicket = (link: { type: TicketLinkType; id: string }, extra: object = {}) =>
    ticketRepository.create({
        source: TicketSource.system,
        kind: TicketKind.account_review,
        routeSet: 'UserBanning',
        subject: 'Review',
        message: 'A person must look.',
        link,
        subjectId: new Types.ObjectId(ACCOUNT_ID),
        ...extra
    });

describe('erasing the system tickets about a person', () => {
    it('deletes a ticket that IS the person’s (its record is the account) and detaches one that outlives them', async () => {
        const about = await systemTicket({ type: TicketLinkType.user, id: ACCOUNT_ID });
        const order = await systemTicket({ type: TicketLinkType.order, id: 'order-1' });

        await withTransaction((session) => erase(subject(true), session));

        expect(await ticketRepository.findById(String(about._id))).toBeNull();
        const kept = await ticketRepository.findById(String(order._id));
        expect(kept?.subjectId).toBeUndefined();
    });

    it('forgets an erased member of staff as assignee and as the author of notes', async () => {
        const staffId = new Types.ObjectId();
        const worked = await systemTicket(
            { type: TicketLinkType.order, id: 'order-2' },
            {
                subjectId: new Types.ObjectId(OTHER_ACCOUNT_ID),
                assigneeId: staffId,
                notes: [{ authorId: staffId, body: 'looked into it', at: new Date() }]
            }
        );

        await withTransaction((session) =>
            erase({ ...subject(true), userId: String(staffId) }, session)
        );

        const after = await ticketRepository.findById(String(worked._id));
        expect(after?.assigneeId).toBeUndefined();
        expect(after?.notes[0].authorId).toBeUndefined();
        expect(after?.notes[0].body).toBe('looked into it');
    });
});

describe('erasing a person’s tickets', () => {
    it('deletes what was sent signed in, even under another address and with an unproven account', async () => {
        await fileTicket('typed-elsewhere@example.com', 'by id', ACCOUNT_ID);

        await withTransaction((session) => erase(subject(false), session));

        expect(await storedMessages()).toEqual([]);
    });

    it('deletes what was sent under a verified address, including before the account existed', async () => {
        await fileTicket('victim@example.com', 'before the account');

        await withTransaction((session) => erase(subject(true), session));

        expect(await storedMessages()).toEqual([]);
    });

    it('keeps another address, another account, and the address match of an unproven account', async () => {
        await fileTicket('stranger@example.com', 'a stranger');
        await fileTicket('other@example.com', 'another account', OTHER_ACCOUNT_ID);
        await fileTicket('victim@example.com', 'the unproven address');

        await withTransaction((session) => erase(subject(false), session));

        expect(await storedMessages()).toEqual([
            'a stranger',
            'another account',
            'the unproven address'
        ]);
    });

    it('deletes an open ticket and a spam one alike', async () => {
        const open = await fileTicket('victim@example.com', 'still open');
        const spam = await ticketService.create(
            {
                email: 'victim@example.com',
                subject: 'x',
                message: 'looks like spam',
                website: 'bot'
            },
            ACCOUNT_ID
        );

        await withTransaction((session) => erase(subject(true), session));

        expect(await ticketRepository.findById(String(open._id))).toBeNull();
        expect(await ticketRepository.findById(String(spam._id))).toBeNull();
    });

    it('rolls back with the transaction', async () => {
        await fileTicket('victim@example.com', 'must survive a rollback', ACCOUNT_ID);

        await expect(
            withTransaction((session) =>
                erase(subject(true), session).then(() => {
                    throw new Error('a later hook failed');
                })
            )
        ).rejects.toThrow('a later hook failed');

        expect(await storedMessages()).toEqual(['must survive a rollback']);
    });

    it('removes exactly the set the export lists', async () => {
        await fileTicket('victim@example.com', 'by address');
        await fileTicket('typed-elsewhere@example.com', 'by id', ACCOUNT_ID);
        await fileTicket('stranger@example.com', 'not theirs');
        const before = await storedMessages();

        const exported = ((await collect(subject(true))) as { message: string }[]).map(
            (ticket) => ticket.message
        );
        await withTransaction((session) => erase(subject(true), session));

        const after = new Set(await storedMessages());
        const removed = before.filter((message) => !after.has(message));
        expect(removed.toSorted()).toEqual(exported.toSorted());
    });
});
