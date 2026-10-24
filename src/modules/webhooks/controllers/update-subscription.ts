/**
 * @module
 * Controllers for `PUT /webhooks/subscriptions/:id` (replace) and `PATCH .../:id` (merge), built
 * on the shared `createUpdateController` factory. Neither verb touches the secret ring or whether
 * the subscription is on — those live on their own action routes (rotate, remove a secret, enable,
 * disable), each with its own controller.
 */

import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { ReplaceWebhookSubscriptionBody, UpdateWebhookSubscriptionBody } from '@api/schemas.zod';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import { webhooksService } from '../services';
import { viewSubscription } from '../services/actions';

/**
 * `PUT` and `PATCH /webhooks/subscriptions/:id` — one handler pair over
 * `webhooksService.updateSubscription`, tenant-scoped throughout.
 */
export const { replace: replaceWebhookSubscription, update: updateWebhookSubscription } =
    createUpdateController({
        versioned: false,
        entity: 'webhookSubscription',
        notFoundKey: 'generic.error-not-found',
        replaceSchema: ReplaceWebhookSubscriptionBody,
        patchSchema: UpdateWebhookSubscriptionBody,
        update: (id, changes, request) =>
            webhooksService.updateSubscription(id, changes, tenantCallerContextOf(request)),
        present: (subscription, request) =>
            viewSubscription(subscription, tenantCallerContextOf(request).caller)
    });
