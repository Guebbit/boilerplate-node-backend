/**
 * @module
 * The overdue reminder, driven the way production drives it: a ticket opened and alerted, its due
 * date passed, the tickets sweep run. Proves the reminder goes to the SAME people as the opener
 * (bell and mail), once, never for a closed ticket, and falls back as the opener does when nobody
 * in the set can be told.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { asRole } from '@tests/callers';
import { setEnvironment } from '@tests/environment';
import { createUser } from '@modules/users/tests/factories';
import { notificationsService } from '@modules/notifications/services';
import { ticketService } from '@modules/tickets';
import { backdateDue, closeDirectly, createRefundTicket } from '@modules/tickets/tests/factories';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { callerInScope } from '@kernel/permissions';
import { resetDomainEvents } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import { enabledModules } from '../../../../modules';

// The queue, not the copy.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    mockEnqueueEmail.mockReset();
    mockEnqueueEmail.mockResolvedValue(undefined);
    setEnvironment({ NODE_CONTACT_NOTIFY_EMAIL: 'desk@example.com' });
    resetDomainEvents();
    registerModules(enabledModules);
});

afterEach(() => resetDomainEvents());

/** A staff member who can act: the role given, an authenticator app armed. */
const staff = (role: string, email: string) =>
    createUser(
        {
            email,
            username: email.split('@', 1).join(''),
            authenticatorEnabledAt: new Date()
        },
        role
    );

/** `userId` reading the bell as `role`, in the deployment's shop, overdue notices only. */
const overdueBellOf = (role: string, userId: string) =>
    notificationsService
        .listVisible(
            callerInScope({ ...asRole(role, userId), tenantId: DEPLOYMENT_TENANT_ID }, 'tenant')
        )
        .then(({ items }) =>
            items.filter((item) => item.code === 'notifications.staff.ticket-overdue')
        );

/** Per-person overdue mails queued so far (the subject carries the wording). */
const overdueMails = () =>
    mockEnqueueEmail.mock.calls.filter(
        ([envelope, template]) =>
            template === 'notifications.staff-notice' &&
            envelope.subject?.startsWith('Overdue') === true
    );

/** Fallback-mailbox mails queued so far, with their subjects. */
const fallbackMails = () =>
    mockEnqueueEmail.mock.calls.filter(([, template]) => template === 'tickets.contact');

/** A contact message, overdue. */
const overdueContact = async () => {
    const ticket = await ticketService.create({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        subject: 'Where is my parcel',
        message: 'Please call me.'
    });
    await backdateDue(String(ticket._id));
    mockEnqueueEmail.mockClear();
    return ticket;
};

describe('an overdue contact ticket', () => {
    it('tells the people who work contact tickets, once, by bell and by mail', async () => {
        const support = await staff('support', 'support@example.com');
        const manager = await staff('manager', 'manager@example.com');
        const ticket = await overdueContact();

        await ticketService.remindOverdue();
        await ticketService.remindOverdue();

        await expect(overdueBellOf('support', support.id)).resolves.toMatchObject([
            { audience: 'staff', params: { ticketId: String(ticket._id), kind: 'contact' } }
        ]);
        await expect(overdueBellOf('manager', manager.id)).resolves.toEqual([]);
        expect(overdueMails().map(([envelope]) => envelope.to)).toEqual(['support@example.com']);
    });

    it('does not repeat when the event itself is delivered twice', async () => {
        const support = await staff('support', 'support@example.com');
        const ticket = await overdueContact();
        const fact = {
            tenantId: DEPLOYMENT_TENANT_ID,
            ticketId: String(ticket._id),
            kind: 'contact',
            routeSet: 'TicketDisplay'
        };

        await notificationsService.onTicketOverdue(fact);
        await notificationsService.onTicketOverdue(fact);

        await expect(overdueBellOf('support', support.id)).resolves.toHaveLength(1);
        expect(overdueMails()).toHaveLength(1);
    });

    it('says nothing for a ticket closed before the sweep', async () => {
        const support = await staff('support', 'support@example.com');
        const ticket = await overdueContact();
        await closeDirectly(String(ticket._id));

        await ticketService.remindOverdue();

        await expect(overdueBellOf('support', support.id)).resolves.toEqual([]);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('falls back to the mailbox, worded as a reminder, when nobody can be told', async () => {
        await createUser({ email: 'unarmed@example.com', username: 'unarmed' }, 'support');
        await overdueContact();

        await ticketService.remindOverdue();

        expect(overdueMails()).toHaveLength(0);
        const [[envelope, , data]] = fallbackMails();
        expect(envelope).toMatchObject({ to: 'desk@example.com', replyTo: 'ada@example.com' });
        expect(envelope.subject).toMatch(/^Overdue contact request/);
        expect(data).toMatchObject({ message: 'Please call me.' });
    });
});

describe('an overdue system ticket', () => {
    it('tells whoever holds the ticket’s own set, nobody else', async () => {
        const moderator = await staff('moderator', 'mod@example.com');
        const support = await staff('support', 'support@example.com');
        const ticket = await createRefundTicket();
        await backdateDue(String(ticket._id));
        mockEnqueueEmail.mockClear();

        await ticketService.remindOverdue();

        await expect(overdueBellOf('moderator', moderator.id)).resolves.toMatchObject([
            { code: 'notifications.staff.ticket-overdue', params: { kind: 'manual_refund_owed' } }
        ]);
        await expect(overdueBellOf('support', support.id)).resolves.toEqual([]);
        expect(overdueMails().map(([envelope]) => envelope.to)).toEqual(['mod@example.com']);
    });

    it('goes nowhere when nobody holds the set, like the opener: no fallback mailbox', async () => {
        const ticket = await createRefundTicket();
        await backdateDue(String(ticket._id));
        mockEnqueueEmail.mockClear();

        await expect(ticketService.remindOverdue()).resolves.toBe(1);

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });
});
