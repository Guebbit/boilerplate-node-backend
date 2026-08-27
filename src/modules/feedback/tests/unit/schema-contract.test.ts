/**
 * The feedback-request schema's contract.
 *
 * A contact form is the one place a stranger writes to the database, so what it requires is a
 * decision about who can reach the operators at all: too much and a visitor with a genuine
 * problem gives up, too little and the queue fills with unanswerable rows. The line drawn here is
 * "we must be able to reply, and know what about" — email, subject, message — with the name left
 * optional because someone reporting a problem is not obliged to say who they are.
 */
import { feedbackRequestSchema } from '@modules/feedback/model';
import { FeedbackRequestStatus } from '@types';
import { defaultOf, enumOf, indexSpecs, optionsOf, requiredPaths } from '@tests/schema';

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

    it('indexes the operator queue: by status, newest first', () => {
        // The only query this collection serves — "what is still open, most recent first". The
        // `-1` is what keeps that from sorting the whole match in memory.
        expect(indexSpecs(feedbackRequestSchema)).toEqual([
            'status_1_createdAt_-1: status+1, createdAt-1'
        ]);
    });

    it('keeps timestamps, which the queue is ordered by', () => {
        expect(optionsOf(feedbackRequestSchema).timestamps).toBe(true);
    });
});
