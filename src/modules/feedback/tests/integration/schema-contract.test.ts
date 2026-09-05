/**
 * @module
 * Schema contract tests — what the Mongoose schema itself declares, not the transforms covered
 * by sibling specs: defaults, `required` fields, and `select: false` on credentials.
 *
 * Runs against real Mongo, since these are Mongoose's behaviours rather than ours — a mocked
 * model would only assert the mock's opinion of what `default` means.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { feedbackRequestRepository } from '@modules/feedback/repository';

setupTestDb();

describe('feedback request schema', () => {
    const payload = {
        email: 'ada@example.com',
        subject: 'Subject',
        message: 'Message'
    };

    it('serialises to id, never _id or __v', async () => {
        const feedback = await feedbackRequestRepository.create(payload as never);

        const serialized = feedback.toJSON() as Record<string, unknown>;

        expect(serialized.id).toBe(String(feedback._id));
        expect(serialized).not.toHaveProperty('_id');
        expect(serialized).not.toHaveProperty('__v');
    });
});
