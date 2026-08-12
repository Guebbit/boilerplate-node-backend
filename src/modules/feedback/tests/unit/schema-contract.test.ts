/**
 * Schema contract — the declarations themselves, not the transforms.
 *
 * The sibling specs in this folder cover behaviour; this covers what the SCHEMA says, which is
 * equally part of the API and is not exercised anywhere else:
 *
 *   **Defaults** decide what a client gets for a field it never sent. A row created without a
 *   flag is visible or invisible depending on one word in the schema, and nothing else pins which.
 *
 *   **`required`** is the only thing standing between a malformed write and a persisted row that
 *   later breaks every reader. Asserted per field, since each is an independent one-line flag.
 *
 *   **`select: false`** on credentials is why they do not leak from an ordinary read.
 *
 * Real Mongo, because these are Mongoose's behaviours rather than ours: a mocked model would
 * assert the mock's opinion of what `default` means.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { feedbackRequestRepository } from '@modules/feedback';
import { FeedbackRequestStatus } from '@types';

setupTestDb();

describe('feedback request schema', () => {
    const payload = {
        email: 'ada@example.com',
        subject: 'Subject',
        message: 'Message'
    };

    it('defaults a new request to the "new" status', async () => {
        const feedback = await feedbackRequestRepository.create(payload as never);

        expect(feedback.status).toBe(FeedbackRequestStatus.new);
    });

    it('requires email, subject and message', async () => {
        await expect(
            feedbackRequestRepository.create({ subject: 'S', message: 'M' } as never)
        ).rejects.toThrow();
        await expect(
            feedbackRequestRepository.create({ email: 'a@b.c', message: 'M' } as never)
        ).rejects.toThrow();
        await expect(
            feedbackRequestRepository.create({ email: 'a@b.c', subject: 'S' } as never)
        ).rejects.toThrow();
    });

    it('treats name as optional', async () => {
        const feedback = await feedbackRequestRepository.create(payload as never);

        expect(feedback.name).toBeUndefined();
    });

    it('rejects a status outside the declared enum', async () => {
        // The enum mirrors openapi.yaml. A value outside it would satisfy no client's union
        // type and would be undetectable until something tried to render it.
        await expect(
            feedbackRequestRepository.create({ ...payload, status: 'NOT_A_STATUS' } as never)
        ).rejects.toThrow();
    });

    it('accepts every status the enum declares', async () => {
        for (const status of Object.values(FeedbackRequestStatus)) {
            const feedback = await feedbackRequestRepository.create({
                ...payload,
                status
            } as never);
            expect(feedback.status).toBe(status);
        }
    });

    it('serialises to id, never _id or __v', async () => {
        const feedback = await feedbackRequestRepository.create(payload as never);

        const serialized = feedback.toJSON() as Record<string, unknown>;

        expect(serialized.id).toBe(String(feedback._id));
        expect(serialized).not.toHaveProperty('_id');
        expect(serialized).not.toHaveProperty('__v');
    });
});
