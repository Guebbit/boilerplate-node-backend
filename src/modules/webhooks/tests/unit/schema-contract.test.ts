/**
 * @module
 * The two webhook schemas' contracts — the declarations, not the documents. Same reasoning as
 * every other module's `schema-contract.test.ts` (see e.g. `orders`'s own): a dropped `required`,
 * a flipped default, or a TTL index quietly detached from `NODE_WEBHOOK_DELIVERY_RETENTION_DAYS`
 * changes nothing about what a VALID document looks like, so an integration test that only ever
 * saves valid fixtures cannot catch it. This reads the schema objects directly instead.
 */
import { webhookSubscriptionSchema, webhookDeliverySchema } from '@modules/webhooks/model';
import {
    defaultOf,
    enumOf,
    indexOptionSpecs,
    indexSpecs,
    optionsOf,
    requiredPaths,
    subSchema
} from '@tests/schema';

/** The delivery retention window the schema was built with, in seconds — mirrors `model.ts`'s own default. */
const DELIVERY_RETENTION_SECONDS =
    Number(process.env.NODE_WEBHOOK_DELIVERY_RETENTION_DAYS ?? 30) * 24 * 60 * 60;

describe('webhookSubscriptionSchema', () => {
    it('requires the fan-out fields, and nothing else', () => {
        // `description` is optional (nothing to say), `disabledAt` is optional (never disabled
        // yet), and `secrets` defaults to `[]` rather than being required — a subscription that
        // has not minted a secret yet is a contradiction `create()` never produces, not a shape
        // this schema needs to forbid on its own.
        expect(requiredPaths(webhookSubscriptionSchema)).toEqual([
            'consecutiveFailures',
            'enabled',
            'eventTypes',
            'tenant',
            'url'
        ]);
    });

    it('starts a subscription enabled, with a clean failure streak', () => {
        expect(defaultOf(webhookSubscriptionSchema, 'enabled')).toBe(true);
        expect(defaultOf(webhookSubscriptionSchema, 'consecutiveFailures')).toBe(0);
    });

    it('defaults the secret ring to empty, not undefined', () => {
        // `../../secrets.ts`'s `activeRingSecrets` reads this as an array unconditionally; an `undefined`
        // default would make every fresh document a runtime crash away from a delivery attempt.
        expect(defaultOf(webhookSubscriptionSchema, 'secrets')).toEqual([]);
    });

    it("gives the ring's entries no _id of their own", () => {
        // `_id: false`: `../../secrets.ts` mints each entry's own `id` before the document is ever
        // saved — an auto-assigned Mongoose `_id` alongside it would be a second, unused identity.
        expect(optionsOf(subSchema(webhookSubscriptionSchema, 'secrets'))._id).toBe(false);
    });

    it('requires an id and a ciphertext on every ring entry, never the plaintext', () => {
        const ringEntry = subSchema(webhookSubscriptionSchema, 'secrets');
        expect(requiredPaths(ringEntry)).toEqual(['ciphertext', 'id']);
    });

    it('declares the tenant listing and the fan-out matching indexes', () => {
        expect(indexSpecs(webhookSubscriptionSchema)).toEqual([
            'enabled_1_eventTypes_1: enabled+1, eventTypes+1',
            'tenant_1_createdAt_-1: tenant+1, createdAt-1'
        ]);
    });

    it('declares neither index unique or sparse', () => {
        // A unique index on either would reject a second subscription — the cap in
        // `services/subscriptions.ts` is the ONLY thing allowed to limit how many a tenant holds.
        expect(indexOptionSpecs(webhookSubscriptionSchema)).toEqual([
            'enabled_1_eventTypes_1: (none)',
            'tenant_1_createdAt_-1: (none)'
        ]);
    });

    it('keeps createdAt and updatedAt, which the tenant listing sorts by', () => {
        expect(optionsOf(webhookSubscriptionSchema).timestamps).toBe(true);
    });
});

describe('webhookDeliverySchema', () => {
    it('requires everything a delivery attempt needs to be signed and tracked', () => {
        expect(requiredPaths(webhookDeliverySchema)).toEqual([
            'attempt',
            'eventId',
            'eventType',
            'payload',
            'status',
            'subscriptionId',
            'tenant'
        ]);
    });

    it('leaves the outcome fields absent until an attempt actually lands', () => {
        // `responseCode`/`durationMs`/`error`/`nextAttemptAt` all mean something specific by their
        // absence (never attempted, no retry scheduled) — a `default` on any would misreport a row
        // that has not been through `attemptDelivery` yet.
        for (const path of ['responseCode', 'durationMs', 'error', 'nextAttemptAt'])
            expect(requiredPaths(webhookDeliverySchema)).not.toContain(path);
    });

    it('starts a delivery at attempt 1, pending', () => {
        expect(defaultOf(webhookDeliverySchema, 'attempt')).toBe(1);
        expect(defaultOf(webhookDeliverySchema, 'status')).toBe('pending');
    });

    it('restricts status to the documented delivery lifecycle', () => {
        // Mirrors `WebhookDeliveryStatus` in `model.ts` — `failed` included though unused today
        // (kept for a future per-attempt row without a contract change, per that type's own doc).
        expect(enumOf(webhookDeliverySchema, 'status')).toEqual([
            'pending',
            'in-flight',
            'succeeded',
            'failed',
            'exhausted'
        ]);
    });

    it('declares the log filters and the retry sweep index, plus the TTL sweep', () => {
        expect(indexSpecs(webhookDeliverySchema)).toEqual([
            'createdAt_1: createdAt+1',
            'status_1_createdAt_-1: status+1, createdAt-1',
            'status_1_nextAttemptAt_1: status+1, nextAttemptAt+1',
            'subscriptionId_1_createdAt_-1: subscriptionId+1, createdAt-1',
            'tenant_1_createdAt_-1: tenant+1, createdAt-1'
        ]);
    });

    it('expires a delivery row at the configured retention window, and only that index', () => {
        // Asserted against the configured window rather than a literal, same reasoning as
        // `feedback`'s own schema-contract test — so changing
        // `NODE_WEBHOOK_DELIVERY_RETENTION_DAYS` moves the policy and the test together.
        expect(indexOptionSpecs(webhookDeliverySchema)).toEqual([
            `createdAt_1: expireAfterSeconds=${DELIVERY_RETENTION_SECONDS}`,
            'status_1_createdAt_-1: (none)',
            'status_1_nextAttemptAt_1: (none)',
            'subscriptionId_1_createdAt_-1: (none)',
            'tenant_1_createdAt_-1: (none)'
        ]);
    });

    it('expires ascending by createdAt, which is the direction a TTL index needs', () => {
        // The same field appears descending in two compound indexes above; getting these confused
        // produces an index that silently never deletes anything.
        expect(indexSpecs(webhookDeliverySchema)).toContain('createdAt_1: createdAt+1');
    });

    it('keeps createdAt and updatedAt, which every index and the TTL sweep depend on', () => {
        expect(optionsOf(webhookDeliverySchema).timestamps).toBe(true);
    });
});
