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
import { verifyWebhookSignatureForTest } from '../verify-signature.fixture';
import {
    WEBHOOK_MAX_ATTEMPTS,
    WEBHOOK_MAX_CONSECUTIVE_FAILURES,
    WEBHOOK_MIN_FAILING_MS
} from '@modules/webhooks/domain';
import type { WebhookSubscriptionDocument } from '@modules/webhooks/model';
import { createUser } from '@modules/users/tests/factories';
import { userService } from '@modules/users';
import { callerAs, TEST_TENANT_ID } from '@tests/callers';
import * as auditPort from '@infrastructure/observability/audit';
import { observePort } from '@tests/ports';
import { webhooksAuditActions } from '@modules/webhooks/audit';
import { logger } from '@infrastructure/adapters/logger';

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
        resolveSafeOutboundTarget: (rawUrl: string) => {
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

/** The auto-disable notice's one call — asserted directly rather than through the 'log' transport. */
const enqueueEmailMock = jest.fn().mockResolvedValue(undefined);
jest.mock('@infrastructure/adapters/mailer', () => ({
    enqueueEmail: (...args: unknown[]) => enqueueEmailMock(...args)
}));

// Replaced, not spied on — `jest.spyOn` cannot redefine the non-configurable getter a CommonJS
// namespace import exposes. Same pattern `account`'s own integration suites use.
jest.mock('@infrastructure/observability/audit', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/audit'),
    emitAuditEvent: jest.fn()
}));

setupTestDb();

beforeEach(() => enqueueEmailMock.mockClear());

const context = { caller: callerAs('manager'), analyticsConsent: false };

/** A subscription document with one ring secret, saved for real. */
const createSubscription = (
    url: string,
    eventTypes: string[] = ['*'],
    ownerUserId?: string
): Promise<WebhookSubscriptionDocument> => {
    const { entry } = mintRingSecret();

    return webhookSubscriptionRepository.create({
        tenant: TEST_TENANT_ID,
        url,
        eventTypes,
        enabled: true,
        consecutiveFailures: 0,
        ownerUserId,
        secrets: [entry]
    });
};

/**
 * A `pending`, attempt-1 delivery row, plus the wire-shape fields a body/signature assertion
 * needs — NOT the job payload `processDeliveryJob` takes: that is Claim Check (`{ deliveryId }`
 * only, per `../../asyncapi.internal.yaml`), built fresh at each call site from `.deliveryId`.
 */
interface PendingDeliveryFixture {
    deliveryId: string;
    eventId: string;
    eventType: string;
    occurredAt: string;
    data: Record<string, unknown>;
}

/** A `pending`, attempt-1 delivery row. */
const createPendingDelivery = (
    subscription: WebhookSubscriptionDocument,
    eventType = 'order.paid'
): Promise<PendingDeliveryFixture> =>
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
            eventId: delivery.eventId,
            eventType: delivery.eventType,
            occurredAt: delivery.createdAt.toISOString(),
            data: delivery.payload
        }));

/** Point an already-created subscription at a new url — simulating an endpoint moving/recovering. */
const repointSubscription = async (subscriptionId: string, url: string): Promise<void> => {
    const subscription = await webhookSubscriptionRepository.findById(subscriptionId);
    if (!subscription) throw new Error(`test fixture missing: subscription ${subscriptionId}`);
    subscription.url = url;
    await webhookSubscriptionRepository.save(subscription);
};

/**
 * Auto-disable is time-based, like Stripe/Svix — a genuinely dead endpoint failing for real over
 * milliseconds (every chain in this suite exhausts in well under a second) never crosses
 * `WEBHOOK_MIN_FAILING_MS` on its own. Backdating `failingSince` is what a real 3-day-old streak
 * looks like by the time its 5th chain exhausts, without a real 3-day test.
 */
const backdateFailingStreak = async (subscriptionId: string): Promise<void> => {
    const subscription = await webhookSubscriptionRepository.findById(subscriptionId);
    if (!subscription) throw new Error(`test fixture missing: subscription ${subscriptionId}`);
    subscription.failingSince = new Date(Date.now() - (WEBHOOK_MIN_FAILING_MS + 60_000));
    await webhookSubscriptionRepository.save(subscription);
};

/**
 * Drive one delivery chain through `processDeliveryJob` until it leaves `pending` — success or
 * exhausted. Re-sends the same `{ deliveryId }` message every round: `claimPending` reads the
 * row's CURRENT `attempt` itself, so nothing here needs to track it across retries.
 */
const runChainToCompletion = async (deliveryId: string): Promise<void> => {
    for (let round = 0; round < WEBHOOK_MAX_ATTEMPTS; round++) {
        await processDeliveryJob({ deliveryId });

        const delivery = await webhookDeliveryRepository.findById(deliveryId);
        if (delivery?.status !== 'pending') return;
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

        const acked = await processDeliveryJob({ deliveryId: job.deliveryId });
        expect(acked).toBe(true);

        const [received] = server.requests();
        expect(received).toBeDefined();
        expect(received.headers['webhook-id']).toBe(job.eventId);
        expect(received.headers['webhook-timestamp']).toBeDefined();
        expect(
            verifyWebhookSignatureForTest({
                id: job.eventId,
                timestamp: Number(received.headers['webhook-timestamp']),
                body: received.body,
                signatureHeader: received.headers['webhook-signature'] as string,
                // Re-derive the plaintext the fixture minted, via the subscription's own ring.
                secrets: activeRingSecrets(subscription.secrets)
            })
        ).toBe(true);

        // The Standard Webhooks envelope — `type` names the event, `data` is the bare payload the
        // job carried. See `../../asyncapi.yaml`'s own header for the full shape.
        expect(JSON.parse(received.body) as unknown).toEqual({
            type: job.eventType,
            timestamp: job.occurredAt,
            data: job.data
        });

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

        await processDeliveryJob({ deliveryId: job.deliveryId });

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

        await runChainToCompletion(job.deliveryId);

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

    it('does NOT auto-disable on chain count alone — a platform-side outage must not look like the endpoint is at fault', async () => {
        const subscription = await createSubscription(`${server.url}/hook`);

        for (let chain = 0; chain < WEBHOOK_MAX_CONSECUTIVE_FAILURES; chain++) {
            const job = await createPendingDelivery(subscription, `order.paid.fast.${chain}`);
            await runChainToCompletion(job.deliveryId);
        }

        const reloadedSubscription = await webhookSubscriptionRepository.findById(
            String(subscription._id)
        );
        expect(reloadedSubscription?.consecutiveFailures).toBe(WEBHOOK_MAX_CONSECUTIVE_FAILURES);
        expect(reloadedSubscription?.enabled).toBe(true);
        expect(reloadedSubscription?.disabledAt).toBeUndefined();
    });

    it('auto-disables once enough chains in a row exhaust AND the streak has run past the time floor', async () => {
        const subscription = await createSubscription(`${server.url}/hook`);

        for (let chain = 0; chain < WEBHOOK_MAX_CONSECUTIVE_FAILURES - 1; chain++) {
            const job = await createPendingDelivery(subscription, `order.paid.${chain}`);
            await runChainToCompletion(job.deliveryId);
        }
        await backdateFailingStreak(String(subscription._id));

        const finalJob = await createPendingDelivery(subscription, 'order.paid.final');
        await runChainToCompletion(finalJob.deliveryId);

        const reloadedSubscription = await webhookSubscriptionRepository.findById(
            String(subscription._id)
        );
        expect(reloadedSubscription?.consecutiveFailures).toBe(WEBHOOK_MAX_CONSECUTIVE_FAILURES);
        expect(reloadedSubscription?.enabled).toBe(false);
        expect(reloadedSubscription?.disabledAt).toBeInstanceOf(Date);
    });

    it('notifies the subscription owner once auto-disabled', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const owner = await createUser({ email: 'owner@example.com' });
        const subscription = await createSubscription(
            `${server.url}/hook`,
            ['*'],
            String(owner._id)
        );

        for (let chain = 0; chain < WEBHOOK_MAX_CONSECUTIVE_FAILURES - 1; chain++) {
            const job = await createPendingDelivery(subscription, `order.paid.notice.${chain}`);
            await runChainToCompletion(job.deliveryId);
        }
        await backdateFailingStreak(String(subscription._id));
        const finalJob = await createPendingDelivery(subscription, 'order.paid.notice.final');
        await runChainToCompletion(finalJob.deliveryId);

        expect(enqueueEmailMock).toHaveBeenCalledTimes(1);
        expect(enqueueEmailMock).toHaveBeenCalledWith(
            expect.objectContaining({ to: 'owner@example.com' }),
            'webhooks.subscription-disabled',
            expect.objectContaining({ url: `${server.url}/hook` })
        );

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                actor_user_id: 'system',
                action: webhooksAuditActions.SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED,
                target_type: 'webhook_subscription',
                target_id: String(subscription._id)
            })
        );
    });

    it('sends no notice for a subscription that predates ownerUserId, but still audits it', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        // No `ownerUserId` — `createSubscription`'s third argument defaults to `undefined`, the
        // same shape a subscription created before this field existed carries.
        const subscription = await createSubscription(`${server.url}/hook`);

        for (let chain = 0; chain < WEBHOOK_MAX_CONSECUTIVE_FAILURES - 1; chain++) {
            const job = await createPendingDelivery(subscription, `order.paid.nonotice.${chain}`);
            await runChainToCompletion(job.deliveryId);
        }
        await backdateFailingStreak(String(subscription._id));
        const finalJob = await createPendingDelivery(subscription, 'order.paid.nonotice.final');
        await runChainToCompletion(finalJob.deliveryId);

        expect(enqueueEmailMock).not.toHaveBeenCalled();
        // The email is the courtesy; the audit trail is the record — one missing must not cost
        // the other.
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: webhooksAuditActions.SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED,
                target_id: String(subscription._id)
            })
        );
    });

    /*
     * B7: the owner lookup behind the courtesy email (`attempt.ts`'s `notifyOwnerOfAutoDisable`)
     * had no `.catch` — a rejection there had nobody left to see it, since the caller does not
     * await this branch either. Logged instead, so a lookup failure is visible without costing
     * the disable itself, which already committed via the audit entry above.
     */
    it('logs a failed owner lookup instead of losing it, and still auto-disables', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const owner = await createUser({ email: 'owner@example.com' });
        const subscription = await createSubscription(
            `${server.url}/hook`,
            ['*'],
            String(owner._id)
        );
        const loggedError = jest.spyOn(logger, 'error').mockImplementation(() => logger);
        // Real DB, deliberately made to fail: `getById` is the one call this fixture cannot
        // otherwise force to reject.
        jest.spyOn(userService, 'getById').mockRejectedValueOnce(new Error('lookup unavailable'));

        for (let chain = 0; chain < WEBHOOK_MAX_CONSECUTIVE_FAILURES - 1; chain++) {
            const job = await createPendingDelivery(subscription, `order.paid.lookupfail.${chain}`);
            await runChainToCompletion(job.deliveryId);
        }
        await backdateFailingStreak(String(subscription._id));
        const finalJob = await createPendingDelivery(subscription, 'order.paid.lookupfail.final');
        await runChainToCompletion(finalJob.deliveryId);
        // The lookup runs off the auto-disable write, not off the HTTP response — give its
        // microtask chain a turn before asserting.
        await Promise.resolve();

        expect(enqueueEmailMock).not.toHaveBeenCalled();
        expect(loggedError).toHaveBeenCalledWith(
            expect.objectContaining({ subscriptionId: String(subscription._id) })
        );
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: webhooksAuditActions.SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED,
                target_id: String(subscription._id)
            })
        );
    });

    it('a chain that succeeds resets the streak (and failingSince), so it never auto-disables on unrelated blips', async () => {
        const subscription = await createSubscription(`${server.url}/hook`);

        // One exhausted chain …
        const failing = await createPendingDelivery(subscription, 'order.paid.fail');
        await runChainToCompletion(failing.deliveryId);

        // … then the endpoint recovers, and a later delivery succeeds.
        await server.close();
        server = await startHttpsTestServer((response) => response.writeHead(200).end('ok'));
        await repointSubscription(String(subscription._id), `${server.url}/hook`);
        const succeeding = await createPendingDelivery(subscription, 'order.paid.recovered');
        await processDeliveryJob({ deliveryId: succeeding.deliveryId });

        const reloadedSubscription = await webhookSubscriptionRepository.findById(
            String(subscription._id)
        );
        expect(reloadedSubscription?.consecutiveFailures).toBe(0);
        expect(reloadedSubscription?.enabled).toBe(true);
        expect(reloadedSubscription?.failingSince).toBeUndefined();
    });
});

describe('replay', () => {
    it('re-sends against the CURRENT url, and the log reflects the replay', async () => {
        const deadServer = await startHttpsTestServer((response) => response.writeHead(500).end());
        const subscription = await createSubscription(`${deadServer.url}/hook`);
        const job = await createPendingDelivery(subscription);
        await runChainToCompletion(job.deliveryId);
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
        await processDeliveryJob({ deliveryId: queuedJob.deliveryId });
        const replayedJob = await createPendingDelivery(subscription, 'order.paid.replayed');
        await processDeliveryJob({ deliveryId: replayedJob.deliveryId });

        const beforeReplay = await webhookDeliveryRepository.findById(replayedJob.deliveryId);
        if (!beforeReplay) throw new Error('unreachable — asserted above');
        expect(beforeReplay.attempt).toBe(2);

        // The non-replayed sibling: one more real queued failure at the same starting attempt.
        await processDeliveryJob({ deliveryId: queuedJob.deliveryId });
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

describe('the delivery lease', () => {
    it('reclaims a stranded in-flight row once its lease has expired', async () => {
        const server = await startHttpsTestServer((response) => response.writeHead(200).end('ok'));
        const subscription = await createSubscription(`${server.url}/hook`);
        const job = await createPendingDelivery(subscription);

        // A worker that claimed the row and then crashed mid-attempt: `in-flight`, a lease already
        // in the past, and a token nothing still holds.
        const stranded = await webhookDeliveryRepository.findById(job.deliveryId);
        if (!stranded) throw new Error('unreachable — asserted above');
        stranded.status = 'in-flight';
        stranded.leaseToken = 'a-dead-workers-token';
        stranded.leaseExpiresAt = new Date(Date.now() - 1000);
        await webhookDeliveryRepository.save(stranded);

        const acked = await processDeliveryJob({ deliveryId: job.deliveryId });
        await server.close();

        expect(acked).toBe(true);
        const delivery = await webhookDeliveryRepository.findById(job.deliveryId);
        expect(delivery?.status).toBe('succeeded');
    });

    it('lets exactly one of two concurrent claims on the same row win', async () => {
        const subscription = await createSubscription('https://example.invalid/hook');
        const job = await createPendingDelivery(subscription);

        const [first, second] = await Promise.all([
            webhookDeliveryRepository.claimPending(job.deliveryId),
            webhookDeliveryRepository.claimPending(job.deliveryId)
        ]);

        const winners = [first, second].filter((claimed) => claimed !== null);
        expect(winners).toHaveLength(1);
    });

    it('replaying after the subscription is deleted answers 404 WITHOUT claiming the row first', async () => {
        const subscription = await createSubscription('https://example.invalid/hook');
        const job = await createPendingDelivery(subscription);
        await webhookSubscriptionRepository.deleteOne(subscription);

        const result = await replayDelivery(job.deliveryId, context);

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable — asserted above');
        expect(result.status).toBe(404);

        // The claim never happened: still `pending`, no lease taken — a claim-then-404 would have
        // left it `in-flight` under a lease nobody is left to finish, stranded until the sweep's
        // stranded-lease read reclaims it as `exhausted` 60s later.
        const untouched = await webhookDeliveryRepository.findById(job.deliveryId);
        expect(untouched?.status).toBe('pending');
        expect(untouched?.leaseToken).toBeUndefined();
    });

    it("refuses a replay while a live worker's lease already holds the row", async () => {
        const subscription = await createSubscription('https://example.invalid/hook');
        const job = await createPendingDelivery(subscription);

        // A live worker's claim, never completed — the row is still `in-flight` under a fresh
        // lease when the replay below runs.
        const claimed = await webhookDeliveryRepository.claimPending(job.deliveryId);
        expect(claimed).not.toBeNull();

        const result = await replayDelivery(job.deliveryId, context);

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable — asserted above');
        expect(result.status).toBe(409);
        expect(result.errors[0]?.code).toBe('WEBHOOK_DELIVERY_IN_PROGRESS');
    });

    it("drops an outcome write whose token no longer matches the row's current lease", async () => {
        const subscription = await createSubscription('https://example.invalid/hook');
        const job = await createPendingDelivery(subscription);

        const claimed = await webhookDeliveryRepository.claimPending(job.deliveryId);
        if (!claimed?.leaseToken) throw new Error('unreachable — asserted above');
        const staleToken = claimed.leaseToken;

        // Something else re-claims the row before this (simulated) slow attempt writes its
        // outcome — the same shape a real lease expiry followed by a reclaim would produce.
        claimed.leaseToken = 'a-newer-claims-token';
        await webhookDeliveryRepository.save(claimed);

        const dropped = await webhookDeliveryRepository.applyOutcome(job.deliveryId, staleToken, {
            status: 'succeeded'
        });

        expect(dropped).toBeNull();
        const stored = await webhookDeliveryRepository.findById(job.deliveryId);
        expect(stored?.status).toBe('in-flight');
        expect(stored?.leaseToken).toBe('a-newer-claims-token');
    });
});
