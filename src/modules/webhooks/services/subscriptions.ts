/**
 * @module
 * Subscription CRUD: list, create (mints the ring's first secret), update (state fields only),
 * the two secret-ring actions (`rotateSecret`/`removeSecret`), remove. Tenant-scoped throughout —
 * every read and write narrows to `context.caller.tenantId`, which any `webhooks.*` caller always
 * carries (every key in the family is `scope: tenant` in `shared/authorization-keys.yaml`, and
 * `Caller.tenantId` is null only in platform scope — see its own doc comment).
 */

import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import {
    generateReject,
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import type { TenantCallerContext } from '@types';
import type { PaginatedResult } from '@infrastructure/persistence/create-repository';
import type {
    CreateWebhookSubscriptionRequest,
    UpdateWebhookSubscriptionRequest,
    WebhookSubscription
} from '@types';
import type { WebhookSubscriptionDocument } from '../model';
import { webhookSubscriptionRepository } from '../repository';
import { liveRingEntries, mintRingSecret, removeRingSecret } from '../secrets';
import { getWebhookSubscriptionCap } from '../config';
import { resolveSafeOutboundTarget, SsrfRefusedError } from '@infrastructure/adapters/ssrf-guard';
import { ERROR_CODES } from '@api/error-codes';
import { clearedOrValue } from '@infrastructure/persistence/changes';
import { webhooksAuditActions } from '../audit';

/** A subscription alongside whichever plaintext secrets this call just minted — shown once. */
export interface SubscriptionWithMintedSecrets {
    subscription: WebhookSubscriptionDocument;
    /** Set only by `create` — the ring's first secret. */
    secret?: string;
    /** Set only by `rotateSecret` — a newly added secret. */
    newSecret?: string;
}

/** How long the create/update check may spend resolving the URL's host before refusing it. */
const URL_CHECK_TIMEOUT_MS = 5000;

/**
 * Refuses a subscription URL the delivery-time SSRF guard would refuse anyway — fail fast where
 * the operator is looking (OWASP SSRF: validate on input, and again at connection). The delivery
 * check stays: DNS can change after this one passes.
 *
 * @param url - the address an operator asked deliveries to go to
 * @returns a 422 naming the URL field, or `undefined` when the URL is fine
 */
const refuseUnsafeUrl = (url: string): Promise<ResponseReject | undefined> =>
    resolveSafeOutboundTarget(url, AbortSignal.timeout(URL_CHECK_TIMEOUT_MS))
        .then((): undefined => undefined)
        .catch((error: unknown) => {
            // The caller learns only that the URL was refused: a reason or a resolved address
            // would map the internal network for whoever is probing it. The operator reads both here.
            logger.warn({
                message: 'A webhook URL was refused.',
                reason: error instanceof SsrfRefusedError ? error.reason : 'unverifiable',
                detail: error instanceof Error ? error.message : String(error)
            });
            // A timeout is not an SsrfRefusedError, but it refuses the same way: nothing
            // verified the target, so nothing is subscribed to it.
            return generateReject(422, [
                {
                    code: ERROR_CODES.VALIDATION_ERROR,
                    message: t('webhooks.url-refused'),
                    details: { field: 'url' }
                }
            ]);
        });

/** List this tenant's subscriptions, newest first, optionally filtered by `enabled`. */
export const list = (
    context: TenantCallerContext,
    filters: { enabled?: boolean; page?: unknown; pageSize?: unknown }
): Promise<PaginatedResult<WebhookSubscription>> => {
    const scope: Record<string, unknown> = { tenant: context.caller.tenantId };
    if (filters.enabled !== undefined) scope.enabled = filters.enabled;
    // No `searchable` spec on this repository (the admin list has no free-text filter — see
    // `../repository.ts`), so `scope` is the whole query; `filters` only carries page/pageSize.
    return webhookSubscriptionRepository.search(filters, scope, { createdAt: -1, _id: -1 });
};

/**
 * This subscription's position among its tenant's rows, oldest first. `_id` is total-ordered
 * across the collection (Mongo's ObjectId embeds an insertion-time-ish counter), so counting every
 * row at-or-before this one's `_id` gives a rank that is stable even for two creates that raced
 * past the same pre-check below — whichever insert lands with the higher rank is the one over cap,
 * regardless of which caller's request reached this line first.
 */
const insertionRank = (
    subscriptionId: WebhookSubscriptionDocument['_id'],
    tenant: string
): Promise<number> =>
    webhookSubscriptionRepository.count({ tenant, _id: { $lte: subscriptionId } });

/**
 * Undo a create that turned out to be over cap once ranked against whatever else just landed —
 * the follow-up half of the race guard `create` below relies on.
 */
const rollbackOverCap = (subscription: WebhookSubscriptionDocument): Promise<ResponseReject> =>
    webhookSubscriptionRepository
        .deleteOne(subscription)
        .then(() => generateReject(422, [t('webhooks.subscription-cap-reached')]));

/**
 * Finish a create once the row is written: reject and roll it back if it lands over cap once
 * ranked against whatever else just landed, otherwise audit the creation and hand back the
 * envelope.
 *
 * `async`/`await` over chaining despite the single await, against this repo's usual preference:
 * TypeScript's contextual typing of a `.then` callback does not distribute over the union this
 * returns, and silently narrows to just one branch instead — `await` checks each `return` against
 * the declared type directly and does not have the problem.
 */
const finalizeCreate = async (
    subscription: WebhookSubscriptionDocument,
    plaintext: string,
    tenant: string,
    context: TenantCallerContext
): Promise<ResponseSuccess<SubscriptionWithMintedSecrets> | ResponseReject> => {
    const rank = await insertionRank(subscription._id, tenant);
    if (rank > getWebhookSubscriptionCap()) return rollbackOverCap(subscription);

    recordAudit(context, {
        action: webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_CREATED,
        outcome: 'success',
        target_type: 'webhook_subscription',
        target_id: String(subscription._id)
    });
    return generateSuccess({ subscription, secret: plaintext }, 201);
};

/**
 * Create a subscription. Mints the ring's first secret and hands the plaintext back once — the
 * only response that ever carries it (see `openapi.yaml`'s `WebhookSubscriptionCreated`).
 *
 * The cap is enforced twice: a `count` before the insert rejects the common case (already over
 * cap, nothing racing) without writing a row at all, and {@link insertionRank} after the insert
 * closes the actual race — two callers both reading a `count` just under the cap can both pass
 * this first check and both insert, but only `getWebhookSubscriptionCap()` of the resulting rows
 * can ever rank within it, so exactly one guard's-worth of rows survives regardless of how many
 * creates land in the same instant.
 *
 * @returns a 422 rejection once this tenant is at `getWebhookSubscriptionCap()` — the fan-out
 *   guard this module exists for: one event x N subscriptions is N deliveries.
 */
export const create = (
    body: CreateWebhookSubscriptionRequest,
    context: TenantCallerContext
): Promise<ResponseSuccess<SubscriptionWithMintedSecrets> | ResponseReject> => {
    const tenant = context.caller.tenantId;

    return webhookSubscriptionRepository.count({ tenant }).then(async (count) => {
        if (count >= getWebhookSubscriptionCap())
            return generateReject(422, [t('webhooks.subscription-cap-reached')]);

        const refusal = await refuseUnsafeUrl(body.url);
        if (refusal) return refusal;

        const { entry, plaintext } = mintRingSecret();
        // A pointer, not a copy: whoever's email the auto-disable notice reaches is resolved fresh
        // at send time (`services/attempt.ts#notifyOwnerOfAutoDisable`), off this id — never stored
        // here. `context.caller.id` absent (a stranger, never reachable through this tenant-scoped
        // route in practice) leaves nobody to notify later.
        return webhookSubscriptionRepository
            .create({
                tenant,
                url: body.url,
                description: body.description,
                eventTypes: body.eventTypes,
                ownerUserId: context.caller.id ?? undefined,
                secrets: [entry]
            })
            .then((subscription) => finalizeCreate(subscription, plaintext, tenant, context));
    });
};

/**
 * Update a subscription's state: any of url/description/eventTypes/enabled. The secret ring is
 * never touched here — see {@link rotateSecret}/{@link removeSecret}.
 *
 * @returns a 404 outside this tenant's subscriptions
 */
export const update = (
    id: string,
    body: UpdateWebhookSubscriptionRequest,
    context: TenantCallerContext
): Promise<ResponseSuccess<WebhookSubscriptionDocument> | ResponseReject> =>
    webhookSubscriptionRepository
        .findByIdInTenant(id, context.caller.tenantId)
        .then(async (subscription) => {
            if (!subscription) return generateReject(404, [t('generic.error-not-found')]);

            // Only a URL that CHANGES is worth a lookup: an edit to the description must not
            // start failing because the host's DNS is down today.
            if (body.url !== undefined && body.url !== subscription.url) {
                const refusal = await refuseUnsafeUrl(body.url);
                if (refusal) return refusal;
            }

            if (body.url !== undefined) subscription.url = body.url;
            // `null` clears the description — $unset on save.
            if (body.description !== undefined)
                subscription.description = clearedOrValue(body.description);
            if (body.eventTypes !== undefined) subscription.eventTypes = body.eventTypes;
            if (body.enabled !== undefined) {
                // Only a disabled → enabled transition re-arms. `enabled: true` on an already
                // enabled subscription (editing its description, say) must not zero a streak that
                // is still building toward the auto-disable threshold.
                const reArming = !subscription.enabled && body.enabled;
                subscription.enabled = body.enabled;
                if (reArming) {
                    subscription.disabledAt = undefined;
                    subscription.consecutiveFailures = 0;
                }
            }

            return webhookSubscriptionRepository.save(subscription).then((saved) => {
                recordAudit(context, {
                    action: webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_UPDATED,
                    outcome: 'success',
                    target_type: 'webhook_subscription',
                    target_id: id
                });
                return generateSuccess(saved);
            });
        });

/**
 * Add a new secret to the ring, alongside the newest existing one — the ring then carries both
 * until {@link removeSecret} drops the old one, or the overlap window ends. A ring holds at most
 * two: rotating again drops the oldest.
 *
 * @returns a 404 outside this tenant's subscriptions
 */
export const rotateSecret = (
    id: string,
    context: TenantCallerContext
): Promise<ResponseSuccess<SubscriptionWithMintedSecrets> | ResponseReject> =>
    webhookSubscriptionRepository
        .findByIdInTenant(id, context.caller.tenantId)
        .then((subscription) => {
            if (!subscription) return generateReject(404, [t('generic.error-not-found')]);

            const minted = mintRingSecret();
            // Prune what has expired, and keep only the newest survivor beside the new secret:
            // the ring never holds more than two, however often it is rotated.
            subscription.secrets = [
                ...liveRingEntries(subscription.secrets).slice(-1),
                minted.entry
            ];

            return webhookSubscriptionRepository.save(subscription).then((saved) => {
                recordAudit(context, {
                    action: webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_SECRET_ROTATED,
                    outcome: 'success',
                    target_type: 'webhook_subscription',
                    target_id: id
                });
                return generateSuccess({ subscription: saved, newSecret: minted.plaintext });
            });
        });

/**
 * Drop one entry from the ring by id — the other half of a rotation, once every consumer has
 * switched.
 *
 * @returns a 404 outside this tenant's subscriptions, or when `secretId` isn't in this ring; a
 *   422 if removing it would empty the ring
 */
export const removeSecret = (
    id: string,
    secretId: string,
    context: TenantCallerContext
): Promise<ResponseSuccess<WebhookSubscriptionDocument> | ResponseReject> =>
    webhookSubscriptionRepository
        .findByIdInTenant(id, context.caller.tenantId)
        .then((subscription) => {
            if (!subscription) return generateReject(404, [t('generic.error-not-found')]);

            const remaining = removeRingSecret(subscription.secrets, secretId);
            // An id the ring doesn't carry filters out nothing — same length back. Nothing was
            // removed, so this is a 404, not a silent success.
            if (remaining.length === subscription.secrets.length)
                return generateReject(404, [t('generic.error-not-found')]);
            // Never let this empty the ring — a subscription with no secret can never sign a
            // delivery. The schema's own `validate` (`../model.ts`) is the second guard; this is
            // the one that answers 422 instead of a save-time throw.
            if (remaining.length === 0)
                return generateReject(422, [t('webhooks.ring-cannot-be-empty')]);
            subscription.secrets = liveRingEntries(remaining);

            return webhookSubscriptionRepository.save(subscription).then((saved) => {
                recordAudit(context, {
                    action: webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_SECRET_REMOVED,
                    outcome: 'success',
                    target_type: 'webhook_subscription',
                    target_id: id
                });
                return generateSuccess(saved);
            });
        });

/** Permanently remove a subscription. Its delivery log is left in place — see `openapi.yaml`. */
export const remove = (
    id: string,
    context: TenantCallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    webhookSubscriptionRepository
        .findByIdInTenant(id, context.caller.tenantId)
        .then((subscription) => {
            if (!subscription) return generateReject(404, [t('generic.error-not-found')]);

            return webhookSubscriptionRepository.deleteOne(subscription).then(() => {
                recordAudit(context, {
                    action: webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_DELETED,
                    outcome: 'success',
                    target_type: 'webhook_subscription',
                    target_id: id
                });
                return generateSuccess(undefined);
            });
        });
