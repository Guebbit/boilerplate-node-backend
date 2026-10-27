/**
 * @module
 * The doors that move a ticket — resolve, mark as spam, reopen, assign, unassign, note — and the
 * staff badge. Pins the stamps each move owes (`closedAt`, `resolution`, `respondedAt`, the dedup
 * key), the 409 on every repeat, the reopen collision, the jurisdiction (an out-of-set ticket is a
 * 404), and the audit row each move writes.
 */

import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { observePort } from '@tests/ports';
import { callerContextAs } from '@tests/callers';
import { asReject, asSuccess } from '@tests/response';
import { createUser } from '@modules/users/tests/factories';
import { ticketService } from '@modules/tickets/service';
import { ticketRepository } from '@modules/tickets/repository';
import { ticketsAuditActions } from '@modules/tickets/audit';
import * as auditPort from '@infrastructure/observability/audit';
import type { TicketDocument } from '@modules/tickets/model';
import { TicketKind, TicketLinkType, TicketSource, TicketStatus } from '@types';

/* The audit port is replaced, not spied on — see `tests/support/ports.ts`. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

afterEach(() => jest.restoreAllMocks());

/** A member of staff holding every set. */
const admin = callerContextAs('admin', new Types.ObjectId().toString());

/** Support: reads and works contact messages, but is not in the refunds jurisdiction. */
const support = callerContextAs('support', new Types.ObjectId().toString());

/** A contact message, filed through the form. */
const fileContact = () =>
    ticketService.create({
        name: 'Ada',
        email: 'ada@example.com',
        subject: 'Broken checkout',
        message: 'The cart total is wrong.'
    });

/** An open system ticket about a refund, as the system opens one. */
const openRefundTicket = (link = 'refund-1') =>
    ticketRepository.create({
        source: TicketSource.system,
        kind: TicketKind.manual_refund_owed,
        routeSet: 'PaymentRefunding',
        subject: 'A refund is owed by hand',
        message: 'Refund refund-1 needs a person.',
        link: { type: TicketLinkType.refund, id: link },
        openKey: `manual_refund_owed:refund:${link}`,
        dueAt: new Date('2030-01-01T00:00:00Z')
    });

/** The ticket as storage holds it now. */
const stored = (id: unknown) => ticketRepository.findById(String(id)).then((found) => found!);

/** One field of the stored ticket. */
const storedField = <TKey extends keyof TicketDocument>(id: unknown, key: TKey) =>
    stored(id).then((row) => row[key]);

describe('resolve', () => {
    it('closes a new ticket as resolved by staff, stamping closedAt and respondedAt', async () => {
        const ticket = await fileContact();

        const result = await ticketService.resolve(String(ticket._id), admin);

        expect(asSuccess(result).data).toMatchObject({
            status: TicketStatus.resolved,
            resolution: 'staff'
        });
        const row = await stored(ticket._id);
        expect(row.closedAt).toBeInstanceOf(Date);
        expect(row.respondedAt).toBeInstanceOf(Date);
    });

    it('releases the dedup key of a linked ticket', async () => {
        const ticket = await openRefundTicket();

        await ticketService.resolve(String(ticket._id), admin);

        expect(await storedField(ticket._id, 'openKey')).toBeUndefined();
    });

    it('answers 409 TICKET_ALREADY_RESOLVED on a repeat and changes nothing', async () => {
        const ticket = await fileContact();
        await ticketService.resolve(String(ticket._id), admin);
        const { closedAt } = await stored(ticket._id);

        const again = asReject(await ticketService.resolve(String(ticket._id), admin));

        expect(again.status).toBe(409);
        expect(again.errors[0].code).toBe('TICKET_ALREADY_RESOLVED');
        expect(await storedField(ticket._id, 'closedAt')).toEqual(closedAt);
    });

    it('lets spam be resolved, keeping the time it was first closed', async () => {
        const ticket = await fileContact();
        await ticketService.markSpam(String(ticket._id), admin);
        const { closedAt } = await stored(ticket._id);

        const result = await ticketService.resolve(String(ticket._id), admin);

        expect(asSuccess(result).data.status).toBe(TicketStatus.resolved);
        expect(await storedField(ticket._id, 'closedAt')).toEqual(closedAt);
    });

    it('lets exactly one of two simultaneous clicks win', async () => {
        const ticket = await fileContact();

        const results = await Promise.all([
            ticketService.resolve(String(ticket._id), admin),
            ticketService.resolve(String(ticket._id), admin)
        ]);

        expect(results.filter((result) => result.success)).toHaveLength(1);
        const refused = asReject(results.find((result) => !result.success)!);
        expect(refused.status).toBe(409);
    });

    it('answers 404 for an id that does not exist', async () => {
        const result = await ticketService.resolve('000000000000000000000000', admin);

        expect(asReject(result).status).toBe(404);
    });
});

describe('markSpam', () => {
    it('turns a resolved ticket into spam without touching respondedAt', async () => {
        const ticket = await fileContact();
        await ticketService.resolve(String(ticket._id), admin);
        const { respondedAt } = await stored(ticket._id);

        const result = await ticketService.markSpam(String(ticket._id), admin);

        expect(asSuccess(result).data).toMatchObject({
            status: TicketStatus.spam,
            resolution: 'spam'
        });
        expect(await storedField(ticket._id, 'respondedAt')).toEqual(respondedAt);
    });

    it('answers 409 TICKET_ALREADY_SPAM on a repeat', async () => {
        const ticket = await fileContact();
        await ticketService.markSpam(String(ticket._id), admin);

        const again = asReject(await ticketService.markSpam(String(ticket._id), admin));

        expect(again.status).toBe(409);
        expect(again.errors[0].code).toBe('TICKET_ALREADY_SPAM');
    });
});

describe('reopen', () => {
    it('reopens an unassigned closed ticket as new, clearing the retention clock', async () => {
        const ticket = await fileContact();
        await ticketService.resolve(String(ticket._id), admin);

        const result = await ticketService.reopen(String(ticket._id), admin);

        expect(asSuccess(result).data.status).toBe(TicketStatus.new);
        const row = await stored(ticket._id);
        expect(row.closedAt).toBeUndefined();
        expect(row.resolution).toBeUndefined();
    });

    it('reopens an assigned ticket as in progress', async () => {
        const worker = await createUser({}, 'support');
        const ticket = await fileContact();
        await ticketService.assign(String(ticket._id), worker.id, admin);
        await ticketService.resolve(String(ticket._id), admin);

        const result = await ticketService.reopen(String(ticket._id), admin);

        expect(asSuccess(result).data.status).toBe(TicketStatus.in_progress);
    });

    it('restores the dedup key and keeps the deadline', async () => {
        const ticket = await openRefundTicket();
        const { dueAt } = ticket;
        await ticketService.resolve(String(ticket._id), admin);

        await ticketService.reopen(String(ticket._id), admin);

        const row = await stored(ticket._id);
        expect(row.openKey).toBe('manual_refund_owed:refund:refund-1');
        expect(row.dueAt).toEqual(dueAt);
    });

    it('answers 409 TICKET_ALREADY_OPEN for an open ticket', async () => {
        const ticket = await fileContact();

        const result = asReject(await ticketService.reopen(String(ticket._id), admin));

        expect(result.status).toBe(409);
        expect(result.errors[0].code).toBe('TICKET_ALREADY_OPEN');
    });

    it('answers 409 TICKET_SUPERSEDED, naming the newer ticket, when one holds the key', async () => {
        const older = await openRefundTicket();
        await ticketService.resolve(String(older._id), admin);
        const newer = await openRefundTicket();

        const result = asReject(await ticketService.reopen(String(older._id), admin));

        expect(result.status).toBe(409);
        expect(result.errors[0]).toMatchObject({
            code: 'TICKET_SUPERSEDED',
            details: { ticketId: String(newer._id) }
        });
        expect(await storedField(older._id, 'status')).toBe(TicketStatus.resolved);
    });
});

describe('jurisdiction', () => {
    it('hides a system ticket from a caller who does not hold its set', async () => {
        const ticket = await openRefundTicket();

        const read = await ticketService.getById(String(ticket._id), support);
        const move = await ticketService.resolve(String(ticket._id), support);

        expect(asReject(read).status).toBe(404);
        expect(asReject(move).status).toBe(404);
        expect(await storedField(ticket._id, 'status')).toBe(TicketStatus.new);
    });

    it('keeps system tickets out of the list of a caller outside the set, and shows them to an administrator', async () => {
        await openRefundTicket();
        await fileContact();

        const seenBySupport = await ticketService.search({}, support);
        const seenByAdmin = await ticketService.search({}, admin);

        expect(seenBySupport.items.map((row) => row.source)).toEqual(['visitor']);
        expect(seenByAdmin.items).toHaveLength(2);
    });

    it('lets support work a contact message', async () => {
        const ticket = await fileContact();

        const result = await ticketService.resolve(String(ticket._id), support);

        expect(result.success).toBe(true);
    });
});

describe('assign and unassign', () => {
    it('takes a new ticket into progress and names the assignee', async () => {
        const worker = await createUser({ username: 'sam' }, 'support');
        const ticket = await fileContact();

        const result = await ticketService.assign(String(ticket._id), worker.id, admin);

        expect(asSuccess(result).data).toMatchObject({
            status: TicketStatus.in_progress,
            assigneeId: worker.id
        });
        const read = asSuccess(await ticketService.getById(String(ticket._id), admin));
        expect(read.data.assigneeName).toBe('sam');
    });

    it('refuses a person who does not hold the ticket’s set with 422', async () => {
        const outsider = await createUser({}, 'support');
        const ticket = await openRefundTicket();

        const result = asReject(await ticketService.assign(String(ticket._id), outsider.id, admin));

        expect(result.status).toBe(422);
        expect(result.errors[0].code).toBe('TICKET_ASSIGNEE_INVALID');
    });

    it('refuses a person who does not exist with 422', async () => {
        const ticket = await fileContact();

        const result = asReject(
            await ticketService.assign(String(ticket._id), '000000000000000000000000', admin)
        );

        expect(result.status).toBe(422);
    });

    it('refuses to assign a closed ticket with 409 TICKET_NOT_OPEN', async () => {
        const worker = await createUser({}, 'support');
        const ticket = await fileContact();
        await ticketService.resolve(String(ticket._id), admin);

        const result = asReject(await ticketService.assign(String(ticket._id), worker.id, admin));

        expect(result.status).toBe(409);
        expect(result.errors[0].code).toBe('TICKET_NOT_OPEN');
    });

    it('gives a ticket back: the assignee goes and an in-progress ticket is new again', async () => {
        const worker = await createUser({}, 'support');
        const ticket = await fileContact();
        await ticketService.assign(String(ticket._id), worker.id, admin);

        const result = await ticketService.unassign(String(ticket._id), admin);

        const wire = asSuccess(result).data;
        expect(wire.status).toBe(TicketStatus.new);
        expect(wire.assigneeId).toBeUndefined();
    });
});

describe('notes', () => {
    it('appends a note with its author and time, even to a closed ticket', async () => {
        const ticket = await fileContact();
        await ticketService.resolve(String(ticket._id), admin);

        const result = await ticketService.addNote(String(ticket._id), '  Called back.  ', admin);

        const { notes } = asSuccess(result).data;
        expect(notes).toHaveLength(1);
        expect(notes[0]).toMatchObject({ body: 'Called back.', authorId: admin.caller.id });
        expect(Date.parse(notes[0].at)).not.toBeNaN();
    });

    it('keeps the thread append-only: a second note does not replace the first', async () => {
        const ticket = await fileContact();
        await ticketService.addNote(String(ticket._id), 'one', admin);

        const result = await ticketService.addNote(String(ticket._id), 'two', admin);

        expect(asSuccess(result).data.notes.map((note) => note.body)).toEqual(['one', 'two']);
    });
});

describe('summary', () => {
    it('counts open, mine, overdue and unassigned inside the caller’s jurisdiction', async () => {
        const worker = await createUser({}, 'support');
        const taken = await fileContact();
        await ticketService.assign(String(taken._id), worker.id, admin);
        await fileContact();
        const done = await fileContact();
        await ticketService.resolve(String(done._id), admin);
        await openRefundTicket();

        const adminView = await ticketService.summary(admin);
        const supportView = await ticketService.summary(support);

        expect(adminView).toEqual({ open: 3, mine: 0, overdue: 0, unassigned: 2 });
        expect(supportView).toEqual({ open: 2, mine: 0, overdue: 0, unassigned: 1 });
    });

    it('counts a ticket past its due date as overdue', async () => {
        const ticket = await fileContact();
        await ticketRepository.save(Object.assign(ticket, { dueAt: new Date(Date.now() - 1000) }));

        const view = await ticketService.summary(admin);

        expect(view.overdue).toBe(1);
    });
});

describe('the audit trail', () => {
    it('records the move by value: from and to', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const ticket = await fileContact();

        await ticketService.resolve(String(ticket._id), admin);

        const row = auditSpy.mock.calls
            .map(([entry]) => entry)
            .find((entry) => entry.action === ticketsAuditActions.ADMIN_TICKET_RESOLVED);
        expect(row).toMatchObject({
            targetType: 'ticket',
            targetId: String(ticket._id),
            metadata: { from: TicketStatus.new, to: TicketStatus.resolved }
        });
    });

    it('writes no row for a refused move', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const ticket = await fileContact();

        await ticketService.reopen(String(ticket._id), admin);

        expect(auditSpy).not.toHaveBeenCalled();
    });
});
