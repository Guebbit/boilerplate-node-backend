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
import { TicketKind, TicketSource, TicketStatus } from '@types';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { onDomainEvent, resetDomainEvents, type DomainEventMap } from '@kernel/events';
import { TICKET_OPENED } from '@modules/tickets/events';
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

/** The `ticket.opened` facts announced since the test began. */
let opened: DomainEventMap['ticket.opened'][] = [];

/*
 * `mailFallbackMailbox` reads `NODE_CONTACT_NOTIFY_EMAIL` at call time. `.env` supplies it via
 * `dotenv/config` in `src/app.ts`, which a service-level suite never imports, so it is set here.
 * Modules are not registered: the announcement is caught by a listener of the test's own.
 */
beforeEach(() => {
    setEnvironment({ NODE_CONTACT_NOTIFY_EMAIL: 'admin@example.com' });
    opened = [];
    resetDomainEvents();
    onDomainEvent(TICKET_OPENED, (fact) => {
        opened.push(fact);
    });
});
afterEach(() => {
    jest.clearAllMocks();
    resetDomainEvents();
});

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

describe('create — the announcement', () => {
    it('files a request that names nobody', async () => {
        const { name: _omitted, ...withoutName } = makePayload();

        const ticket = await ticketService.create(withoutName);

        expect(ticket.name).toBeUndefined();
        expect(ticket.email).toBe('ada@example.com');
    });

    it('announces ticket.opened with ids and closed codes only, never the visitor’s words', async () => {
        const ticket = await ticketService.create(makePayload({ category: 'cancellation' }));

        expect(opened).toEqual([
            {
                tenantId: DEPLOYMENT_TENANT_ID,
                ticketId: String(ticket._id),
                kind: 'contact',
                routeSet: 'TicketDisplay',
                category: 'cancellation'
            }
        ]);
        expect(JSON.stringify(opened)).not.toContain('Ada');
        expect(JSON.stringify(opened)).not.toContain('ada@example.com');
        expect(JSON.stringify(opened)).not.toContain('cart total');
    });

    it('leaves the category out of the announcement when the visitor chose none', async () => {
        await ticketService.create(makePayload());

        expect(opened[0]).not.toHaveProperty('category');
    });

    it('sends no mail itself: telling people is the subscriber’s business', async () => {
        await ticketService.create(makePayload());

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });
});

describe('mailFallbackMailbox', () => {
    it('mails the configured mailbox the full message, the category and a Reply-To of the bare address', async () => {
        const ticket = await ticketService.create(
            makePayload({ name: '"Ada" <evil@example.com>', category: 'privacy' })
        );

        await ticketService.mailFallbackMailbox(String(ticket._id));

        const [envelope, template, data] = mockEnqueueEmail.mock.calls[0];
        expect(envelope).toEqual({
            to: 'admin@example.com',
            subject: expect.stringContaining('Broken checkout'),
            replyTo: 'ada@example.com'
        });
        expect(template).toBe('tickets.contact');
        expect(data).toMatchObject({
            message: 'The cart total is wrong.',
            category: 'privacy',
            createdAt: ticket.createdAt?.toISOString()
        });
    });

    it('sends nothing when no fallback mailbox is configured', async () => {
        setEnvironment({ NODE_CONTACT_NOTIFY_EMAIL: undefined });
        const ticket = await ticketService.create(makePayload());

        await ticketService.mailFallbackMailbox(String(ticket._id));

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('sends nothing for a ticket that is gone', async () => {
        await ticketService.mailFallbackMailbox(MISSING_ID);

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('sends nothing for a ticket the system opened: only a visitor’s message has a Reply-To', async () => {
        const system = await ticketRepository.create({
            source: TicketSource.system,
            kind: TicketKind.manual_refund_owed,
            routeSet: 'PaymentRefunding',
            subject: 'A refund is owed by hand',
            message: 'Refund refund-1 needs a person.'
        });

        await ticketService.mailFallbackMailbox(String(system._id));

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('logs and swallows a mail that cannot be queued: the ticket is already stored', async () => {
        const ticket = await ticketService.create(makePayload());
        mockEnqueueEmail.mockRejectedValueOnce(new Error('queue down'));

        await expect(
            ticketService.mailFallbackMailbox(String(ticket._id))
        ).resolves.toBeUndefined();
    });
});

describe('create — honeypot', () => {
    it('announces the ticket when the honeypot is empty', async () => {
        await ticketService.create(makePayload());

        expect(opened).toHaveLength(1);
    });

    it('writes a suspected-spam submission as status "spam" and announces nothing', async () => {
        const ticket = await ticketService.create(
            makePayload({ website: 'https://spammer.example' })
        );

        expect(ticket.status).toBe(TicketStatus.spam);
        expect(opened).toEqual([]);
    });

    it('treats a whitespace-only honeypot as empty, same as a real client leaves it', async () => {
        const ticket = await ticketService.create(makePayload({ website: '   ' }));

        expect(ticket.status).toBe(TicketStatus.new);
        expect(opened).toHaveLength(1);
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
    it('is off by default — a known disposable domain is announced as normal', async () => {
        setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: undefined });

        const ticket = await ticketService.create(makePayload({ email: 'someone@mailinator.com' }));

        expect(ticket.status).toBe(TicketStatus.new);
        expect(opened).toHaveLength(1);
    });

    it('files a disposable-domain submission as spam, same as the honeypot, with a 201-shaped result', async () => {
        setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: 'disposable' });

        const ticket = await ticketService.create(makePayload({ email: 'someone@mailinator.com' }));

        // Filed and returned exactly like the honeypot catches a bot: no visible refusal that
        // would tell a spam script which signal caught it.
        expect(ticket.status).toBe(TicketStatus.spam);
        expect(opened).toEqual([]);
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
