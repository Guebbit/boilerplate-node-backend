/**
 * Both directions of one rule, proved by actually triggering every event rather than reading
 * source text for it: every event `webhooks/asyncapi.yaml` declares (and therefore
 * `asyncapi.public.yaml` publishes) has a real producer, and nothing this module's own subscriber
 * fans out ever names an event the catalogue does not declare.
 *
 * Driven from the domain-event bus, not HTTP: `subscribeToWebhookEvents` is wired, each underlying
 * domain event is emitted with a synthetic payload, and the `eventType` a delivery row was created
 * with is read back. If the SET of eventTypes this produces is exactly the catalogue's six names —
 * no more, no fewer — both directions hold at once.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { setupTestDb } from '@tests/setup-test-db';
import { resetDomainEvents, emitDomainEvent } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import { ORDER_CREATED, ORDER_STATUS_CHANGED, ORDER_CANCELLED } from '@modules/orders';
import { PAYMENT_SUCCEEDED, PAYMENT_FAILED } from '@modules/payments';
import {
    webhookSubscriptionRepository,
    webhookDeliveryRepository
} from '@modules/webhooks/repository';
import { mintRingSecret } from '@modules/webhooks/secrets';
import webhooksModule from '@modules/webhooks/module';

setupTestDb();

/** Every channel name `webhooks/asyncapi.yaml` declares — the catalogue `GET /webhooks/events` serves. */
const declaredCatalogue = (): string[] => {
    const document = parseYaml(
        readFileSync(
            path.join(__dirname, '..', '..', 'src', 'modules', 'webhooks', 'asyncapi.yaml'),
            'utf8'
        )
    ) as { channels?: Record<string, unknown> };
    return Object.keys(document.channels ?? {});
};

/** One subscription wanting every event (`'*'`), so any producer's fan-out reaches it. */
const createCatchAllSubscription = () => {
    const { entry } = mintRingSecret();
    return webhookSubscriptionRepository.create({
        tenant: 'shop',
        url: 'https://example.test/inbox',
        eventTypes: ['*'],
        enabled: true,
        consecutiveFailures: 0,
        secrets: [entry]
    });
};

describe('every public webhook event has exactly one producer, and no producer names an undeclared one', () => {
    beforeEach(() => {
        registerModules([webhooksModule]);
    });
    afterEach(() => {
        resetDomainEvents();
    });

    it('the six declared events are produced, and nothing else is', async () => {
        await createCatchAllSubscription();

        // The five domain-event emits `webhooks/services/publish.ts` subscribes to —
        // `order.paid`/`order.shipped` both derive from `ORDER_STATUS_CHANGED`, which is why five
        // emits produce six public event types.
        await emitDomainEvent(ORDER_CREATED, { orderId: 'order_1' });
        await emitDomainEvent(ORDER_STATUS_CHANGED, {
            orderId: 'order_1',
            from: 'pending',
            to: 'paid'
        });
        await emitDomainEvent(ORDER_STATUS_CHANGED, {
            orderId: 'order_1',
            from: 'paid',
            to: 'shipped'
        });
        await emitDomainEvent(ORDER_CANCELLED, { orderId: 'order_1', refund: true });
        await emitDomainEvent(PAYMENT_SUCCEEDED, { paymentId: 'payment_1', orderId: 'order_1' });
        await emitDomainEvent(PAYMENT_FAILED, { paymentId: 'payment_1', orderId: 'order_1' });

        const deliveries = await webhookDeliveryRepository.findAll({}, { limit: 100 });
        const produced = new Set(deliveries.map((delivery) => delivery.eventType));

        expect([...produced].toSorted()).toEqual(declaredCatalogue().toSorted());
    });

    it('the catalogue names exactly the six events the design doc fixes for v1 — no silent addition or removal', () => {
        expect(declaredCatalogue().toSorted()).toEqual(
            [
                'order.cancelled',
                'order.created',
                'order.paid',
                'order.shipped',
                'payment.failed',
                'payment.succeeded'
            ].toSorted()
        );
    });
});
