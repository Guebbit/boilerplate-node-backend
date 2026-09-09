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
import type { CallerContext } from '@infrastructure/http/request';
import type { PaginatedResult } from '@infrastructure/persistence/create-repository';
import type { CreateWebhookSubscriptionRequest, UpdateWebhookSubscriptionRequest } from '@types';
import type { WebhookSubscriptionDocument } from '../model';
import { webhookSubscriptionRepository } from '../repository';
import { mintRingSecret, removeRingSecret } from '../secrets';
import { getWebhookSubscriptionCap } from '../config';
import { webhooksAuditActions } from '../audit';
import { tenantOf } from './context';

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
    context: CallerContext,
    filters: { enabled?: boolean; page?: unknown; pageSize?: unknown }
): Promise<PaginatedResult<WebhookSubscriptionDocument>> => {
    const scope: Record<string, unknown> = { tenant: tenantOf(context) };
    if (filters.enabled !== undefined) scope.enabled = filters.enabled;
    // No `searchable` spec on this repository (the admin list has no free-text filter — see
    // `../repository.ts`), so `scope` is the whole query; `filters` only carries page/pageSize.
    return webhookSubscriptionRepository.search(filters, scope, { createdAt: -1, _id: -1 });
};

/**
 * Create a subscription. Mints the ring's first secret and hands the plaintext back once — the
 * only response that ever carries it (see `openapi.yaml`'s `WebhookSubscriptionCreated`).
 *
 * @returns a 422 rejection once this tenant is at `getWebhookSubscriptionCap()` — the fan-out
 *   guard this module exists for: one event x N subscriptions is N deliveries.
 */
export const create = (
    body: CreateWebhookSubscriptionRequest,
    context: CallerContext
): Promise<ResponseSuccess<SubscriptionWithMintedSecrets> | ResponseReject> => {
    const tenant = tenantOf(context);

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
            .then((subscription) => {
                emitAuditEvent(
                    buildAuditEvent(context, {
                        action: webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_CREATED,
                        outcome: 'success',
                        target_type: 'webhook_subscription',
                        target_id: String(subscription._id)
                    })
                );
                return generateSuccess({ subscription, secret: plaintext }, 201);
            });
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
    context: CallerContext
): Promise<ResponseSuccess<SubscriptionWithMintedSecrets> | ResponseReject> =>
    webhookSubscriptionRepository.findById(id).then((subscription) => {
        if (subscription?.tenant !== tenantOf(context))
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
    context: CallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    webhookSubscriptionRepository.findById(id).then((subscription) => {
        if (subscription?.tenant !== tenantOf(context))
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
