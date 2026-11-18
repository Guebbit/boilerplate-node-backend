/**
 * @module
 * `payment_webhook_dropped_total`: a signed delivery the app cannot read is counted, and a bad
 * signature is not (it has its own alert).
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { signWebhookPayload, WEBHOOK_SIGNATURE_HEADER } from '../../providers';
import { paymentWebhookDroppedTotal } from '../../metrics';

setupTestDb();

/**
 * Current value of the `unreadable` series.
 * @returns the counter's value
 */
const dropped = (): Promise<number> =>
    paymentWebhookDroppedTotal
        .get()
        .then(
            ({ values }) => values.find((value) => value.labels.reason === 'unreadable')?.value ?? 0
        );

/**
 * Posts `body` to the fake provider's webhook with the given signature header value.
 * @param body - raw request body
 * @param signature - value of the signature header
 */
const deliver = (body: string, signature: string) =>
    api()
        .post('/payments/webhook/fake')
        .set('Content-Type', 'application/json')
        .set(WEBHOOK_SIGNATURE_HEADER, signature)
        .send(body);

describe('a signed webhook the app cannot read', () => {
    it('counts a body that fails the event schema', async () => {
        const before = await dropped();
        const body = JSON.stringify({
            id: 'evt_1',
            providerRef: { $ne: null },
            status: 'succeeded'
        });

        const response = await deliver(body, signWebhookPayload(body));

        expect(response.status).toBe(400);
        expect(await dropped()).toBe(before + 1);
    });

    it('leaves a bad signature to its own alert', async () => {
        const before = await dropped();

        const response = await deliver('{}', signWebhookPayload('something else'));

        expect(response.status).toBe(400);
        expect(await dropped()).toBe(before);
    });
});
