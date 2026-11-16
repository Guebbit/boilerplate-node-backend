/**
 * @module
 * An `Idempotency-Key` is scoped to its caller: the same key sent by someone else is a fresh run,
 * never a replay of the first caller's stored answer.
 *
 * Driven through `POST /tasks` with signed-in callers. Supertest sends every request from one IP,
 * so two anonymous callers could not be told apart; an account id is the caller that can.
 *
 * @see docs/understand/idempotency.md#how-it-works
 */
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { taskRepository } from '@modules/tasks/repository';
import { idempotencyRecordModel } from '@infrastructure/http/middlewares/idempotency-model';

setupTestDb();

/** The same body every caller sends, so only the caller can differ between requests. */
const PAYLOAD = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Broken checkout',
    message: 'The checkout button does nothing on mobile.'
};

/** The key every caller reuses. */
const KEY = 'shared-key-1';

describe('Idempotency-Key — scoped per caller', () => {
    it('runs a second signed-in caller fresh, though the key and the body are identical', async () => {
        const alice = await authenticateAs('user');
        const bob = await authenticateAs('admin');

        const first = await api()
            .post('/tasks')
            .set('Authorization', alice.bearer)
            .set('Idempotency-Key', KEY)
            .send(PAYLOAD);
        const second = await api()
            .post('/tasks')
            .set('Authorization', bob.bearer)
            .set('Idempotency-Key', KEY)
            .send(PAYLOAD);

        expect(first.status).toBe(202);
        expect(second.status).toBe(202);
        expect(second.headers['idempotent-replayed']).toBeUndefined();
        expect(await taskRepository.count({})).toBe(2);
        expect(await idempotencyRecordModel.countDocuments({ key: KEY })).toBe(2);
    });

    it('runs an anonymous caller fresh against a signed-in caller who used the key first', async () => {
        const alice = await authenticateAs('user');

        await api()
            .post('/tasks')
            .set('Authorization', alice.bearer)
            .set('Idempotency-Key', KEY)
            .send(PAYLOAD);
        const anonymous = await api().post('/tasks').set('Idempotency-Key', KEY).send(PAYLOAD);

        expect(anonymous.status).toBe(202);
        expect(anonymous.headers['idempotent-replayed']).toBeUndefined();
        expect(await idempotencyRecordModel.countDocuments({ key: KEY })).toBe(2);
    });
});
