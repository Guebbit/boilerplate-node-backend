/**
 * @module
 * The subscription service end to end against a real database: the listing, what a refusal says,
 * what an update may and may not touch, the secret ring's two moves, and removal. The HTTP-level
 * contract suite is not part of the mutation ruler, so these pin the same outcomes at the service
 * door — with the SSRF guard replaced, since its own table lives in `tests/fuzz/`.
 */

import type { WebhookEventFilter } from '@types';
import { setupTestDb } from '@tests/setup-test-db';
import { callerAs } from '@tests/callers';
import { setEnvironment } from '@tests/environment';
import * as auditPort from '@infrastructure/observability/audit';
import { logger } from '@infrastructure/adapters/logger';
import { registerWebhookCatalogue } from '../../services/catalogue';
import {
    create,
    disable,
    enable,
    getById,
    list,
    remove,
    removeSecret,
    createSecret,
    update
} from '../../services/subscriptions';
import { webhookSubscriptionRepository, webhookDeliveryRepository } from '../../repository';
import { webhooksAuditActions } from '../../audit';
import type { WebhookSubscriptionDocument } from '../../model';
import { mintRingSecret } from '../../secrets';

/** Hosts the replaced guard refuses, standing in for a private or unresolvable address. */
const REFUSED_HOST = 'internal.example.test';

/** Every URL the replaced guard was asked about — `mock*` so the hoisted `jest.mock` may close over it. */
const mockChecked: string[] = [];

jest.mock('@infrastructure/adapters/ssrf-guard', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/adapters/ssrf-guard')>(
        '@infrastructure/adapters/ssrf-guard'
    );
    return {
        ...actual,
        resolveSafeOutboundTarget: (rawUrl: string) => {
            mockChecked.push(rawUrl);
            return new URL(rawUrl).hostname === 'internal.example.test'
                ? Promise.reject(new actual.SsrfRefusedError('unsafe-address', 'private address'))
                : Promise.resolve({
                      hostname: 'x',
                      resolvedAddress: '203.0.113.9',
                      lookup: jest.fn()
                  });
        }
    };
});

/* Replaced, not spied on — `recordAudit` closes over its own module's `emitAuditEvent`. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);
const mockEmitAuditEvent = auditPort.emitAuditEvent as jest.MockedFunction<
    typeof auditPort.emitAuditEvent
>;

setupTestDb();

beforeEach(() => {
    mockChecked.length = 0;
    mockEmitAuditEvent.mockClear();
    registerWebhookCatalogue(['orders']);
    jest.spyOn(logger, 'warn').mockImplementation(() => logger);
});

afterEach(() => {
    registerWebhookCatalogue([]);
    jest.restoreAllMocks();
});

/** A tenant caller, as the manager role. */
const context = { caller: callerAs('manager'), analyticsConsent: false };

/** The audit events recorded under one action. */
const auditedAs = (action: string) =>
    mockEmitAuditEvent.mock.calls
        .map(([event]) => event)
        .filter((event) => event.action === action);

/**
 * Names the contract's enum refuses at the door, typed as filters so a test can hand them straight
 * to the service and reach its own check. The one cast: `string[]` narrowed on purpose.
 */
const outsideTheEnum = (...names: string[]): WebhookEventFilter[] => names as WebhookEventFilter[];

/** Create a subscription through the service and return it, or fail loudly. */
const subscribe = async (
    url = 'https://hooks.example.com/a',
    eventTypes: WebhookEventFilter[] = ['*']
) => {
    const result = await create({ url, eventTypes }, context);
    if (!result.success || !result.data) throw new Error('setup failed: create was refused');
    return result.data.subscription;
};

/** The stored row, read back. */
const stored = (id: string) => webhookSubscriptionRepository.findById(id);

/** The ids of the stored ring's entries, oldest first. */
const ringIds = (id: string) =>
    stored(id).then((row) => row?.secrets.map((entry) => entry.id) ?? []);

/** One field of the stored row, or `undefined` when the row is gone. */
const read = <TKey extends keyof WebhookSubscriptionDocument>(id: string, key: TKey) =>
    stored(id).then((row) => row?.[key]);

describe('listing', () => {
    it('lists this tenant’s subscriptions, newest first, and no other tenant’s', async () => {
        const first = await subscribe('https://hooks.example.com/first');
        const second = await subscribe('https://hooks.example.com/second');
        await webhookSubscriptionRepository.create({
            tenant: 'another-tenant',
            url: 'https://hooks.example.com/foreign',
            eventTypes: ['*'],
            secrets: [mintRingSecret().entry]
        });

        const listed = await list(context, {});

        expect(listed.items.map(({ id }) => id)).toEqual([String(second._id), String(first._id)]);
    });

    it('filters by whether a subscription is enabled', async () => {
        const live = await subscribe('https://hooks.example.com/live');
        const parked = await subscribe('https://hooks.example.com/parked');
        await disable(String(parked._id), context);

        const enabled = await list(context, { enabled: true });
        const disabled = await list(context, { enabled: false });
        const everything = await list(context, {});

        expect(enabled.items.map(({ id }) => id)).toEqual([String(live._id)]);
        expect(disabled.items.map(({ id }) => id)).toEqual([String(parked._id)]);
        expect(everything.items).toHaveLength(2);
    });

    it('tells a pause by hand from the failure guard’s work', async () => {
        const live = await subscribe('https://hooks.example.com/live');
        const paused = await subscribe('https://hooks.example.com/paused');
        const guarded = await subscribe('https://hooks.example.com/guarded');
        await disable(String(paused._id), context);
        await webhookSubscriptionRepository.disable(String(guarded._id));

        const byGuard = await list(context, { autoDisabled: true });
        const notByGuard = await list(context, { autoDisabled: false });
        const pausedByHand = await list(context, { enabled: false, autoDisabled: false });

        expect(byGuard.items.map(({ id }) => id)).toEqual([String(guarded._id)]);
        expect(notByGuard.items.map(({ id }) => id).toSorted()).toEqual(
            [String(live._id), String(paused._id)].toSorted()
        );
        expect(pausedByHand.items.map(({ id }) => id)).toEqual([String(paused._id)]);
    });

    it('orders by the sort asked for, and ends every order on the id', async () => {
        await subscribe('https://hooks.example.com/b');
        await subscribe('https://hooks.example.com/a');

        const byUrl = await list(context, { sort: ['url'] });
        const byUrlDescending = await list(context, { sort: ['-url'] });

        expect(byUrl.items.map(({ url }) => url)).toEqual([
            'https://hooks.example.com/a',
            'https://hooks.example.com/b'
        ]);
        expect(byUrlDescending.items.map(({ url }) => url)).toEqual([
            'https://hooks.example.com/b',
            'https://hooks.example.com/a'
        ]);
    });

    it('gives each row the caller’s actions, none of them for a caller who cannot write', async () => {
        const created = await subscribe();
        const reader = {
            caller: {
                ...callerAs('manager'),
                unrestricted: false,
                permissions: ['read:WebhookSubscription']
            },
            analyticsConsent: false
        };

        const asManager = await list(context, {});
        const asReader = await list(reader, {});

        expect(asManager.items[0].actions).toMatchObject({ update: true, disable: true });
        expect(asReader.items[0].id).toBe(String(created._id));
        expect(asReader.items[0].actions).toEqual({
            update: false,
            delete: false,
            enable: false,
            disable: false,
            createSecret: false,
            removeSecret: false
        });
    });
});

describe('reading one', () => {
    it('answers the subscription, and nothing for an unknown id or another tenant’s', async () => {
        const created = await subscribe();
        const foreign = await webhookSubscriptionRepository.create({
            tenant: 'another-tenant',
            url: 'https://hooks.example.com/foreign',
            eventTypes: ['*'],
            secrets: [mintRingSecret().entry]
        });

        const own = await getById(String(created._id), context);
        const unknown = await getById('a'.repeat(24), context);
        const other = await getById(String(foreign._id), context);

        expect(own).toMatchObject({ id: String(created._id), enabled: true });
        expect(unknown).toBeUndefined();
        expect(other).toBeUndefined();
    });
});

describe('what a create refuses', () => {
    it('names the event types that are not in the catalogue, and the field they came from', async () => {
        const result = await create(
            {
                url: 'https://hooks.example.com/a',
                eventTypes: outsideTheEnum('order.created', 'nope.one', 'nope.two')
            },
            context
        );

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable — asserted above');
        expect(result.status).toBe(422);
        expect(result.errors[0]).toMatchObject({
            code: 'VALIDATION_ERROR',
            message:
                'These event names are not in the catalogue (GET /webhooks/events): nope.one, nope.two.',
            details: { field: 'eventTypes' }
        });
    });

    it('accepts event types the catalogue lists', async () => {
        const result = await create(
            { url: 'https://hooks.example.com/a', eventTypes: ['order.created'] },
            context
        );

        expect(result.success).toBe(true);
    });

    it('refuses a URL the guard refuses, with a message that gives the address away to nobody', async () => {
        const result = await create(
            { url: `https://${REFUSED_HOST}/hook`, eventTypes: ['*'] },
            context
        );

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable — asserted above');
        expect(result.status).toBe(422);
        expect(result.errors[0]).toMatchObject({
            code: 'VALIDATION_ERROR',
            message:
                'This URL cannot be a webhook target: it must be https, carry no credentials, and resolve only to public addresses.',
            details: { field: 'url' }
        });
        expect(JSON.stringify(result.errors)).not.toContain('private address');
        const afterwards = await list(context, {});
        expect(afterwards.items).toHaveLength(0);
        expect(logger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ reason: 'unsafe-address' })
        );
    });

    it('says when the tenant is at its limit with a 409 and its code, and checks nothing about the URL then', async () => {
        setEnvironment({ NODE_WEBHOOK_SUBSCRIPTION_CAP: '1' });
        await subscribe();
        mockChecked.length = 0;

        const result = await create(
            { url: 'https://hooks.example.com/b', eventTypes: ['*'] },
            context
        );

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable — asserted above');
        expect(result.status).toBe(409);
        expect(result.errors[0]).toMatchObject({
            code: 'WEBHOOK_SUBSCRIPTION_LIMIT_REACHED',
            message: 'This shop has reached its webhook subscription limit.'
        });
        expect(mockChecked).toEqual([]);
    });

    it('counts only this tenant’s subscriptions against its limit', async () => {
        setEnvironment({ NODE_WEBHOOK_SUBSCRIPTION_CAP: '1' });
        await webhookSubscriptionRepository.create({
            tenant: 'another-tenant',
            url: 'https://hooks.example.com/foreign',
            eventTypes: ['*'],
            secrets: [mintRingSecret().entry]
        });

        const result = await create(
            { url: 'https://hooks.example.com/mine', eventTypes: ['*'] },
            context
        );

        expect(result.success).toBe(true);
    });

    it('audits a creation with the new row’s id', async () => {
        const created = await subscribe();

        expect(auditedAs(webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_CREATED)).toEqual([
            expect.objectContaining({
                outcome: 'success',
                targetType: 'webhook_subscription',
                targetId: String(created._id)
            })
        ]);
    });
});

describe('updating', () => {
    it('answers 404 for an unknown id and for another tenant’s subscription', async () => {
        const foreign = await webhookSubscriptionRepository.create({
            tenant: 'another-tenant',
            url: 'https://hooks.example.com/foreign',
            eventTypes: ['*'],
            secrets: [mintRingSecret().entry]
        });

        const unknown = await update('a'.repeat(24), { description: 'x' }, context);
        const other = await update(String(foreign._id), { description: 'x' }, context);

        expect([unknown, other].map((result) => !result.success && result.status)).toEqual([
            404, 404
        ]);
        expect(await read(String(foreign._id), 'description')).toBeUndefined();
    });

    it('refuses event types outside the catalogue and leaves the row as it was', async () => {
        const created = await subscribe('https://hooks.example.com/a', ['order.created']);

        const result = await update(
            String(created._id),
            { eventTypes: outsideTheEnum('nope.one') },
            context
        );

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable — asserted above');
        expect(result.errors[0]).toMatchObject({ details: { field: 'eventTypes' } });
        expect(await read(String(created._id), 'eventTypes')).toEqual(['order.created']);
    });

    it('checks a URL only when it changes, and refuses a change the guard refuses', async () => {
        const created = await subscribe('https://hooks.example.com/a');
        mockChecked.length = 0;

        await update(
            String(created._id),
            { url: 'https://hooks.example.com/a', description: 'same' },
            context
        );
        const refused = await update(
            String(created._id),
            { url: `https://${REFUSED_HOST}/x` },
            context
        );
        const moved = await update(
            String(created._id),
            { url: 'https://hooks.example.com/b' },
            context
        );

        expect(mockChecked).toEqual([`https://${REFUSED_HOST}/x`, 'https://hooks.example.com/b']);
        expect(refused.success).toBe(false);
        expect(moved.success).toBe(true);
        expect(await read(String(created._id), 'url')).toBe('https://hooks.example.com/b');
    });

    it('changes only what the request names, and clears a description with null', async () => {
        const created = await subscribe('https://hooks.example.com/a', ['order.created']);
        await update(String(created._id), { description: 'first' }, context);
        const kept = await stored(String(created._id));

        await update(String(created._id), { eventTypes: ['order.paid'] }, context);
        const retargeted = await stored(String(created._id));
        await update(String(created._id), { description: null }, context);
        const cleared = await stored(String(created._id));

        expect(kept).toMatchObject({ description: 'first', eventTypes: ['order.created'] });
        expect(retargeted).toMatchObject({
            description: 'first',
            eventTypes: ['order.paid'],
            url: 'https://hooks.example.com/a'
        });
        expect(cleared?.description).toBeUndefined();
        expect(cleared?.eventTypes).toEqual(['order.paid']);
    });

    it('audits an update with the subscription’s id', async () => {
        const created = await subscribe();

        await update(String(created._id), { description: 'x' }, context);

        expect(auditedAs(webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_UPDATED)).toEqual([
            expect.objectContaining({
                outcome: 'success',
                targetType: 'webhook_subscription',
                targetId: String(created._id)
            })
        ]);
    });

    it('audits what changed: the event filter by value, the url and description by name only', async () => {
        const created = await subscribe('https://hooks.example.com/a', ['order.created']);

        await update(
            String(created._id),
            {
                url: 'https://hooks.example.com/token-in-the-path',
                description: 'personal note',
                eventTypes: ['order.paid']
            },
            context
        );

        const [event] = auditedAs(webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_UPDATED);
        expect(event.metadata).toEqual({
            changes: { eventTypes: { from: ['order.created'], to: ['order.paid'] } },
            changedFields: ['url', 'description']
        });
        expect(JSON.stringify(event.metadata)).not.toContain('token-in-the-path');
        expect(JSON.stringify(event.metadata)).not.toContain('personal note');
    });

    it('records no change for a request that moves nothing', async () => {
        const created = await subscribe('https://hooks.example.com/a', ['order.created']);

        await update(
            String(created._id),
            { url: 'https://hooks.example.com/a', eventTypes: ['order.created'] },
            context
        );

        const [event] = auditedAs(webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_UPDATED);
        expect(event.metadata).toEqual({});
    });
});

describe('switching on and off', () => {
    it('disables by hand: stamps disabledAt only, keeps the streak, audits it', async () => {
        const created = await subscribe();
        const row = await stored(String(created._id));
        if (!row) throw new Error('setup failed');
        row.consecutiveFailures = 2;
        await webhookSubscriptionRepository.save(row);

        const result = await disable(String(created._id), context);

        expect(result.success).toBe(true);
        const after = await stored(String(created._id));
        expect(after).toMatchObject({ consecutiveFailures: 2 });
        expect(after?.disabledAt).toBeInstanceOf(Date);
        expect(after?.autoDisabledAt).toBeUndefined();
        expect(auditedAs(webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_DISABLED)).toHaveLength(1);
    });

    it('enables a disabled subscription: streak, failing-since date and both stamps are cleared', async () => {
        const created = await subscribe();
        const row = await stored(String(created._id));
        if (!row) throw new Error('setup failed');
        row.consecutiveFailures = 7;
        row.disabledAt = new Date();
        row.autoDisabledAt = row.disabledAt;
        row.failingSince = new Date(Date.now() - 4 * 86_400_000);
        await webhookSubscriptionRepository.save(row);

        const result = await enable(String(created._id), context);

        expect(result.success).toBe(true);
        const after = await stored(String(created._id));
        expect(after?.consecutiveFailures).toBe(0);
        expect(after?.disabledAt).toBeUndefined();
        expect(after?.autoDisabledAt).toBeUndefined();
        // The age floor starts over, or the next five exhausted chains would disable it at once.
        expect(after?.failingSince).toBeUndefined();
        expect(auditedAs(webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_ENABLED)).toHaveLength(1);
    });

    it('refuses a repeat with a 409 and its code, writing and auditing nothing', async () => {
        const created = await subscribe();
        const row = await stored(String(created._id));
        if (!row) throw new Error('setup failed');
        row.consecutiveFailures = 4;
        await webhookSubscriptionRepository.save(row);

        const enabledAgain = await enable(String(created._id), context);
        await disable(String(created._id), context);
        mockEmitAuditEvent.mockClear();
        const disabledAgain = await disable(String(created._id), context);

        expect(enabledAgain).toMatchObject({
            success: false,
            status: 409,
            errors: [expect.objectContaining({ code: 'WEBHOOK_SUBSCRIPTION_ALREADY_ENABLED' })]
        });
        expect(disabledAgain).toMatchObject({
            success: false,
            status: 409,
            errors: [expect.objectContaining({ code: 'WEBHOOK_SUBSCRIPTION_ALREADY_DISABLED' })]
        });
        // The refused enable did not reset the streak of a healthy subscription.
        expect(await read(String(created._id), 'consecutiveFailures')).toBe(4);
        expect(mockEmitAuditEvent).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown id and for another tenant’s subscription', async () => {
        const foreign = await webhookSubscriptionRepository.create({
            tenant: 'another-tenant',
            url: 'https://hooks.example.com/foreign',
            eventTypes: ['*'],
            secrets: [mintRingSecret().entry]
        });

        const results = await Promise.all([
            enable('a'.repeat(24), context),
            disable('a'.repeat(24), context),
            disable(String(foreign._id), context)
        ]);

        expect(results.map((result) => !result.success && result.status)).toEqual([404, 404, 404]);
        expect(await read(String(foreign._id), 'disabledAt')).toBeUndefined();
    });
});

describe('the secret ring', () => {
    it('answers 404 for an unknown subscription on every ring action', async () => {
        const id = 'a'.repeat(24);

        const rotated = await createSecret(id, context);
        const removed = await removeSecret(id, 'whatever', context);

        expect([rotated, removed].map((result) => !result.success && result.status)).toEqual([
            404, 404
        ]);
    });

    it('rotating adds a secret beside the newest, hands back its plaintext once, and audits it', async () => {
        const created = await subscribe();
        const before = await stored(String(created._id));

        const rotated = await createSecret(String(created._id), context);

        if (!rotated.success || !rotated.data) throw new Error('rotation refused');
        expect(rotated.data.newSecret).toEqual(expect.any(String));
        const after = await stored(String(created._id));
        expect(after?.secrets).toHaveLength(2);
        expect(after?.secrets[0].id).toBe(before?.secrets[0].id);
        expect(auditedAs(webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_SECRET_ROTATED)).toEqual([
            expect.objectContaining({ targetId: String(created._id), outcome: 'success' })
        ]);
    });

    it('never holds more than two: rotating again drops the oldest', async () => {
        const created = await subscribe();
        const [original] = await ringIds(String(created._id));
        await createSecret(String(created._id), context);
        const [, second] = await ringIds(String(created._id));

        await createSecret(String(created._id), context);

        const ring = (await read(String(created._id), 'secrets')) ?? [];
        expect(ring).toHaveLength(2);
        expect(ring.map(({ id }) => id)).not.toContain(original);
        expect(ring[0].id).toBe(second);
    });

    it('removes one entry by id and audits it', async () => {
        const created = await subscribe();
        await createSecret(String(created._id), context);
        const [old, newest] = (await read(String(created._id), 'secrets')) ?? [];

        const removed = await removeSecret(String(created._id), old.id, context);

        expect(removed.success).toBe(true);
        expect(await ringIds(String(created._id))).toEqual([newest.id]);
        expect(auditedAs(webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_SECRET_REMOVED)).toEqual([
            expect.objectContaining({ targetId: String(created._id), outcome: 'success' })
        ]);
    });

    it('answers 404 for an id the ring does not carry, and changes nothing', async () => {
        const created = await subscribe();

        const result = await removeSecret(String(created._id), 'not-in-the-ring', context);

        expect(!result.success && result.status).toBe(404);
        expect(!result.success && result.errors[0].message).toBe('That item no longer exists.');
        expect(await read(String(created._id), 'secrets')).toHaveLength(1);
    });

    it('refuses to remove the last secret: 422, and the ring keeps it', async () => {
        const created = await subscribe();
        const [only] = (await read(String(created._id), 'secrets')) ?? [];

        const result = await removeSecret(String(created._id), only.id, context);

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable — asserted above');
        expect(result.status).toBe(422);
        expect(result.errors[0]).toMatchObject({
            message: 'A subscription must keep at least one active secret.'
        });
        expect(await read(String(created._id), 'secrets')).toHaveLength(1);
    });
});

describe('removing', () => {
    it('answers 404 for an unknown or foreign subscription', async () => {
        const foreign = await webhookSubscriptionRepository.create({
            tenant: 'another-tenant',
            url: 'https://hooks.example.com/foreign',
            eventTypes: ['*'],
            secrets: [mintRingSecret().entry]
        });

        const unknown = await remove('a'.repeat(24), context);
        const other = await remove(String(foreign._id), context);

        expect([unknown, other].map((result) => !result.success && result.status)).toEqual([
            404, 404
        ]);
        expect(await stored(String(foreign._id))).not.toBeNull();
    });

    it('keeps the delivery log of the subscription it deletes', async () => {
        const created = await subscribe();
        const delivery = await webhookDeliveryRepository.create({
            tenant: created.tenant,
            subscriptionId: created._id,
            eventId: 'evt_kept',
            eventType: 'order.paid',
            payload: { orderId: 'order_1' },
            attempt: 1,
            status: 'succeeded'
        });

        await remove(String(created._id), context);

        expect(await webhookDeliveryRepository.findById(String(delivery._id))).not.toBeNull();
    });

    it('deletes the row and audits it', async () => {
        const created = await subscribe();

        const result = await remove(String(created._id), context);

        expect(result.success).toBe(true);
        expect(await stored(String(created._id))).toBeNull();
        expect(auditedAs(webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_DELETED)).toEqual([
            expect.objectContaining({ targetId: String(created._id), outcome: 'success' })
        ]);
    });
});
