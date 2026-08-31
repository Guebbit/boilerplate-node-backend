/**
 * @module
 * The feedback-request schema's contract. A contact form is the one place a stranger writes to
 * the database, so what it requires is a decision about who can reach operators at all. The line
 * drawn: "we must be able to reply, and know what about" — email, subject, message required, name
 * optional, since reporting a problem doesn't obligate saying who you are.
 */
import { feedbackRequestSchema } from '@modules/feedback/model';
import { FeedbackRequestStatus } from '@types';
import {
    defaultOf,
    enumOf,
    indexOptionSpecs,
    indexSpecs,
    optionsOf,
    requiredPaths
} from '@tests/schema';

/** The retention window the schema was built with, in seconds. Mirrors the model's own default. */
const RETENTION_SECONDS = Number(process.env.NODE_FEEDBACK_RETENTION_DAYS ?? 730) * 24 * 60 * 60;

describe('feedbackRequestSchema', () => {
    it('requires an address to reply to, a subject and a message', () => {
        expect(requiredPaths(feedbackRequestSchema)).toEqual(['email', 'message', 'subject']);
    });

    it('leaves the name optional', () => {
        // Deliberate: someone reporting a problem is not obliged to identify themselves, and a
        // required name is answered with a fake one rather than a real one.
        expect(requiredPaths(feedbackRequestSchema)).not.toContain('name');
    });

    it('leaves the operator-side fields absent until an operator fills them', () => {
        // `adminNotes` and `respondedAt` are written by the answer, not by the submission. A
        // `default` on `respondedAt` would mark every incoming message as already answered.
        expect(defaultOf(feedbackRequestSchema, 'respondedAt')).toBeUndefined();
        expect(defaultOf(feedbackRequestSchema, 'adminNotes')).toBeUndefined();
    });

    it('restricts status to the contract enum and starts every request new', () => {
        expect(enumOf(feedbackRequestSchema, 'status')).toEqual(
            Object.values(FeedbackRequestStatus)
        );
        expect(defaultOf(feedbackRequestSchema, 'status')).toBe(FeedbackRequestStatus.new);
    });

    it('indexes the operator queue and the retention sweep', () => {
        // The queue — "what is still open, most recent first" — plus the TTL index below.
        expect(indexSpecs(feedbackRequestSchema)).toEqual([
            'createdAt_1: createdAt+1',
            'status_1_createdAt_-1: status+1, createdAt-1'
        ]);
    });

    it('keeps timestamps, which the queue is ordered by', () => {
        expect(optionsOf(feedbackRequestSchema).timestamps).toBe(true);
    });

    it('expires tickets at the configured retention window, and only those', () => {
        // Asserted against the configured window rather than a literal, so changing
        // `NODE_FEEDBACK_RETENTION_DAYS` moves the policy and the test together — and so a TTL
        // appearing on a different index fails here.
        expect(indexOptionSpecs(feedbackRequestSchema)).toEqual([
            `createdAt_1: expireAfterSeconds=${RETENTION_SECONDS}`,
            'status_1_createdAt_-1: (none)'
        ]);
    });

    it('expires ascending by createdAt, which is the direction a TTL index needs', () => {
        // Mongo only honours `expireAfterSeconds` on a single-field ascending index. The same
        // field appears descending in the compound queue index above; getting these confused
        // produces an index that silently never deletes anything.
        expect(indexSpecs(feedbackRequestSchema)).toContain('createdAt_1: createdAt+1');
    });
});
