/**
 * @module
 * Journey: an integrator, start to finish.
 *
 * An admin mints a machine credential. The integrator uses it to subscribe a webhook endpoint to
 * everything. A customer then buys, fails a card, pays, receives, returns and cancels while the
 * delivery sweep runs after every step. The endpoint must receive each event once, signed, in the
 * order the shop caused them. Last, the credential is revoked and stops working.
 *
 * Replay is not walked here; the frontend's journeys walk it.
 */
import '@tests/contract';
import {
    CreateReturn201Response,
    DeliverShipment200Response,
    GetFulfillmentByOrder200Response,
    MintApiKey201Response,
    ShipFulfillmentOrder201Response,
    CreateWebhookSubscription201Response
} from '@api/schemas.zod';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, loginBearer } from '@tests/http';
import { bodyOf } from '@tests/body-of';
import { drain } from '@tests/drain';
import { startWebhookReceiver, type WebhookReceiver } from '@tests/webhook-receiver';
import { confirmCard, newShopper, openIntent, placeOrder } from '@tests/journey-orders';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';

setupTestDb();

let receiver: WebhookReceiver | undefined;

afterEach(async () => {
    await receiver?.stop();
    receiver = undefined;
});

/** A week from now, as a key's expiry. */
const inAWeek = () => new Date(Date.now() + 7 * 86_400_000).toISOString();

it('delivers every event once, signed, in causal order', async () => {
    const endpoint = await startWebhookReceiver();
    receiver = endpoint;
    const dogFood = await createProduct({ price: 20, onHand: 10 });
    const dogFoodId = String(dogFood._id);
    const { bearer: admin } = await authenticateAs('admin');

    // The admin hands the integrator a key, and the key creates the subscription.
    const minted = bodyOf(
        await api()
            .post('/api-keys')
            .set('Authorization', admin)
            .send({
                name: 'integrator',
                permissions: ['create:WebhookSubscription', 'read:WebhookSubscription'],
                expiresAt: inAWeek()
            }),
        MintApiKey201Response
    ).data;
    const key = `Bearer ${minted.secret}`;
    const { secret } = bodyOf(
        await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', key)
            .send({ url: `${endpoint.url}/hook`, eventTypes: ['*'] }),
        CreateWebhookSubscription201Response
    ).data;
    if (!secret) throw new Error('the subscription answered no signing secret');

    let seen = 0;
    /** The event types that reached the endpoint since the last call, in name order. */
    const arrivals = async () => {
        await drain('sweep:webhook-retries');
        const fresh = endpoint.received([secret]).slice(seen);
        seen += fresh.length;

        return fresh.map(({ type }) => type).toSorted();
    };

    // Order A: placed, a declined card, then a good one.
    const { bearer } = await newShopper();
    const order = await placeOrder(bearer, [{ productId: dogFoodId, quantity: 1 }]);
    const steps = [await arrivals()];
    const intent = await openIntent(bearer, order.id);
    await confirmCard(bearer, intent.id, 'pm_card_declined');
    steps.push(await arrivals());
    await confirmCard(bearer, intent.id);
    steps.push(await arrivals());

    // Shipped and delivered by staff.
    await api().post(`/delivery/order/${order.id}/start`).set('Authorization', admin).expect(200);
    const [fulfillmentOrder] = bodyOf(
        await api().get(`/delivery/order/${order.id}`).set('Authorization', admin),
        GetFulfillmentByOrder200Response
    ).data.fulfillmentOrders;
    const shipment = bodyOf(
        await api()
            .post(`/delivery/fulfillment-orders/${fulfillmentOrder.id}/shipments`)
            .set('Authorization', admin)
            .send({ trackingCode: 'TRK-INTEGRATOR1' }),
        ShipFulfillmentOrder201Response
    ).data;
    steps.push(await arrivals());
    bodyOf(
        await api().post(`/delivery/shipments/${shipment.id}/deliver`).set('Authorization', admin),
        DeliverShipment200Response
    );
    steps.push(await arrivals());

    // The customer returns all of it; staff receive it, and the refund follows.
    const returned = bodyOf(
        await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId: order.id, reason: 'withdrawal' }),
        CreateReturn201Response
    ).data;
    steps.push(await arrivals());
    await api().post(`/returns/${returned.id}/receive`).set('Authorization', admin).expect(200);
    steps.push(await arrivals());

    // Order B is placed, then cancelled before it is paid.
    const second = await placeOrder(bearer, [{ productId: dogFoodId, quantity: 1 }]);
    steps.push(await arrivals());
    await api()
        .post(`/orders/${second.id}/cancel`)
        .set('Authorization', bearer)
        .send({})
        .expect(200);
    steps.push(await arrivals());

    // Each step caused its own events, and nothing arrived out of turn or twice.
    expect(steps).toEqual([
        ['order.created'],
        ['payment.failed'],
        ['order.paid', 'payment.succeeded'],
        ['shipment.shipped'],
        ['shipment.delivered'],
        ['return.requested'],
        ['payment.refunded', 'return.closed', 'return.received'],
        ['order.created'],
        ['order.cancelled']
    ]);
    const everything = endpoint.received([secret]);
    expect(everything.every(({ signed }) => signed)).toBe(true);
    expect(new Set(everything.map(({ id }) => id)).size).toBe(everything.length);
    expect(new Set(everything.map(({ type }) => type)).size).toBe(11);

    // Revoking the key ends the integrator's access at once.
    await api().get('/webhooks/subscriptions').set('Authorization', key).expect(200);
    await api().delete(`/api-keys/${minted.id}`).set('Authorization', admin).expect(200);
    await api().get('/webhooks/subscriptions').set('Authorization', key).expect(401);
});

/** An admin who has minted a key that reads webhook subscriptions. */
const adminWithKey = async (n: number) => {
    const user = await createUser(
        {
            email: `minter${String(n)}@example.com`,
            username: `minter${String(n)}`,
            verifiedAt: new Date()
        },
        'admin'
    );
    const bearer = await loginBearer(user.email);
    const minted = bodyOf(
        await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({
                name: 'reader',
                permissions: ['read:WebhookSubscription'],
                expiresAt: inAWeek()
            }),
        MintApiKey201Response
    ).data;

    return { user, key: `Bearer ${minted.secret}` };
};

describe('a key follows its minter', () => {
    it('floors a demoted minter’s key and drops a banned minter’s', async () => {
        const { bearer: admin } = await authenticateAs('admin');
        const demoted = await adminWithKey(1);
        const banned = await adminWithKey(2);
        await api().get('/webhooks/subscriptions').set('Authorization', demoted.key).expect(200);
        await api().get('/webhooks/subscriptions').set('Authorization', banned.key).expect(200);

        // Demoted to a role that cannot read subscriptions, the key can no longer either; banned,
        // the key no longer resolves at all, so it is refused as a credential (401), not as a
        // caller who lacks the rule (403). Neither key was touched.
        await api()
            .patch(`/users/${demoted.user.id}`)
            .set('Authorization', admin)
            .send({ role: 'editor' })
            .expect(200);
        await api()
            .patch(`/users/${banned.user.id}`)
            .set('Authorization', admin)
            .send({ active: false })
            .expect(200);

        await api().get('/webhooks/subscriptions').set('Authorization', demoted.key).expect(403);
        await api().get('/webhooks/subscriptions').set('Authorization', banned.key).expect(401);
    });
});
