/**
 * The delivery pipeline end to end, against a real database and a real local HTTPS listener this
 * suite starts and stops itself (`tests/support/https-test-server.ts`) — never the compose
 * `webhook-tester` service. Covers what `docs/modules/webhooks.md`'s integration section promises:
 * a delivery arrives signed, a 500 produces a retry, sustained failure auto-disables the
 * subscription, replay re-sends, and the delivery log records what happened at every step.
 *
 * The SSRF guard is mocked here on purpose: it has its own dedicated table in
 * `tests/fuzz/webhook-ssrf.fuzz.test.ts`, and a real local listener is inherently on loopback,
 * which the guard correctly always refuses. Everything else in the pipeline — signing, the actual
 * TLS request, retry scheduling, auto-disable, replay — runs for real.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { startHttpsTestServer, TEST_CA_CERT, type HttpsTestServer } from '@tests/https-test-server';
import {
    webhookSubscriptionRepository,
    webhookDeliveryRepository
} from '@modules/webhooks/repository';
import { processDeliveryJob } from '@modules/webhooks/services';
import { replay as replayDelivery } from '@modules/webhooks/services/deliveries';
import { mintRingSecret, activeRingSecrets } from '@modules/webhooks/secrets';
import { verifyWebhookSignature } from '@infrastructure/adapters/webhook-signing';
import { WEBHOOK_MAX_ATTEMPTS, WEBHOOK_MAX_CONSECUTIVE_FAILURES } from '@modules/webhooks/domain';
import type { WebhookDeliverJobPayload } from '@types';
import type { WebhookSubscriptionDocument } from '@modules/webhooks/model';
import { callerAs, TEST_TENANT_ID } from '@tests/callers';

// The real `node:https`, with this suite's own throwaway CA injected into every request — see
// `https-test-server.ts`'s own doc for why `NODE_TLS_REJECT_UNAUTHORIZED` does NOT work here.
jest.mock('node:https', () => {
    const actual = jest.requireActual('node:https');
    return {
        ...actual,
        request: (options: object, callback: unknown) =>
            actual.request({ ...options, ca: [TEST_CA_CERT] }, callback)
    };
});

// The other mock this suite needs: a local test server is on 127.0.0.1, which the real guard
// refuses (correctly — see the module docblock). Everything else about the guard's contract
// (HTTPS-only, the pinned `lookup`) is preserved so the real TLS connection still goes through it.
jest.mock('@infrastructure/adapters/ssrf-guard', () => {
    const actual = jest.requireActual('@infrastructure/adapters/ssrf-guard');
    return {
        ...actual,
        resolveSafeWebhookTarget: (rawUrl: string) => {
            const parsed = new URL(rawUrl);
            return Promise.resolve({
                hostname: parsed.hostname,
                resolvedAddress: parsed.hostname,
                lookup: (
                    _hostname: string,
                    options: { all?: boolean },
                    callback: (error: null, ...args: never[]) => void
                ) =>
                    options.all
                        ? callback(null, [{ address: parsed.hostname, family: 4 }] as never)
                        : callback(null, parsed.hostname as never, 4 as never)
            });
        }
    };
});

setupTestDb();

const context = { caller: callerAs('manager'), analyticsConsent: false };

/** A subscription document with one ring secret, saved for real. */
const createSubscription = (
    url: string,
    eventTypes: string[] = ['*']
): Promise<WebhookSubscriptionDocument> => {
    const { entry } = mintRingSecret();

    return webhookSubscriptionRepository.create({
        tenant: TEST_TENANT_ID,
        url,
        eventTypes,
        enabled: true,
        consecutiveFailures: 0,
        secrets: [entry]
    });
};

/** A `pending`, attempt-1 delivery row plus the job payload `processDeliveryJob` expects for it. */
const createPendingDelivery = (
    subscription: WebhookSubscriptionDocument,
    eventType = 'order.paid'
): Promise<WebhookDeliverJobPayload> =>
    webhookDeliveryRepository
        .create({
            tenant: TEST_TENANT_ID,
            subscriptionId: subscription._id,
            eventId: `evt_${String(subscription._id)}_${eventType}`,
            eventType,
            payload: { orderId: 'order_1' },
            attempt: 1,
            status: 'pending',
            nextAttemptAt: new Date()
        })
        .then((delivery) => ({
            deliveryId: String(delivery._id),
            subscriptionId: String(subscription._id),
            eventId: delivery.eventId,
            eventType: delivery.eventType,
            occurredAt: delivery.createdAt.toISOString(),
            data: delivery.payload,
            attempt: delivery.attempt
        }));

/** Point an already-created subscription at a new url — simulating an endpoint moving/recovering. */
const repointSubscription = async (subscriptionId: string, url: string): Promise<void> => {
    const subscription = await webhookSubscriptionRepository.findById(subscriptionId);
    if (!subscription) throw new Error(`test fixture missing: subscription ${subscriptionId}`);
    subscription.url = url;
    await webhookSubscriptionRepository.save(subscription);
};

/** Drive one delivery chain through `processDeliveryJob` until it leaves `pending` — success or exhausted. */
const runChainToCompletion = async (job: WebhookDeliverJobPayload): Promise<void> => {
    for (let round = 0; round < WEBHOOK_MAX_ATTEMPTS; round++) {
        await processDeliveryJob(job);

        const delivery = await webhookDeliveryRepository.findById(job.deliveryId);
        if (delivery?.status !== 'pending') return;
        job = { ...job, attempt: delivery.attempt };
    }
};

describe('a successful delivery', () => {
    let server: HttpsTestServer;

    beforeEach(async () => {
        server = await startHttpsTestServer((response) => response.writeHead(200).end('ok'));
    });
    afterEach(() => server.close());

    it('arrives signed, and the log records it as succeeded', async () => {
        const subscription = await createSubscription(`${server.url}/hook`);
        const job = await createPendingDelivery(subscription);

        const acked = await processDeliveryJob(job);
        expect(acked).toBe(true);

        const [received] = server.requests();
        expect(received).toBeDefined();
        expect(received.headers['webhook-id']).toBe(job.eventId);
        expect(received.headers['webhook-timestamp']).toBeDefined();
        expect(
            verifyWebhookSignature({
                id: job.eventId,
                timestamp: Number(received.headers['webhook-timestamp']),
                body: received.body,
                signatureHeader: received.headers['webhook-signature'] as string,
                // Re-derive the plaintext the fixture minted, via the subscription's own ring.
                secrets: activeRingSecrets(subscription.secrets)
            })
        ).toBe(true);

        const delivery = await webhookDeliveryRepository.findById(job.deliveryId);
        expect(delivery?.status).toBe('succeeded');
        expect(delivery?.responseCode).toBe(200);
        expect(delivery?.attempt).toBe(1);
        expect(delivery?.error).toBeUndefined();

        const reloadedSubscription = await webhookSubscriptionRepository.findById(
            String(subscription._id)
        );
        expect(reloadedSubscription?.consecutiveFailures).toBe(0);
    });
});

describe('a 500 response', () => {
    let server: HttpsTestServer;

    beforeEach(async () => {
        server = await startHttpsTestServer((response) => response.writeHead(500).end('nope'));
    });
    afterEach(() => server.close());

    it('schedules a retry rather than exhausting on the first failure', async () => {
        const subscription = await createSubscription(`${server.url}/hook`);
        const job = await createPendingDelivery(subscription);

        await processDeliveryJob(job);

        const delivery = await webhookDeliveryRepository.findById(job.deliveryId);
        expect(delivery?.status).toBe('pending');
        expect(delivery?.attempt).toBe(2);
        expect(delivery?.responseCode).toBe(500);
        expect(delivery?.nextAttemptAt).toBeInstanceOf(Date);
        if (!delivery?.nextAttemptAt) throw new Error('unreachable — asserted above');
        expect(delivery.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

        // One failed ATTEMPT, not yet an exhausted CHAIN — the streak this module counts stays at 0.
        const reloadedSubscription = await webhookSubscriptionRepository.findById(
            String(subscription._id)
        );
        expect(reloadedSubscription?.consecutiveFailures).toBe(0);
    });

    it('exhausts the chain after every retry tier is spent, without touching the subscription yet', async () => {
        const subscription = await createSubscription(`${server.url}/hook`);
        const job = await createPendingDelivery(subscription);

        await runChainToCompletion(job);

        const delivery = await webhookDeliveryRepository.findById(job.deliveryId);
        expect(delivery?.status).toBe('exhausted');
        expect(delivery?.attempt).toBe(WEBHOOK_MAX_ATTEMPTS);

        const reloadedSubscription = await webhookSubscriptionRepository.findById(
            String(subscription._id)
        );
        expect(reloadedSubscription?.consecutiveFailures).toBe(1);
        expect(reloadedSubscription?.enabled).toBe(true);
    });
});

describe('sustained failure', () => {
    let server: HttpsTestServer;

    beforeEach(async () => {
        server = await startHttpsTestServer((response) => response.writeHead(500).end('nope'));
    });
    afterEach(() => server.close());

    it('auto-disables the subscription once enough chains in a row exhaust', async () => {
        const subscription = await createSubscription(`${server.url}/hook`);

        for (let chain = 0; chain < WEBHOOK_MAX_CONSECUTIVE_FAILURES; chain++) {
            const job = await createPendingDelivery(subscription, `order.paid.${chain}`);

            await runChainToCompletion(job);
        }

        const reloadedSubscription = await webhookSubscriptionRepository.findById(
            String(subscription._id)
        );
        expect(reloadedSubscription?.consecutiveFailures).toBe(WEBHOOK_MAX_CONSECUTIVE_FAILURES);
        expect(reloadedSubscription?.enabled).toBe(false);
        expect(reloadedSubscription?.disabledAt).toBeInstanceOf(Date);
    });

    it('a chain that succeeds resets the streak, so it never auto-disables on unrelated blips', async () => {
        const subscription = await createSubscription(`${server.url}/hook`);

        // One exhausted chain …
        const failing = await createPendingDelivery(subscription, 'order.paid.fail');
        await runChainToCompletion(failing);

        // … then the endpoint recovers, and a later delivery succeeds.
        await server.close();
        server = await startHttpsTestServer((response) => response.writeHead(200).end('ok'));
        await repointSubscription(String(subscription._id), `${server.url}/hook`);
        const succeeding = await createPendingDelivery(subscription, 'order.paid.recovered');
        await processDeliveryJob(succeeding);

        const reloadedSubscription = await webhookSubscriptionRepository.findById(
            String(subscription._id)
        );
        expect(reloadedSubscription?.consecutiveFailures).toBe(0);
        expect(reloadedSubscription?.enabled).toBe(true);
    });
});

describe('replay', () => {
    it('re-sends against the CURRENT url, and the log reflects the replay', async () => {
        const deadServer = await startHttpsTestServer((response) => response.writeHead(500).end());
        const subscription = await createSubscription(`${deadServer.url}/hook`);
        const job = await createPendingDelivery(subscription);
        await runChainToCompletion(job);
        await deadServer.close();

        const exhausted = await webhookDeliveryRepository.findById(job.deliveryId);
        expect(exhausted?.status).toBe('exhausted');
        if (!exhausted) throw new Error('unreachable — asserted above');
        const attemptBeforeReplay = exhausted.attempt;

        const liveServer = await startHttpsTestServer((response) =>
            response.writeHead(200).end('ok')
        );
        await repointSubscription(String(subscription._id), `${liveServer.url}/hook`);

        const result = await replayDelivery(job.deliveryId, context);
        await liveServer.close();

        expect(result.success).toBe(true);
        if (!result.success || !result.data) throw new Error('unreachable — asserted above');

        expect(result.data.status).toBe('succeeded');
        // A successful attempt never advances `attempt` — replayed or not, see `recordSuccess`.
        expect(result.data.attempt).toBe(attemptBeforeReplay);
        expect(liveServer.requests()).toHaveLength(1);

        const stored = await webhookDeliveryRepository.findById(job.deliveryId);
        expect(stored?.status).toBe('succeeded');
        expect(stored?.responseCode).toBe(200);
    });

    it('a replayed attempt that fails advances `attempt` by exactly one, matching a non-replayed failure at the same starting attempt', async () => {
        const server = await startHttpsTestServer((response) => response.writeHead(500).end());
        const subscription = await createSubscription(`${server.url}/hook`);

        // Two identical chains, each driven through one real failure so both sit `pending` at the
        // same starting attempt (2) — one continues through the normal queue path, the other is
        // replayed instead, so their outcomes can be compared directly.
        const queuedJob = await createPendingDelivery(subscription, 'order.paid.queued');
        await processDeliveryJob(queuedJob);
        const replayedJob = await createPendingDelivery(subscription, 'order.paid.replayed');
        await processDeliveryJob(replayedJob);

        const beforeReplay = await webhookDeliveryRepository.findById(replayedJob.deliveryId);
        if (!beforeReplay) throw new Error('unreachable — asserted above');
        expect(beforeReplay.attempt).toBe(2);

        // The non-replayed sibling: one more real queued failure at the same starting attempt.
        await processDeliveryJob({ ...queuedJob, attempt: beforeReplay.attempt });
        const queuedAfter = await webhookDeliveryRepository.findById(queuedJob.deliveryId);

        const result = await replayDelivery(replayedJob.deliveryId, context);
        await server.close();

        expect(result.success).toBe(true);
        if (!result.success || !result.data) throw new Error('unreachable — asserted above');

        // Exactly one increment for the one real HTTP attempt the replay made, and the same
        // backoff tier a non-replayed failure at the same starting attempt would have used.
        expect(result.data.attempt).toBe(beforeReplay.attempt + 1);
        expect(result.data.attempt).toBe(queuedAfter?.attempt);
        expect(result.data.status).toBe(queuedAfter?.status);
    });
});
