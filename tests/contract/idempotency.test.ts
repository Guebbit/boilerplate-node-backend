/**
 * @module
 * Real-database behaviour of the `Idempotency-Key` middleware, driven through
 * `POST /feedback/contact` — the simplest opted-in route, public and single-field enough that a
 * test does not have to fight auth to reach it.
 * `tests/unit/infrastructure/http/middlewares/idempotency.test.ts` covers the pure fingerprinting
 * logic; this is the three-way branch on a real collision.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { idempotencyRecordModel } from '@infrastructure/http/middlewares/idempotency-model';

setupTestDb();

const PAYLOAD = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Broken checkout',
    message: 'The checkout button does nothing on mobile.'
};

describe('Idempotency-Key — POST /feedback/contact', () => {
    it('replays the first response verbatim for a repeat of the same key and body', async () => {
        const first = await api()
            .post('/feedback/contact')
            .set('Idempotency-Key', 'replay-key-1')
            .send(PAYLOAD);

        expect(first.status).toBe(201);
        expect(first).toSatisfyApiSpec();

        const second = await api()
            .post('/feedback/contact')
            .set('Idempotency-Key', 'replay-key-1')
            .send(PAYLOAD);

        expect(second.status).toBe(201);
        expect(second.headers['idempotent-replay']).toBe('true');
        expect(second.body).toEqual(first.body);

        // One ledger row, and — the point of the whole feature — one feedback request, not two.
        expect(await idempotencyRecordModel.countDocuments({})).toBe(1);
    });

    it('answers 422 when the same key is reused with a different body', async () => {
        await api().post('/feedback/contact').set('Idempotency-Key', 'reuse-key-1').send(PAYLOAD);

        const response = await api()
            .post('/feedback/contact')
            .set('Idempotency-Key', 'reuse-key-1')
            .send({ ...PAYLOAD, subject: 'A completely different subject' });

        expect(response.status).toBe(422);
        expect(response.body.errors[0].code).toBe('IDEMPOTENCY_KEY_MISMATCH');
        expect(response).toSatisfyApiSpec();
    });

    it('answers 409 while a request with the same key is still in flight', async () => {
        await api()
            .post('/feedback/contact')
            .set('Idempotency-Key', 'in-flight-key-1')
            .send(PAYLOAD);

        // The first request already finished (state 'done'). Forcing it back to 'in-flight'
        // simulates a second request racing the first rather than following it — the one branch
        // an end-to-end HTTP test cannot otherwise reach without two real concurrent sockets.
        await idempotencyRecordModel.updateOne(
            { key: 'in-flight-key-1' },
            { $set: { state: 'in-flight' } }
        );

        const response = await api()
            .post('/feedback/contact')
            .set('Idempotency-Key', 'in-flight-key-1')
            .send(PAYLOAD);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('IDEMPOTENCY_IN_FLIGHT');
        expect(response).toSatisfyApiSpec();
    });

    it('rejects a malformed key before writing to the ledger', async () => {
        const response = await api()
            .post('/feedback/contact')
            .set('Idempotency-Key', 'has a space')
            .send(PAYLOAD);

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
        expect(await idempotencyRecordModel.countDocuments({})).toBe(0);
    });

    it('runs normally, with no ledger row at all, when no key is sent', async () => {
        const response = await api().post('/feedback/contact').send(PAYLOAD);

        expect(response.status).toBe(201);
        expect(await idempotencyRecordModel.countDocuments({})).toBe(0);
    });
});
