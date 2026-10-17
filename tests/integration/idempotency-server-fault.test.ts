/**
 * What an `Idempotency-Key` does after the handler FAULTS (a 500), driven through the simplest
 * opted-in route, `POST /feedback/contact`.
 *
 * The middleware stores every finished attempt, a server fault included, and replays it for the
 * retention window. So a retry under the SAME key re-sends the failure without running the handler
 * again; only a NEW key runs it. That is Stripe's v1 rule, and it is why the frontend spends a key
 * on any answer but a lost connection or `409 IDEMPOTENCY_IN_FLIGHT`.
 *
 * See: docs/tools/idempotency.md#what-a-failure-stores
 */
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { feedbackRequestRepository } from '@modules/feedback/repository';
import { idempotencyRecordModel } from '@infrastructure/http/middlewares/idempotency-model';

setupTestDb();

/** A valid contact message; the route accepts it from a visitor with no account. */
const PAYLOAD = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Broken checkout',
    message: 'The checkout button does nothing on mobile.'
};

/** Sends the message under a key. */
const send = (key: string) =>
    api().post('/feedback/contact').set('Idempotency-Key', key).send(PAYLOAD);

afterEach(() => {
    jest.restoreAllMocks();
});

describe('Idempotency-Key — a handler that faulted', () => {
    it('stores the 500 and replays it for the same key, without running the handler again', async () => {
        const create = jest
            .spyOn(feedbackRequestRepository, 'create')
            .mockRejectedValueOnce(new Error('the database went away'));

        const first = await send('fault-key-1');
        expect(first.status).toBe(500);
        expect(create).toHaveBeenCalledTimes(1);

        const retry = await send('fault-key-1');
        expect(retry.status).toBe(500);
        expect(retry.headers['idempotent-replay']).toBe('true');
        // The handler did not run for the retry: the repository was reached once, by the first attempt.
        expect(create).toHaveBeenCalledTimes(1);
        expect(await idempotencyRecordModel.countDocuments({})).toBe(1);
    });

    it('runs the handler again under a NEW key, and the write lands once', async () => {
        jest.spyOn(feedbackRequestRepository, 'create').mockRejectedValueOnce(
            new Error('the database went away')
        );

        const faulted = await send('fault-key-2');
        expect(faulted.status).toBe(500);

        const fresh = await send('fault-key-3');
        expect(fresh.status).toBe(201);
        expect(await feedbackRequestRepository.count({})).toBe(1);
    });
});
