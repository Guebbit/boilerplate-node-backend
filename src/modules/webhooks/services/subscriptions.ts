/**
 * @module
 * Subscription CRUD: list, create (mints the ring's first secret), update (fields plus the two
 * secret-ring actions), remove. Tenant-scoped throughout — every read and write narrows to
 * `context.caller.tenantId`, which a `webhooks.read`/`webhooks.manage` caller always carries (both
 * keys are `scope: tenant` in `shared/authorization-keys.yaml`, and `Caller.tenantId` is null only
 * in platform scope — see its own doc comment).
 */

import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import type { TenantCallerContext } from '@infrastructure/http/request';
import type { PaginatedResult } from '@infrastructure/persistence/create-repository';
import type { CreateWebhookSubscriptionRequest, UpdateWebhookSubscriptionRequest } from '@types';
import type { WebhookSubscriptionDocument } from '../model';
import { webhookSubscriptionRepository } from '../repository';
import { mintRingSecret, removeRingSecret } from '../secrets';
import { getWebhookSubscriptionCap } from '../config';
import { webhooksAuditActions } from '../audit';

/** A subscription alongside whichever plaintext secrets this call just minted — shown once. */
export interface SubscriptionWithMintedSecrets {
    subscription: WebhookSubscriptionDocument;
    /** Set only by `create` — the ring's first secret. */
    secret?: string;
    /** Set only by `update` when `rotateSecret: true` — a newly added secret. */
    newSecret?: string;
}

/** List this tenant's subscriptions, newest first, optionally filtered by `enabled`. */
export const list = (
    context: TenantCallerContext,
    filters: { enabled?: boolean; page?: unknown; pageSize?: unknown }
): Promise<PaginatedResult<WebhookSubscriptionDocument>> => {
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

    emitAuditEvent(
        buildAuditEvent(context, {
            action: webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_CREATED,
            outcome: 'success',
            target_type: 'webhook_subscription',
            target_id: String(subscription._id)
        })
    );
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

    return webhookSubscriptionRepository.count({ tenant }).then((count) => {
        if (count >= getWebhookSubscriptionCap())
            return generateReject(422, [t('webhooks.subscription-cap-reached')]);

        const { entry, plaintext } = mintRingSecret();
        return webhookSubscriptionRepository
            .create({
                tenant,
                url: body.url,
                description: body.description,
                eventTypes: body.eventTypes,
                secrets: [entry]
            } as Partial<WebhookSubscriptionDocument>)
            .then((subscription) => finalizeCreate(subscription, plaintext, tenant, context));
    });
};

/**
 * Update a subscription: any of url/description/eventTypes/enabled, plus the two secret-ring
 * actions (`rotateSecret`, `removeSecretId`) in the same request.
 *
 * @returns a 404 outside this tenant's subscriptions, a 422 if `removeSecretId` would empty the ring
 */
export const update = (
    id: string,
    body: UpdateWebhookSubscriptionRequest,
    context: TenantCallerContext
): Promise<ResponseSuccess<SubscriptionWithMintedSecrets> | ResponseReject> =>
    webhookSubscriptionRepository.findById(id).then((subscription) => {
        if (subscription?.tenant !== context.caller.tenantId)
            return generateReject(404, [t('generic.error-not-found')]);

        if (body.url !== undefined) subscription.url = body.url;
        if (body.description !== undefined) subscription.description = body.description;
        if (body.eventTypes !== undefined) subscription.eventTypes = body.eventTypes;
        if (body.enabled !== undefined) {
            subscription.enabled = body.enabled;
            // Re-arming clears the auto-disable marker and the streak that triggered it — an
            // operator who just re-enabled a subscription should not watch it auto-disable again
            // on the very next failure because of a count from before they looked at it.
            if (body.enabled) {
                subscription.disabledAt = undefined;
                subscription.consecutiveFailures = 0;
            }
        }

        let newSecret: string | undefined;
        if (body.rotateSecret) {
            const minted = mintRingSecret();
            subscription.secrets.push(minted.entry);
            newSecret = minted.plaintext;
        }
        if (body.removeSecretId) {
            const remaining = removeRingSecret(subscription.secrets, body.removeSecretId);
            // Never let a rotation empty the ring — a subscription with no secret can never sign
            // a delivery. The schema's own `validate` (`../model.ts`) is the second guard; this is
            // the one that answers 422 instead of a save-time throw.
            if (remaining.length === 0)
                return generateReject(422, [t('webhooks.ring-cannot-be-empty')]);
            subscription.secrets = remaining;
        }

        return webhookSubscriptionRepository.save(subscription).then((saved) => {
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_UPDATED,
                    outcome: 'success',
                    target_type: 'webhook_subscription',
                    target_id: id
                })
            );
            return generateSuccess({ subscription: saved, newSecret });
        });
    });

/** Permanently remove a subscription. Its delivery log is left in place — see `openapi.yaml`. */
export const remove = (
    id: string,
    context: TenantCallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    webhookSubscriptionRepository.findById(id).then((subscription) => {
        if (subscription?.tenant !== context.caller.tenantId)
            return generateReject(404, [t('generic.error-not-found')]);

        return webhookSubscriptionRepository.deleteOne(subscription).then(() => {
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_DELETED,
                    outcome: 'success',
                    target_type: 'webhook_subscription',
                    target_id: id
                })
            );
            return generateSuccess(undefined);
        });
    });
