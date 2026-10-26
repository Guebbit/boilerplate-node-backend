/**
 * @module
 * The tickets section of a data export. A person owns the tickets sent while signed in as their
 * account (by id, whatever address was typed) and the tickets sent under their address, but only
 * once the account PROVED the address: anyone can sign up with a stranger's address, and without
 * the proof "export my data" would hand them every message that stranger ever sent (GDPR
 * Art. 12(6): verify identity before disclosing).
 */

import { setupTestDb } from '@tests/setup-test-db';
import { ticketService } from '@modules/tickets/service';
import ticketsModule from '@modules/tickets/module';

setupTestDb();

/** The tickets section's own `collect`, off the manifest — the way `account` reaches it. */
const [{ collect }] = ticketsModule.personalData;

/** The account under test. */
const ACCOUNT_ID = '65dc8a99604c307b702b5ccc';

/** Another account, to prove the id match is exact. */
const OTHER_ACCOUNT_ID = '65dc8a99604c307b702b5ddd';

/** A subject with the address a ticket was filed under. */
const subject = (emailVerified: boolean) => ({
    userId: ACCOUNT_ID,
    email: 'victim@example.com',
    emailVerified
});

/** Files one ticket under an address, optionally as a signed-in account. */
const fileTicket = (email = 'victim@example.com', subjectId?: string, message = 'my complaint') =>
    ticketService.create({ email, subject: 'A complaint', message, name: 'Victim' }, subjectId);

/** The messages an export carries for a subject. */
const exportedMessages = (emailVerified: boolean): Promise<string[]> =>
    collect(subject(emailVerified)).then((section) =>
        (section as { message: string }[]).map((ticket) => ticket.message).toSorted()
    );

describe('the tickets section of an export', () => {
    it('includes the tickets filed under the address of an account that proved it', async () => {
        await fileTicket();

        expect(await exportedMessages(true)).toEqual(['my complaint']);
    });

    it('includes a ticket sent before the account existed, as long as the address is proven', async () => {
        // Filed anonymously (no subjectId) — the account was created afterwards.
        await fileTicket('victim@example.com', undefined, 'sent before signing up');

        expect(await exportedMessages(true)).toEqual(['sent before signing up']);
    });

    it('includes a ticket sent signed in with ANOTHER typed address, even when the account is unproven', async () => {
        await fileTicket('typed-elsewhere@example.com', ACCOUNT_ID, 'sent while signed in');

        expect(await exportedMessages(false)).toEqual(['sent while signed in']);
        expect(await exportedMessages(true)).toEqual(['sent while signed in']);
    });

    it('leaves out the address match while the account is unproven', async () => {
        await fileTicket('victim@example.com', undefined, 'under the address');
        await fileTicket('typed-elsewhere@example.com', ACCOUNT_ID, 'by id');

        expect(await exportedMessages(false)).toEqual(['by id']);
    });

    it('never includes another account or another address', async () => {
        await fileTicket('stranger@example.com', undefined, 'a stranger');
        await fileTicket('other@example.com', OTHER_ACCOUNT_ID, 'another account');

        expect(await exportedMessages(true)).toEqual([]);
    });

    it('answers an empty array, never nothing: the section is always present', async () => {
        expect(await collect(subject(true))).toEqual([]);
        expect(await collect(subject(false))).toEqual([]);
    });

    it('exports the category and order number the filer gave: their own words', async () => {
        await ticketService.create({
            email: 'victim@example.com',
            subject: 'About my order',
            message: 'where is it',
            category: 'order',
            orderNumber: 'ORD-7'
        });

        const section = (await collect(subject(true))) as object[];

        expect(section[0]).toMatchObject({ category: 'order', orderNumber: 'ORD-7' });
    });

    it('exports status and respondedAt but never the staff-only adminNotes', async () => {
        const ticket = await fileTicket();
        await ticketService.updateStatusById(String(ticket._id), {
            status: 'resolved',
            adminNotes: 'internal assessment'
        });

        const section = (await collect(subject(true))) as object[];

        expect(section[0]).toMatchObject({ status: 'resolved' });
        expect(section[0]).toHaveProperty('respondedAt');
        expect(section[0]).not.toHaveProperty('adminNotes');
    });
});
