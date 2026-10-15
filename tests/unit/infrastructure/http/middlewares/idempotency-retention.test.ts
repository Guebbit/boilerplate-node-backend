/**
 * @module
 * How long the idempotency ledger remembers a key: the TTL index's window, the number a client
 * relies on when it retries a request a day later and expects a replay, not a second write.
 */

import { idempotencyRecordModel } from '@infrastructure/http/middlewares/idempotency-model';

describe('the idempotency ledger retention', () => {
    it('remembers a key for 24 hours by default', () => {
        const ttl = idempotencyRecordModel.schema
            .indexes()
            .find(([, index]) => index.expireAfterSeconds !== undefined);

        expect(ttl?.[1].expireAfterSeconds).toBe(24 * 60 * 60);
    });
});
