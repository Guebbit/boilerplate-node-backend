/**
 * Both directions of one rule, proved by actually triggering every event rather than reading
 * source text for it: every event `webhooks/asyncapi.yaml` declares (and therefore
 * `asyncapi.public.yaml` publishes) has a real producer, and nothing this module's own subscriber
 * fans out ever names an event the catalogue does not declare.
 *
 * Driven from the domain-event bus, not HTTP, and through the REAL registry indirection (DDD-D4):
 * `orders`, `payments` and `webhooks` are all registered for real, so `webhooks/module.ts`'s
 * `onRegistered` hook resolves `orders`'/`payments`' own `publicEvents` declarations off
 * `kernel/registry.ts` and wires the generic subscriber from them — nothing here hardcodes which
 * domain events fire which public ones. Each underlying domain event is then emitted with a
 * synthetic payload, and the `eventType` a delivery row was created with is read back. If the SET
 * of eventTypes this produces is exactly the catalogue's seven names — no more, no fewer — both
 * directions hold at once.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { setupTestDb } from '@tests/setup-test-db';
import { resetDomainEvents, emitDomainEvent } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import { ORDER_CREATED, ORDER_STATUS_CHANGED, ORDER_CANCELLED } from '@modules/orders';
import { PAYMENT_SUCCEEDED, PAYMENT_FAILED, PAYMENT_REFUNDED } from '@modules/payments';
import ordersModule from '@modules/orders/module';
import paymentsModule from '@modules/payments/module';
import {
    webhookSubscriptionRepository,
    webhookDeliveryRepository
} from '@modules/webhooks/repository';
import { mintRingSecret } from '@modules/webhooks/secrets';
import webhooksModule from '@modules/webhooks/module';

setupTestDb();

/** A syntactically valid Mongo id — `payments`' own `ORDER_CANCELLED` listener looks one up by it. */
const ORDER_ID = '507f1f77bcf86cd799439011';

/** Same shape, a different value — so a payment's `orderId` is never mistaken for the order's own id. */
const PAYMENT_ID = '507f1f77bcf86cd799439012';

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
        // `orders`/`payments` too, not just `webhooksModule` — their own `publicEvents` manifest
        // entries are what `webhooks/module.ts`'s `onRegistered` hook resolves and subscribes to;
        // registering `webhooksModule` alone would resolve an empty lookup and produce nothing.
        registerModules([ordersModule, paymentsModule, webhooksModule]);
    });
    afterEach(() => {
        resetDomainEvents();
    });

    it('the seven declared events are produced, and nothing else is', async () => {
        await createCatchAllSubscription();

        // The six domain-event emits the registered modules' `publicEvents` declarations project
        // from — `order.paid`/`order.shipped` both derive from `ORDER_STATUS_CHANGED`, which is
        // why six emits produce seven public event types.
        await emitDomainEvent(ORDER_CREATED, { orderId: ORDER_ID });
        await emitDomainEvent(ORDER_STATUS_CHANGED, {
            orderId: ORDER_ID,
            from: 'pending',
            to: 'paid'
        });
        await emitDomainEvent(ORDER_STATUS_CHANGED, {
            orderId: ORDER_ID,
            from: 'paid',
            to: 'shipped'
        });
        await emitDomainEvent(ORDER_CANCELLED, { orderId: ORDER_ID, refund: true });
        await emitDomainEvent(PAYMENT_SUCCEEDED, { paymentId: PAYMENT_ID, orderId: ORDER_ID });
        await emitDomainEvent(PAYMENT_FAILED, { paymentId: PAYMENT_ID, orderId: ORDER_ID });
        await emitDomainEvent(PAYMENT_REFUNDED, {
            paymentId: PAYMENT_ID,
            orderId: ORDER_ID,
            amount: 20,
            currency: 'EUR'
        });

        const deliveries = await webhookDeliveryRepository.findAll({}, { limit: 100 });
        const produced = new Set(deliveries.map((delivery) => delivery.eventType));

        expect([...produced].toSorted()).toEqual(declaredCatalogue().toSorted());
    });

    it('the catalogue names exactly the seven events the design doc fixes for v1 — no silent addition or removal', () => {
        expect(declaredCatalogue().toSorted()).toEqual(
            [
                'order.cancelled',
                'order.created',
                'order.paid',
                'order.shipped',
                'payment.failed',
                'payment.refunded',
                'payment.succeeded'
            ].toSorted()
        );
    });
});
