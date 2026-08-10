/**
 * Feedback requests must never leak
 * `_id`/`__v`, on either response path — a real document (`toJSON`) or a `.lean()`
 * list result (mapped manually via `applyFeedbackRequestTransform`).
 */
import { Types } from 'mongoose';
import { setupTestDb } from '../../helpers/setup-test-db';
import { feedbackRequestRepository } from '@repositories/feedback-requests';
import * as feedbackRequestService from '@services/feedback-requests';

setupTestDb();

const createFeedback = () =>
    feedbackRequestRepository.create({
        email: 'reporter@example.com',
        subject: 'Something broke',
        message: 'Details about what broke.'
    });

describe('feedback request serialization', () => {
    it('normalizes a hydrated document via toJSON', async () => {
        const feedback = await createFeedback();
        const json = feedback.toJSON() as Record<string, unknown>;

        expect(json.id).toBe((feedback._id as Types.ObjectId).toString());
        expect(JSON.stringify(json)).not.toContain('_id');
        expect(JSON.stringify(json)).not.toContain('__v');
    });

    it('normalizes a lean list via feedbackRequestService.search', async () => {
        await createFeedback();
        const { items } = await feedbackRequestService.search({});

        expect(items).toHaveLength(1);
        const item = items[0] as unknown as Record<string, unknown>;
        expect(item.id).toMatch(/^[\da-f]{24}$/);
        expect(item._id).toBeUndefined();
        expect(item.__v).toBeUndefined();
    });
});
