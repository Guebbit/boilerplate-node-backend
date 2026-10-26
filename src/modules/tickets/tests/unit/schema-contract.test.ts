/**
 * @module
 * The ticket schema's contract. A contact form is the one place a stranger writes to
 * the database, so what it requires is a decision about who can reach operators at all. The line
 * drawn: "we must be able to reply, and know what about" — email, subject, message required, name
 * optional, since reporting a problem doesn't obligate saying who you are.
 */
import { ticketSchema } from '@modules/tickets/model';
import { TicketStatus } from '@types';
import {
    defaultOf,
    enumOf,
    indexOptionSpecs,
    indexSpecs,
    optionsOf,
    requiredPaths
} from '@tests/schema';
import { currentEnvironment } from '@infrastructure/config/store';

/** The retention window the schema was built with, in seconds. Mirrors the model's own default. */
const RETENTION_SECONDS =
    Number(currentEnvironment().NODE_TICKETS_RETENTION_DAYS ?? 730) * 24 * 60 * 60;

describe('ticketSchema', () => {
    it('requires an address to reply to, a subject and a message', () => {
        expect(requiredPaths(ticketSchema)).toEqual(['email', 'message', 'subject']);
    });

    it('leaves the name optional', () => {
        // Deliberate: someone reporting a problem is not obliged to identify themselves, and a
        // required name is answered with a fake one rather than a real one.
        expect(requiredPaths(ticketSchema)).not.toContain('name');
    });

    it('leaves the operator-side fields absent until an operator fills them', () => {
        // `adminNotes` and `respondedAt` are written by the answer, not by the submission. A
        // `default` on `respondedAt` would mark every incoming message as already answered.
        expect(defaultOf(ticketSchema, 'respondedAt')).toBeUndefined();
        expect(defaultOf(ticketSchema, 'adminNotes')).toBeUndefined();
    });

    it('restricts status to the contract enum and starts every request new', () => {
        expect(enumOf(ticketSchema, 'status')).toEqual(Object.values(TicketStatus));
        expect(defaultOf(ticketSchema, 'status')).toBe(TicketStatus.new);
    });

    it('indexes the operator queue and the retention sweep', () => {
        // The queue — "what is still open, most recent first" — plus the TTL index below.
        expect(indexSpecs(ticketSchema)).toEqual([
            'createdAt_1: createdAt+1',
            'email_1: email+1',
            'status_1_createdAt_-1: status+1, createdAt-1',
            'subjectId_1: subjectId+1'
        ]);
    });

    it('keeps timestamps, which the queue is ordered by', () => {
        expect(optionsOf(ticketSchema).timestamps).toBe(true);
    });

    it('expires tickets at the configured retention window, and only those', () => {
        // Asserted against the configured window rather than a literal, so changing
        // `NODE_TICKETS_RETENTION_DAYS` moves the policy and the test together — and so a TTL
        // appearing on a different index fails here.
        expect(indexOptionSpecs(ticketSchema)).toEqual([
            `createdAt_1: expireAfterSeconds=${RETENTION_SECONDS}`,
            'email_1: (none)',
            'status_1_createdAt_-1: (none)',
            'subjectId_1: partialFilterExpression={"subjectId":{"$exists":true}}'
        ]);
    });

    it('expires ascending by createdAt, which is the direction a TTL index needs', () => {
        // Mongo only honours `expireAfterSeconds` on a single-field ascending index. The same
        // field appears descending in the compound queue index above; getting these confused
        // produces an index that silently never deletes anything.
        expect(indexSpecs(ticketSchema)).toContain('createdAt_1: createdAt+1');
    });
});
