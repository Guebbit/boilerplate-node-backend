/**
 * @module
 * The feedback section of a data export. Tickets are matched by EMAIL — the contact form is open
 * to people with no account — so an export may include them only for an account that has proved
 * the address. Anyone can sign up with a stranger's address; without the proof, "export my data"
 * would hand them every message that stranger ever sent (GDPR Art. 12(6): verify identity before
 * disclosing).
 */

import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { create } from '@modules/feedback/service';
import feedbackModule from '@modules/feedback/module';

setupTestDb();

/** The feedback section's own `collect`, off the manifest — the way `account` reaches it. */
const [{ collect }] = feedbackModule.personalData;

/** A subject with the address a ticket was filed under. */
const subject = (emailVerified: boolean) => ({
    userId: '65dc8a99604c307b702b5ccc',
    email: 'victim@example.com',
    emailVerified
});

/** Files one ticket under the victim's address. */
const fileTicket = () =>
    create({
        email: 'victim@example.com',
        subject: 'A complaint',
        message: 'my private complaint',
        name: 'Victim'
    });

describe('the feedback section of an export', () => {
    beforeEach(() => {
        setEnvironment({ NODE_EXPORT_INCLUDE_FEEDBACK: '1' });
    });

    it('includes the tickets filed under the address of an account that proved it', async () => {
        await fileTicket();

        const section = (await collect(subject(true))) as { message: string }[];

        expect(section.map((ticket) => ticket.message)).toEqual(['my private complaint']);
    });

    it('omits the section for an account whose address is unproven, tickets or not', async () => {
        await fileTicket();

        expect(await collect(subject(false))).toBeUndefined();
    });

    it('still omits the section when the deployment has not turned the export on', async () => {
        setEnvironment({ NODE_EXPORT_INCLUDE_FEEDBACK: '0' });
        await fileTicket();

        expect(await collect(subject(true))).toBeUndefined();
    });
});
