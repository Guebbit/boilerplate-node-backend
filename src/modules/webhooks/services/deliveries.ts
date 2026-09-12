/**
 * @module
 * The delivery log's two reads-and-a-write: `list` (paged, filterable by subscription/status) and
 * `replay` (re-send one, synchronously, against the subscription's current url and ring).
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
import {
    webhookDeliveryRepository,
    webhookSubscriptionRepository,
    WEBHOOK_DELIVERY_SORT
} from '../repository';
import type { WebhookDeliveryDocument } from '../model';
import { attemptDelivery } from './attempt';
import { webhooksAuditActions } from '../audit';

/** What `GET /webhooks/deliveries` accepts, mirroring the query parameters `openapi.yaml` declares. */
export interface DeliveryListFilters {
    subscriptionId?: string;
    status?: string;
    page?: unknown;
    pageSize?: unknown;
}

/**
 * List this tenant's delivery log, newest first.
 *
 * `filters.subscriptionId`/`status` are remapped to the repository's own filter-bag keys
 * (`subscription`/`status`, see `../repository.ts`'s `deliveryBase` search spec) here rather than
 * in the repository, so the wire's query-parameter name and the collection's own field name may
 * diverge without either the contract or the repository knowing about the other.
 */
export const list = (
    context: TenantCallerContext,
    filters: DeliveryListFilters
): Promise<PaginatedResult<WebhookDeliveryDocument>> =>
    webhookDeliveryRepository.search(
        {
            subscription: filters.subscriptionId,
            status: filters.status,
            page: filters.page,
            pageSize: filters.pageSize
        },
        { tenant: context.caller.tenantId },
        WEBHOOK_DELIVERY_SORT
    );

/**
 * Re-send one delivery: signs and POSTs again, synchronously, against the subscription's CURRENT
 * url and secret ring — never the ones this row was originally attempted with. Updates the same
 * row in place, sharing {@link attemptDelivery}'s own bookkeeping with the queued path rather than
 * bumping `attempt` here first: a replay is counted exactly like a real attempt at whatever ordinal
 * the row already holds — one step forward on a failure with backoff tiers left, unchanged on
 * success or exhaustion. A caller-side bump on top of that would double-count the one real HTTP
 * attempt this makes.
 *
 * @returns a 404 outside this tenant's log, or when the subscription itself no longer exists
 */
export const replay = (
    id: string,
    context: TenantCallerContext
): Promise<ResponseSuccess<WebhookDeliveryDocument> | ResponseReject> =>
    webhookDeliveryRepository.findById(id).then((delivery) => {
        if (delivery?.tenant !== context.caller.tenantId)
            return generateReject(404, [t('generic.error-not-found')]);

        return webhookSubscriptionRepository
            .findById(String(delivery.subscriptionId))
            .then((subscription) => {
                if (!subscription)
                    return generateReject(404, [t('webhooks.subscription-not-found')]);

                return attemptDelivery(delivery, subscription).then((updated) => {
                    emitAuditEvent(
                        buildAuditEvent(context, {
                            action: webhooksAuditActions.ADMIN_WEBHOOK_DELIVERY_REPLAYED,
                            outcome: 'success',
                            target_type: 'webhook_delivery',
                            target_id: id
                        })
                    );
                    return generateSuccess(updated);
                });
            });
    });
