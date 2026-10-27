/**
 * @module
 * Controller for `GET /webhooks/subscriptions/:id`.
 */

import { tenantCallerContextOf } from '@infrastructure/http/request';
import { createItemController } from '@infrastructure/surfaces/create-item-controller';
import { webhooksService } from '../services';

/**
 * GET /webhooks/subscriptions/:id
 * One subscription of this tenant, with the caller's `actions`. A miss and another shop's id both
 * answer 404.
 */
export const getWebhookSubscription = createItemController({
    entity: 'webhookSubscription',
    notFoundKey: 'generic.error-item-gone',
    fetch: (id, request) => webhooksService.getSubscription(id, tenantCallerContextOf(request))
});
