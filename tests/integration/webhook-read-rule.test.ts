/**
 * @module
 * Over HTTP, through the real app: an API key holding only the webhook rules cannot open a stream
 * of events whose read rule it lacks, and the catalogue says so beforehand (`actions.subscribe`).
 */
import '@tests/contract';
import { CreateApiKey201Response, ListWebhookEvents200Response } from '@api/schemas.zod';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { bodyOf } from '@tests/body-of';
import { createUser } from '@modules/users/tests/factories';

setupTestDb();

/** A week from now, as a key's expiry. */
const inAWeek = () => new Date(Date.now() + 7 * 86_400_000).toISOString();

/** A key holding the webhook rules and nothing that reads accounts. */
const webhookOnlyKey = async (): Promise<string> => {
    await createUser({ email: 'minter@example.com' });
    const { bearer: admin } = await authenticateAs('admin');
    const minted = bodyOf(
        await api()
            .post('/api-keys')
            .set('Authorization', admin)
            .send({
                name: 'webhook-only',
                permissions: ['create:WebhookSubscription', 'read:WebhookSubscription'],
                expiresAt: inAWeek()
            }),
        CreateApiKey201Response
    );
    return `Bearer ${minted.secret}`;
};

describe('a key holding only the webhook rules', () => {
    it('is refused a user.updated subscription, naming the event', async () => {
        const key = await webhookOnlyKey();

        const response = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', key)
            .send({ url: 'https://hooks.example.com/a', eventTypes: ['user.updated'] });

        expect(response.status).toBe(403);
        expect(response.body.errors[0]).toMatchObject({ code: 'WEBHOOK_EVENT_READ_REQUIRED' });
        expect(response.body.errors[0].message).toContain('user.updated');
    });

    it('sees in the catalogue which events it may not subscribe to', async () => {
        const key = await webhookOnlyKey();

        const catalogue = bodyOf(
            await api().get('/webhooks/events').set('Authorization', key),
            ListWebhookEvents200Response
        );

        const flags = Object.fromEntries(
            catalogue.items.map((event) => [event.name, event.actions.subscribe])
        );
        expect(flags['user.updated']).toBe(false);
        // A public event (`example.published`) carries no read rule: a per-event rule, not a blanket one.
        expect(flags['example.published']).toBe(true);
    });
});
