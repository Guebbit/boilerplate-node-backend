/**
 * @module
 * Integration tests for the ticket service. Pins create (lowercased email, trimmed
 * fields, blank `name` → `undefined`, the contact kind's route set and due date, the honeypot
 * disposition), the staff search and `removeById`. The doors live in the doors' own test file.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerContextAs } from '@tests/callers';
import { observePort } from '@tests/ports';
import { ticketService } from '@modules/tickets/service';
import { ticketRepository } from '@modules/tickets/repository';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import * as auditPort from '@infrastructure/observability/audit';
import { ticketsAuditActions } from '@modules/tickets/audit';
import { TicketStatus } from '@types';
import { asReject } from '@tests/response';
import { MISSING_ID } from '@tests/ids';
import { setEnvironment } from '@tests/environment';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn().mockResolvedValue(undefined)
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

/* Replaced for the same reason `orders/tests/integration/cancel.test.ts` replaces it — see
 * `tests/support/ports.ts`. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

/*
 * `notifyMailbox()` reads `NODE_CONTACT_NOTIFY_EMAIL` from the environment at call time. `.env`
 * supplies it via `dotenv/config` in `src/app.ts`, which a service-level suite never imports — so
 * without this the honeypot tests below would pass for the wrong reason (nothing configured to
 * notify, rather than the honeypot suppressing the notification).
 */
beforeEach(() => {
    setEnvironment({ NODE_CONTACT_NOTIFY_EMAIL: 'admin@example.com' });
});
afterEach(() => jest.clearAllMocks());

/** A valid creation payload; overrides let each test vary one field at a time. */
const makePayload = (overrides: Record<string, string> = {}) => ({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Broken checkout',
    message: 'The cart total is wrong.',
    ...overrides
});

describe('create', () => {
    it('stores a new request with status "new"', async () => {
        const ticket = await ticketService.create(makePayload());

        // Every request starts in the same state regardless of what a client sent — the status
        // field is admin-controlled, not caller-controlled.
        expect(ticket.status).toBe(TicketStatus.new);
        expect(ticket.subject).toBe('Broken checkout');
    });

    it('lowercases the email so the same address is one identity', async () => {
        const ticket = await ticketService.create(makePayload({ email: 'Ada@Example.COM' }));

        expect(ticket.email).toBe('ada@example.com');
    });

    it('trims surrounding whitespace from every text field', async () => {
        const ticket = await ticketService.create(
            makePayload({
                name: '  Ada Lovelace  ',
                email: '  ada@example.com  ',
                subject: '  Broken checkout  ',
                message: '  The cart total is wrong.  '
            })
        );

        expect(ticket.name).toBe('Ada Lovelace');
        expect(ticket.email).toBe('ada@example.com');
        expect(ticket.subject).toBe('Broken checkout');
        expect(ticket.message).toBe('The cart total is wrong.');
    });

    it('treats a blank name as absent rather than empty', async () => {
        // `|| undefined` — the field is optional, and '' would render as an empty author line in
        // any admin view instead of falling back to the email.
        const ticket = await ticketService.create(makePayload({ name: '   ' }));

        expect(ticket.name).toBeUndefined();
    });

    it('keeps the category and the order number the visitor gave, trimmed', async () => {
        const ticket = await ticketService.create({
            ...makePayload(),
            category: 'cancellation',
            orderNumber: '  ORD-1042  '
        });

        expect(ticket.category).toBe('cancellation');
        expect(ticket.orderNumber).toBe('ORD-1042');
    });

    it('leaves both absent when the visitor chose neither', async () => {
        const ticket = await ticketService.create(makePayload());

        expect(ticket.category).toBeUndefined();
        expect(ticket.orderNumber).toBeUndefined();
    });

    it('keeps a name that is only whitespace-padded', async () => {
        const ticket = await ticketService.create(makePayload({ name: ' A ' }));

        expect(ticket.name).toBe('A');
    });
});

describe('create — the operator notification', () => {
    it('files a request that names nobody', async () => {
        const { name: _omitted, ...withoutName } = makePayload();

        const ticket = await ticketService.create(withoutName);

        expect(ticket.name).toBeUndefined();
        expect(ticket.email).toBe('ada@example.com');
    });

    it('goes to the configured mailbox, with the ticket’s own words and the moment it was filed', async () => {
        const ticket = await ticketService.create(makePayload());

        const [envelope, template, data] = mockEnqueueEmail.mock.calls[0];
        expect(envelope).toMatchObject({ to: 'admin@example.com' });
        expect(envelope.subject).toContain('Broken checkout');
        expect(template).toBe('tickets.contact');
        expect(data).toMatchObject({
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            subject: 'Broken checkout',
            message: 'The cart total is wrong.',
            createdAt: ticket.createdAt?.toISOString()
        });
    });

    it('sends nothing when no mailbox is configured at all', async () => {
        setEnvironment({ NODE_CONTACT_NOTIFY_EMAIL: undefined, NODE_SMTP_SENDER: undefined });

        const ticket = await ticketService.create(makePayload());

        expect(ticket.status).toBe(TicketStatus.new);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });
});

describe('create — honeypot', () => {
    it('sends the operator notification when the honeypot is empty', async () => {
        await ticketService.create(makePayload());

        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('writes a suspected-spam submission as status "spam" and sends no notification', async () => {
        const ticket = await ticketService.create(
            makePayload({ website: 'https://spammer.example' })
        );

        expect(ticket.status).toBe(TicketStatus.spam);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('treats a whitespace-only honeypot as empty, same as a real client leaves it', async () => {
        const ticket = await ticketService.create(makePayload({ website: '   ' }));

        expect(ticket.status).toBe(TicketStatus.new);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('never persists or returns the honeypot field itself', async () => {
        const ticket = await ticketService.create(
            makePayload({ website: 'https://spammer.example' })
        );

        const serialized = ticket.toJSON() as Record<string, unknown>;
        expect(serialized).not.toHaveProperty('website');

        const reloaded = await ticketRepository.findByIdRaw(String(ticket._id));
        expect(reloaded).not.toHaveProperty('website');
    });
});

describe('create — disposable-email policy', () => {
    // Every anti-automation rung must be provably off by default.
    it('is off by default — a known disposable domain still notifies as normal', async () => {
        setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: undefined });

        const ticket = await ticketService.create(makePayload({ email: 'someone@mailinator.com' }));

        expect(ticket.status).toBe(TicketStatus.new);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('files a disposable-domain submission as spam, same as the honeypot, with a 201-shaped result', async () => {
        setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: 'disposable' });

        const ticket = await ticketService.create(makePayload({ email: 'someone@mailinator.com' }));

        // Filed and returned exactly like the honeypot catches a bot: no visible refusal that
        // would tell a spam script which signal caught it.
        expect(ticket.status).toBe(TicketStatus.spam);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });
});

/** The staff member every read and move in this file is made as. */
const staff = callerContextAs('admin');

/** Seeds a small, deliberately varied corpus. */
const seed = async () => {
    await ticketService.create(makePayload({ email: 'ada@example.com', subject: 'Checkout bug' }));
    await ticketService.create(
        makePayload({ email: 'grace@example.com', subject: 'Login trouble' })
    );
    const third = await ticketService.create(
        makePayload({ email: 'alan@example.com', subject: 'Feature idea' })
    );
    await ticketService.resolve(String(third._id), staff);
};

describe('search', () => {
    it('returns every request when no filter is given', async () => {
        await seed();

        const { items, meta } = await ticketService.search({}, staff);

        expect(items).toHaveLength(3);
        expect(meta.totalItems).toBe(3);
    });

    it('filters by status', async () => {
        await seed();

        const { items } = await ticketService.search({ status: 'resolved' }, staff);

        expect(items).toHaveLength(1);
        expect(items[0].email).toBe('alan@example.com');
    });

    it('filters by category', async () => {
        await ticketService.create({ ...makePayload(), category: 'privacy' });
        await ticketService.create({ ...makePayload(), category: 'order' });
        await ticketService.create(makePayload());

        const { items } = await ticketService.search({ category: 'privacy' }, staff);

        expect(items).toHaveLength(1);
        expect(items[0].category).toBe('privacy');
    });

    it('filters by email fragment', async () => {
        await seed();

        const { items } = await ticketService.search({ email: 'grace' }, staff);

        expect(items).toHaveLength(1);
        expect(items[0].email).toBe('grace@example.com');
    });

    it('searches free text across name, subject and message', async () => {
        await seed();

        const { items } = await ticketService.search({ text: 'Login' }, staff);

        expect(items).toHaveLength(1);
        expect(items[0].subject).toBe('Login trouble');
    });

    it('paginates and reports coherent meta', async () => {
        await seed();

        const { items, meta } = await ticketService.search({ page: 1, pageSize: 2 }, staff);

        expect(items).toHaveLength(2);
        // The three meta fields must agree with each other and with the page actually returned;
        // a totalPages computed from the page size rather than the total is a classic off-by-one.
        expect(meta).toMatchObject({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
    });
});

describe('removeById', () => {
    it('permanently deletes an existing request', async () => {
        const ticket = await ticketService.create(makePayload());

        const result = await ticketService.removeById(String(ticket._id), staff);

        expect(result.success).toBe(true);
        expect(await ticketRepository.findById(String(ticket._id))).toBeNull();
    });

    it('rejects with 404 for an id that does not exist', async () => {
        const result = await ticketService.removeById(MISSING_ID, staff);

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(404);
    });

    it('emits admin.ticket.deleted with the target id', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const ticket = await ticketService.create(makePayload());

        await ticketService.removeById(String(ticket._id), staff);

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ticketsAuditActions.ADMIN_TICKET_DELETED,
                outcome: 'success',
                targetType: 'ticket',
                targetId: String(ticket._id)
            })
        );
    });
});
